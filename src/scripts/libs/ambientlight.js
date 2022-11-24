import { html, body, on, off, raf, ctxOptions, Canvas, SafeOffscreenCanvas, requestIdleCallback, setTimeout, wrapErrorHandler, isWatchPageUrl, appendErrorStack, waitForDomElement } from './generic'
import SentryReporter, { parseSettingsToSentry } from './sentry-reporter'
import BarDetection from './bar-detection'
import Settings, { FRAMESYNC_DECODEDFRAMES, FRAMESYNC_DISPLAYFRAMES, FRAMESYNC_VIDEOFRAMES } from './settings'
import Projector2d from './projector-2d'
import ProjectorWebGL from './projector-webgl'
import { WebGLOffscreenCanvas } from './canvas-webgl'
import { contentScript } from './messaging'

const VIEW_DISABLED = 'DISABLED'
const VIEW_DETACHED = 'DETACHED'
const VIEW_SMALL = 'SMALL'
const VIEW_THEATER = 'THEATER'
const VIEW_FULLSCREEN = 'FULLSCREEN'
const VIEW_POPUP = 'POPUP'

const THEME_LIGHT = -1
const THEME_DEFAULT = 0
const THEME_DARK = 1

const baseUrl = document.currentScript?.getAttribute('data-base-url') || ''

export default class Ambientlight {
  barDetection = new BarDetection()
  innerStrength = 2
  lastUpdateSizesChanged = 0

  videoOffset = {}
  srcVideoOffset = {}

  isHidden = true
  isOnVideoPage = true
  showedCompareWarning = false
  getImageDataAllowed = true
  catchedErrors = []

  atTop = true
  p = null
  view = undefined
  immersiveTheater = false
  isFullscreen = false
  isFillingFullscreen = false
  isVideoHiddenOnWatchPage = false
  isVR = false
  isHdr = false
  isControlledByAnotherExtension = false

  lastUpdateStatsTime = 0
  updateStatsInterval = 1000
  frameCountHistory = 5000
  updateStatsFrametimesHistoryMax = 120
  videoFrameCount = 0
  displayFrameRate = 0
  videoFrameRate = 0
  videoFrameRateMeasureStartTime = 0
  videoFrameRateMeasureStartFrame = 0
  ambientlightFrameCount = 0
  ambientlightFrameRate = 0
  ambientlightVideoDroppedFrameCount = 0
  previousFrameTime = 0
  previousDrawTime = 0

  enableMozillaBug1606251Workaround = false
  enableChromiumBug1123708Workaround = false
  enableChromiumBug1092080Workaround = false

  constructor(ytdAppElem, videoElem) {
    return (async function ambientlightConstructor() {
      this.ytdAppElem = ytdAppElem
      this.mastheadElem = ytdAppElem.querySelector('#masthead-container')
      if(!this.mastheadElem) {
        throw new Error(`Cannot find mastheadElem: #masthead-container`)
      }

      this.detectChromiumBug1142112Workaround()
      this.initElems(videoElem)
      this.detectMozillaBug1606251Workaround()
      this.detectChromiumBug1092080Workaround()

      await this.initSettings()
      this.detectChromiumBug1123708Workaround()

      this.initAmbientlightElems()
      this.initBuffersWrapper()
      this.initProjectorBuffers()
      this.recreateProjectors()
      this.initFPSListElem()

      this.initStyles()
      this.updateStyles()

      this.checkGetImageDataAllowed()
      this.initListeners()
      this.initLiveChat() // Depends on this.originalTheme set in initListeners

      if (this.settings.enabled) {
        try {
          await this.enable(true)
        } catch(ex) {
          console.warn('Ambient light for YouTube™ | Failed to enable on launch')
          SentryReporter.captureException(ex)
        }
      }
      
      return this
    }.bind(this))()
  }

  get playerSmallContainerElem() {
    return this.ytdAppElem.querySelector('#player-container-inner')
  }

  get playerTheaterContainerElem() {
    return this.ytdAppElem.querySelector('#player-theater-container')
  }

  get playerTheaterContainerElemFromVideo() {
    return this.videoElem?.closest('#player-theater-container')
  }

  get ytdWatchFlexyElem() {
    if(!this._ytdWatchFlexyElem) this._ytdWatchFlexyElem = this.videoElem?.closest('ytd-watch-flexy, .ytd-page-manager')
    return this._ytdWatchFlexyElem
  }

  get thumbnailOverlayElem() {
    if(!this._thumbnailOverlayElem) this._thumbnailOverlayElem = this.ytdWatchFlexyElem?.querySelector('.ytp-cued-thumbnail-overlay')
    return this._thumbnailOverlayElem
  }

  initElems(videoElem) {
    this.videoPlayerElem = videoElem.closest('.html5-video-player')
    if(!this.videoPlayerElem) {
      throw new Error('Cannot find videoPlayerElem: .html5-video-player')
    }

    this.videoContainerElem = videoElem.closest('.html5-video-container')
    // // Deprecated: videoContainerElem is optional and only used in the videoOverlayEnabled setting
    // if (!this.videoContainerElem) {
    //   throw new Error('Cannot find videoContainerElem: .html5-video-container')
    // }
    
    this.settingsMenuBtnParent = this.videoPlayerElem.querySelector('.ytp-right-controls, .ytp-chrome-controls > *:last-child')
    if(!this.settingsMenuBtnParent) {
      throw new Error('Cannot find settingsMenuBtnParent: .ytp-right-controls, .ytp-chrome-controls > *:last-child')
    }

    this.initVideoElem(videoElem, false)
  }

  initVideoElem(videoElem, initListeners = true) {
    this.videoElem = videoElem
    this.requestVideoFrameCallbackId = undefined
    if(initListeners) this.initVideoListeners()
  }

  // FireFox workaround: Force to rerender the outer blur of the canvasses
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1606251
  detectMozillaBug1606251Workaround() {
    const match = navigator.userAgent.match(/Firefox\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && version < 74) {
      this.enableMozillaBug1606251Workaround = true
    }
  }

  // Chromium workaround: YouTube drops the video quality because the video is dropping frames
  // for about ~2 seconds when requestVideoFrameCallback is used and the video
  // has been scrolled from onscreen to offscreen
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1142112
  detectChromiumBug1142112Workaround() {
    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && HTMLVideoElement.prototype.requestVideoFrameCallback) {
      this.enableChromiumBug1142112Workaround = true
    }
  }

  applyChromiumBug1142112Workaround() {
    if(!this.enableChromiumBug1142112Workaround) return;

    try {
      if(this.videoElem.ambientlightGetVideoPlaybackQuality) return

      Object.defineProperty(this.videoElem, 'ambientlightGetVideoPlaybackQuality', {
        value: this.videoElem.getVideoPlaybackQuality
      })

      this.previousDroppedVideoFrames = 0
      this.droppedVideoFramesCorrection = 0
      let previousGetVideoPlaybackQualityTime = performance.now()
      
      const ambientlight = this
      const videoElem = this.videoElem
      this.videoElem.getVideoPlaybackQuality = function() {
        // Use scoped properties instead of this from here on
        const original = videoElem.ambientlightGetVideoPlaybackQuality()
        let droppedVideoFrames = original.droppedVideoFrames
        if(droppedVideoFrames < ambientlight.previousDroppedVideoFrames) {
          ambientlight.previousDroppedVideoFrames = 0
          ambientlight.droppedVideoFramesCorrection = 0
        }
        // Ignore dropped frames for 2 seconds due to requestVideoFrameCallback dropping frames when the video is offscreen
        if(ambientlight.videoIsHidden || (ambientlight.videoVisibilityChangeTime > previousGetVideoPlaybackQualityTime - 2000)) {
          ambientlight.droppedVideoFramesCorrection += (droppedVideoFrames - ambientlight.previousDroppedVideoFrames)
        }
        ambientlight.previousDroppedVideoFrames = droppedVideoFrames
        droppedVideoFrames = Math.max(0, droppedVideoFrames - ambientlight.droppedVideoFramesCorrection)
        previousGetVideoPlaybackQualityTime = performance.now()
        return {
          corruptedVideoFrames: original.corruptedVideoFrames,
          creationTime: original.creationTime,
          droppedVideoFrames,
          totalVideoFrames: original.totalVideoFrames,
        }
      }
    } catch(ex) {
      console.warn('Ambient light for YouTube™ | applyChromiumBug1142112Workaround error. Continuing ambientlight initialization...')
      SentryReporter.captureException(ex)
    }
  }

  // Chromium workaround: Force to render the blur originating from the canvasses past the browser window
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1123708
  detectChromiumBug1123708Workaround() {
    if(this.settings.webGL) return

    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && version >= 85) {
      this.enableChromiumBug1123708Workaround = true
    }
  }

  // Chromium workaround: drawImage randomly disables antialiasing in the videoOverlay and/or projectors
  // Additional 0.05ms performance impact per clearRect()
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1092080
  detectChromiumBug1092080Workaround() {
    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && version >= 82 && version < 88) {
      this.enableChromiumBug1092080Workaround = true
    }
  }

  initStyles () {
    this.styleElem = document.createElement('style')
    this.styleElem.appendChild(document.createTextNode(''))
    document.head.appendChild(this.styleElem)
  }

  lastVideoElemSrc = ''
  initVideoIfSrcChanged() {
    if(this.lastVideoElemSrc === this.videoElem.src) {
      return false
    }

    this.lastVideoElemSrc = this.videoElem.src
    this.start()

    return true
  }

  initVideoListeners() {
    ////// PLAYER FLOW
    //
    // LEGEND
    //
    // [  Start
    // ]  End
    // *  When drawImage is called
    //
    // FLOWS
    //
    // Start (paused):                                                                      [ *loadeddata -> canplay ]
    // Start (playing):                            [ play    ->                               *loadeddata -> canplay -> *playing ]
    // Start (from previous video):  [ emptied 2x -> play    ->                               *loadeddata -> canplay -> *playing ]
    // Video src change (paused):    [    emptied ->                               *seeked ->  loadeddata -> canplay ]
    // Video src change (playing):   [    emptied -> play                                     *loadeddata -> canplay -> *playing ]
    // Quality change (paused):      [    emptied ->            seeking ->         *seeked ->  loadeddata -> canplay ]
    // Quality change (playing):     [    emptied -> play    -> seeking ->         *seeked ->  loadeddata -> canplay -> *playing ]
    // Seek (paused):                                         [ seeking ->         *seeked ->                canplay ]
    // Seek (playing):                             [ pause   -> seeking -> play -> *seeked ->                canplay -> *playing ]
    // Play:                                                             [ play ->                                      *playing ]
    // Load more data (playing):                   [ waiting ->                                              canplay -> *playing ]
    // End video:  [ pause -> ended ]
    //
    //////
  
    this.videoListeners = this.videoListeners || {
      seeked: async () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        // When the video is paused this is the first event. Else [loadeddata] is first
        if (this.initVideoIfSrcChanged()) return
  
        this.clear() // Always prevent old frame from being drawn
        this.previousPresentedFrames = 0
        // this.videoFrameTimes = []
        // this.frameTimes = []
        this.videoFrameCounts = []
        this.displayFrameCounts = []
        this.ambientlightFrameCounts = []
        this.lastUpdateStatsTime = performance.now()
        await this.optionalFrame()
      },
      loadeddata: () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        // Whent the video is playing this is the first event. Else [seeked] is first
        this.checkGetImageDataAllowed() // Re-check after crossOrigin attribute has been applied
        this.initVideoIfSrcChanged()
      },
      playing: async () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        if (this.videoElem.paused) return // When paused handled by [seeked]
        await this.optionalFrame()
      },
      ended: () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        this.clear()
        this.scheduledNextFrame = false
        this.resetVideoContainerStyle() // Prevent visible video element above player because of the modified style attribute
      },
      emptied: () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        this.clear()
        this.scheduledNextFrame = false
      },
      error: (ex) => {
        console.warn('Ambient light for YouTube™ | Video error:', ex)
        this.clear()
        this.requestVideoFrameCallbackId = undefined
        setTimeout(this.handleVideoError, 1000)
      },
      click: this.settings.onCloseMenu
    }
    for (const name in this.videoListeners) {
      off(this.videoElem, name, this.videoListeners[name])
      on(this.videoElem, name, this.videoListeners[name])
    }

    if(this.videoObserver) {
      this.videoObserver.disconnect()
    }
    this.videoIsHidden = false // IntersectionObserver is always executed at least once when the observation starts
    if(!this.videoObserver) {
      this.videoObserver = new IntersectionObserver(
        wrapErrorHandler((entries, observer) => {
          if(!window.ambientlight) return
          if(window.ambientlight !== this) {
            observer.disconnect() // Disconnect, because ambientlight crashed on initialization and created a new instance
            return
          }

          for (const entry of entries) {
            if(this.videoElem !== entry.target) {
              this.videoObserver.unobserve(event.target) // video is detached and a new one was created
              continue
            }
            this.videoIsHidden = (entry.intersectionRatio === 0)
            this.videoVisibilityChangeTime = performance.now()
            this.videoElem.getVideoPlaybackQuality() // Correct dropped frames
          }
        }, true),
        {
          rootMargin: '-70px 0px 0px 0px', // masthead height (56px) + additional pixel to be safe
          threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      )
    }
    this.videoObserver.observe(this.videoElem)

    this.applyChromiumBug1142112Workaround()
  }

  handleVideoError = () => {
    this.initVideoListeners()
    if(!this.videoElem.paused) {
      this.videoListeners.playing()
    }
  }

  updateVideoPlayerSize = () => {
    try {
      this.videoPlayerElem.setSize()
      this.videoPlayerElem.setInternalSize()
      this.sizesChanged = true
    } catch(ex) {
      console.warn('Ambient light for YouTube™ | Failed to resize the video player')
    }
  }

  initListeners() {
    this.initVideoListeners()

    if(this.settings.webGL) {
      this.projector.handleRestored = async (isControlledLose) => {
        this.buffersCleared = true
        this.sizesChanged = true
        if(!isControlledLose) {
          this.requestVideoFrameCallbackId = undefined
          this.videoElem.currentTime = this.videoElem.currentTime // Trigger video draw call
        }
        await this.optionalFrame()
      }
    }

    on(document, 'visibilitychange', this.handleDocumentVisibilityChange, false)
    on(document, 'fullscreenchange', function fullscreenchange() {
      this.updateSizes()
    }.bind(this), false)

    on(document, 'keydown', this.handleKeyDown)

    const resizeTooSmall = (pRect, rect) => (
      Math.abs(rect.x - (pRect?.x || 0)) <= 2 &&
      Math.abs(rect.y - (pRect?.y || 0)) <= 2 &&
      Math.abs(rect.width - (pRect?.width || 0)) <= 2 &&
      Math.abs(rect.height - (pRect?.height || 0)) <= 2
    )
    // Only triggers when the body width changes because the height is 0
    let previousBodyRect;
    this.bodyResizeObserver = new ResizeObserver(function bodyResize(e) {
      if(!this.settings.enabled || !this.isOnVideoPage) return
      
      const rect = e[0].contentRect
      if(resizeTooSmall(previousBodyRect, rect)) return
      
      previousBodyRect = rect
      this.resize() // Because the video position could be shifted
    }.bind(this))
    this.bodyResizeObserver.observe(document.body)

    // Makes sure the player size is recalculated after the scrollbar has been hidden
    // and the styles are recalculated.
    // YouTube does this incorrect by calculating it before the styles are recalculated.
    let previousVideoPlayerRect;
    this.videoPlayerResizeObserver = new ResizeObserver(async function videoPlayerResize(e) {
      if(!this.settings.enabled || !this.isOnVideoPage) {
        previousVideoPlayerRect = undefined
        return
      }

      const rect = e[0].contentRect
      if(resizeTooSmall(previousVideoPlayerRect, rect)) return
      
      // if(!this.isFullscreen) {
      //   try {
      //     await new Promise(resolve => raf(resolve)) // Wait for all layout style recalculations
      //     this.videoPlayerElem.setSize()
      //     this.videoPlayerElem.setInternalSize()
      //     await new Promise(resolve => raf(resolve)) // Wait for all layout style recalculations
      //     this.sizesChanged = true
      //   } catch(ex) {
      //     console.warn('Ambient light for YouTube™ | Failed to resize the video player')
      //   }
      // }
      if(!this.settings.enabled) return

      previousVideoPlayerRect = rect
      this.resize(this.videoPlayerResizeToFullscreen 
        ? 0
        : this.videoPlayerResizeFromFullscreen
          ? 0
          : 0
      )
      this.videoPlayerResizeFromFullscreen = false
      this.videoPlayerResizeToFullscreen = false
    }.bind(this))
    this.videoPlayerResizeObserver.observe(this.videoPlayerElem)
    
    // // Deprecated: Moved to videoPlayerResizeObserver
    // this.videoContainerResizeObserver = new ResizeObserver(function videoContainerResize() {
    //   this.resize()
    // }.bind(this))
    // this.videoContainerResizeObserver.observe(this.videoContainerElem)

    let previousVideoRect;
    this.videoResizeObserver = new ResizeObserver(function videoResize(e) {
      if(!this.settings.enabled || !this.isOnVideoPage) {
        previousVideoRect = undefined
        return
      }

      const rect = e[0].contentRect
      if(resizeTooSmall(previousVideoRect, rect)) {
        return
      }
      
      previousVideoRect = rect
      this.resize()
    }.bind(this))
    this.videoResizeObserver.observe(this.videoElem)

    // Fix YouTube bug: focus on video element without scrolling to the top
    on(this.videoElem, 'focus', this.handleVideoFocus, true)

    // Appearance (theme) changes initiated by the YouTube menu
    this.originalTheme = this.isDarkTheme() ? 1 : -1
    on(document, 'yt-action', (e) => {
      if (!this.settings.enabled) return
      const name = e?.detail?.actionName
      if (name === 'yt-signal-action-toggle-dark-theme-off') {
        this.originalTheme = THEME_LIGHT
        this.updateTheme()
      } else if(name === 'yt-signal-action-toggle-dark-theme-on') {
        this.originalTheme = THEME_DARK
        this.updateTheme()
      } else if(name === 'yt-signal-action-toggle-dark-theme-device') {
        this.originalTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? THEME_DARK : THEME_LIGHT
        this.updateTheme()
      } else if(name === 'yt-forward-redux-action-to-live-chat-iframe') {
        if (!this.isOnVideoPage) return
        this.updateLiveChatTheme()
      }
    }, undefined, undefined, true)
    
    let themeCorrections = 0
    this.themeObserver = new MutationObserver(wrapErrorHandler((a) => {
      if(!this.shouldToggleTheme()) return
      
      themeCorrections++
      this.updateTheme()
      if(themeCorrections === 5) this.themeObserver.disconnect()
    }))
    this.themeObserver.observe(html, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['dark']
    })

    // More reliable way to detect the end screen and other modes in which the video is invisible.
    // Because when seeking to the end the ended event is not fired from the videoElem
    on(this.videoPlayerElem, 'onStateChange', (state) => {
      this.isBuffering = (state === 3)

      if(!this.isBuffering && this.settings.enabled && this.isOnVideoPage)
        this.scheduleNextFrame()
    })
    this.isBuffering = (this.videoPlayerElem.getPlayerState() === 3)

    const videoPlayerObserver = new MutationObserver(wrapErrorHandler(async () => {
      const viewChanged = await this.updateView()
      const videoHiddenChanged = this.updateIsVideoHiddenOnWatchPage()
      if(!viewChanged && !videoHiddenChanged) return

      if(videoHiddenChanged && this.isVideoHiddenOnWatchPage) {
        this.clear()
        this.resetVideoContainerStyle()
        return
      }

      if(viewChanged || (videoHiddenChanged && !this.isVideoHiddenOnWatchPage)) {
        this.optionalFrame()
      }
    }))
  
    videoPlayerObserver.observe(this.videoPlayerElem, {
      attributes: true,
      attributeFilter: ['class']
    })
    if(this.thumbnailOverlayElem) {
      videoPlayerObserver.observe(this.thumbnailOverlayElem, {
        attributes: true,
        attributeFilter: ['style']
      })
    }

    // When the video moves between the small and theater views
    const playerContainersObserver = new MutationObserver(wrapErrorHandler(async (mutationsList) => {
      await this.updateView()
      this.optionalFrame()
    }))
    const playerContainersObserverOptions = {
      childList: true
    }
    
    const playerTheaterContainerElem = this.playerTheaterContainerElem
    if(playerTheaterContainerElem) {
      playerContainersObserver.observe(playerTheaterContainerElem, playerContainersObserverOptions)
    }
    const playerSmallContainerElem = this.playerSmallContainerElem
    if(playerSmallContainerElem) {
      playerContainersObserver.observe(playerSmallContainerElem, playerContainersObserverOptions)
    }

    this.updateView()
  }
  
  updateIsVideoHiddenOnWatchPage = () => {
    const classList = this.videoPlayerElem.classList;
    const hidden = (
      classList.contains('ended-mode') ||
      (classList.contains('unstarted-mode') && !(this.thumbnailOverlayElem?.style?.display !== '')) // Auto-play disabled and Thumbnail poster overlays the video
    )
    if(this.isVideoHiddenOnWatchPage === hidden) return false

    this.isVideoHiddenOnWatchPage = hidden
    this.sizesInvalidated = true
    return true
  }

  delayResizes = true
  resizeDurationThreshold = 300
  resizeDurations = [this.resizeDurationThreshold, this.resizeDurationThreshold, this.resizeDurationThreshold, this.resizeDurationThreshold]

  resizeAfterFrames = 0
  resize = wrapErrorHandler((afterFrames = 0) => {
    if (!this.settings.enabled || !this.isOnVideoPage || this.pendingStart) {
      this.resizeAfterFrames = 0
      if(this.scheduledResize) cancelAnimationFrame(this.scheduledResize)
      this.scheduledResize = undefined
      return
    }

    this.delayResizes = this.delayResizes || this.videoPlayerResizeFromFullscreen || this.videoPlayerResizeToFullscreen
    this.resizeAfterFrames = this.delayResizes ? Math.max(this.resizeAfterFrames, afterFrames) : 0
    
    if(this.scheduledResize) return

    if (this.resizeAfterFrames === 0) {
      this.sizesInvalidated = true
      const start = performance.now()
      this.optionalFrame()
      this.measureResizeDuration(start)
    }

    // Do not resize untill the next animation frame
    this.scheduledResize = raf(() => {
      this.scheduledResize = undefined
      if(this.resizeAfterFrames === 0) return

      this.resizeAfterFrames--
      this.resize()
    })
  })

  measureResizeDuration(start) {
    requestIdleCallback(() => {
      const duration = Math.min(1000, performance.now() - start)
      this.resizeDurations.push(duration)
      if(this.resizeDurations.length > 4) this.resizeDurations.splice(0, 1)
      const averageDuration = this.resizeDurations.reduce((a, b) => a + b) / this.resizeDurations.length
      this.delayResizes = averageDuration >= this.resizeDurationThreshold
    }, { timeout: 1000 })
  }

  handleDocumentVisibilityChange = () => {
    if (!this.settings.enabled || !this.isOnVideoPage) return
    const isPageHidden = document.visibilityState === 'hidden'
    if(this.isPageHidden === isPageHidden) return

    this.isPageHidden = isPageHidden
    if(this.settings.webGL) {
      this.projector.handlePageVisibility(isPageHidden)
    }
    if(document.visibilityState !== 'hidden') return

    this.buffersCleared = true
    this.checkIfNeedToHideVideoOverlay()
  }

  handleKeyDown = (e) => {
    if (!this.isOnVideoPage) return
    if (document.activeElement) {
      const el = document.activeElement
      const tag = el.tagName
      const inputs = ['INPUT', 'SELECT', 'TEXTAREA']
      if (
        inputs.indexOf(tag) !== -1 || 
        (
          el.getAttribute('contenteditable') !== null && 
          el.getAttribute('contenteditable') !== 'false'
        )
      ) {
        return
      }
    }
    if(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return

    this.onKeyPressed(e.key?.toUpperCase())
  }

  handleVideoFocus = () => {
    if (!this.settings.enabled || !this.isOnVideoPage) return

    const startTop = this.view === VIEW_FULLSCREEN ? this.ytdAppElem.scrollTop : window.scrollY
    raf(function handleVideoFocusRaf() {
      const endTop = VIEW_FULLSCREEN ? this.ytdAppElem.scrollTop : window.scrollY
      if(startTop === endTop) return
      
      if(this.view === VIEW_FULLSCREEN) {
        this.ytdAppElem.scrollTop = startTop
      } else {
        window.scrollTo(window.scrollX, startTop)
      }
    }.bind(this))
  }

  onKeyPressed = (key) => {
    if(key === ' ') return

    const keys = this.settings.getKeys()
    if (key === keys.detectHorizontalBarSizeEnabled) // b by default
      this.settings.clickUI('detectHorizontalBarSizeEnabled')
    if (key === keys.detectVerticalBarSizeEnabled)
      this.settings.clickUI('detectVerticalBarSizeEnabled')
    if (key === keys.detectVideoFillScaleEnabled) // w by default
      this.settings.clickUI('detectVideoFillScaleEnabled')
    if (key === keys.enabled) // a by default
      this.toggleEnabled()
  }

  async toggleEnabled(enabled) {
    if(this.pendingStart) return
    enabled = (enabled !== undefined) ? enabled : !this.settings.enabled
    if (enabled) {
      await this.enable()
    } else {
      this.disable()
    }
    this.settings.displayBezelForSetting('enabled')
  }

  checkGetImageDataAllowed(reportUnexpectedChange = false) {
    const isSameOriginVideo = (!!this.videoElem.src && this.videoElem.src.indexOf(location.origin) !== -1)
    const getImageDataAllowed = (!window.chrome || isSameOriginVideo || (!isSameOriginVideo && this.videoElem.crossOrigin))

    // Try to apply the workaround once
    if(this.videoElem.src && !getImageDataAllowed && !this.crossOriginApplied) {
      console.warn(`Ambient light for YouTube™ | Detected cross origin video. Applying workaround... ${this.videoElem.src}, ${this.videoElem.crossOrigin}`)
      this.crossOriginApplied = true
      
      try {
        const currentTime = this.videoElem.currentTime
        this.videoElem.crossOrigin = 'use-credentials'
        this.videoPlayerElem.loadVideoById(this.videoPlayerElem.getVideoData().video_id) // Refreshes auto quality setting range above 480p
        this.videoElem.currentTime = currentTime
      } catch(ex) {
        console.warn(`Ambient light for YouTube™ | Detected cross origin video. Failed to apply workaround...  ${this.videoElem.src}, ${this.videoElem.crossOrigin}`)
      }
    }

    if(this.getImageDataAllowed === getImageDataAllowed) return
    this.getImageDataAllowed = getImageDataAllowed
    this.settings.updateVisibility()
  }

  initAmbientlightElems() {
    this.elem = document.createElement('div')
    this.elem.classList.add('ambientlight')
    body.prepend(this.elem)

    this.topElem = document.createElement('div')
    this.topElem.classList.add('ambientlight__top')
    body.prepend(this.topElem)
    
    this.topElemObserver = new IntersectionObserver(
      wrapErrorHandler((entries, observer) => {
        for (const entry of entries) {
          this.atTop = (entry.intersectionRatio !== 0)
          this.updateAtTop()

          // When the video is filled and paused in fullscreen the ambientlight is out of sync with the video
          if(this.isFillingFullscreen && !this.atTop) {
            this.buffersCleared = true
            this.optionalFrame()
          }
        }
      }, true),
      {
        threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
      }
    )
    this.topElemObserver.observe(this.topElem)

    this.videoShadowElem = document.createElement('div')
    this.videoShadowElem.classList.add('ambientlight__video-shadow')
    this.elem.prepend(this.videoShadowElem)

    this.filterElem = document.createElement('div')
    this.filterElem.classList.add('ambientlight__filter')
    this.elem.prepend(this.filterElem)

    if (this.enableChromiumBug1123708Workaround) {
      this.chromiumBug1123708WorkaroundElem = new Canvas(1, 1, true)
      this.chromiumBug1123708WorkaroundElem.classList.add('ambientlight__chromium-bug-1123708-workaround')
      this.filterElem.prepend(this.chromiumBug1123708WorkaroundElem)
    }
  
    this.clipElem = document.createElement('div')
    this.clipElem.classList.add('ambientlight__clip')
    this.filterElem.prepend(this.clipElem)

    this.projectorsElem = document.createElement('div')
    this.projectorsElem.classList.add('ambientlight__projectors')
    this.clipElem.prepend(this.projectorsElem)
    
    this.projectorListElem = document.createElement('div')
    this.projectorListElem.classList.add('ambientlight__projector-list')
    this.projectorsElem.prepend(this.projectorListElem)

    this.initProjector()
  }

  initProjector = () => {
    if(this.settings.webGL) {
      try {
        this.projector = new ProjectorWebGL(this.projectorListElem, this.initProjectorListeners, this.settings)
      } catch(ex) {
        SentryReporter.captureException(ex)
        this.settings.handleWebGLCrash()
      }
    }

    if(!this.projector) {
      this.projector = new Projector2d(this.projectorListElem, this.initProjectorListeners)
    }
    this.initProjectorListeners()
  }

  initProjectorListeners = () => {
    // Dont draw ambientlight when its not in viewport
    this.isAmbientlightHiddenOnWatchPage = false
    if(this.ambientlightObserver) {
      this.ambientlightObserver.disconnect()
    }
    if(!this.ambientlightObserver) {
      this.ambientlightObserver = new IntersectionObserver(
        wrapErrorHandler((entries, observer) => {
          for (const entry of entries) {
            this.isAmbientlightHiddenOnWatchPage = (entry.intersectionRatio === 0)
            if(this.isAmbientlightHiddenOnWatchPage) continue
            
            this.optionalFrame()
          }
        }, true),
        {
          threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      )
    }
    this.ambientlightObserver.observe(this.projector.boundaryElem)
  }

  initBuffersWrapper() {
    this.buffersWrapperElem = document.createElement('div')
    this.buffersWrapperElem.classList.add('ambientlight__buffers-wrapper')
    this.elem.appendChild(this.buffersWrapperElem)
  }

  initProjectorBuffers() {
    let projectorsBufferElem;
    let projectorsBufferCtx;
    if(this.settings.webGL) {
      try {
        projectorsBufferElem = new WebGLOffscreenCanvas(1, 1, this.settings)
        projectorsBufferCtx = projectorsBufferElem.getContext('2d', ctxOptions)
      } catch(ex) {
        SentryReporter.captureException(ex)
        this.settings.handleWebGLCrash()
      }
    }
    if(!projectorsBufferCtx) {
      projectorsBufferElem = new SafeOffscreenCanvas(1, 1, true)
      projectorsBufferCtx = projectorsBufferElem.getContext('2d', ctxOptions)
    }

    if (projectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(projectorsBufferElem)
    }
    this.projectorBuffer = {
      elem: projectorsBufferElem,
      ctx: projectorsBufferCtx
    }
  }

  async initSettings() {
    this.settings = await new Settings(this, this.settingsMenuBtnParent, this.videoPlayerElem)
    parseSettingsToSentry(this.settings)
  }

  initFPSListElem() {
    if (this.videoSyncedElem && this.videoSyncedElem.isConnected) return

    this.FPSListElem = document.createElement('div')
    this.FPSListElem.classList.add('ambientlight__fps-list')

    this.ambientlightFTElem = document.createElement('div')
    this.ambientlightFTElem.classList.add('ambientlight__ambientlight-ft')
    this.ambientlightFTElem.style.display = 'none'
    this.ambientlightFTLegendElem = document.createElement('div')
    this.ambientlightFTLegendElem.classList.add('ambientlight__ambientlight-ft-legend')
    const ambientlightFTLegendElemNode = document.createTextNode('')
    this.ambientlightFTLegendElem.appendChild(ambientlightFTLegendElemNode)
    this.ambientlightFTElem.append(this.ambientlightFTLegendElem)
    this.FPSListElem.append(this.ambientlightFTElem)

    this.displayFPSElem = document.createElement('div')
    this.displayFPSElem.classList.add('ambientlight__display-fps')
    const displayFPSElemNode = document.createTextNode('')
    this.displayFPSElem.appendChild(displayFPSElemNode)
    this.FPSListElem.append(this.displayFPSElem)

    this.videoFPSElem = document.createElement('div')
    this.videoFPSElem.classList.add('ambientlight__video-fps')
    const videoFPSElemNode = document.createTextNode('')
    this.videoFPSElem.appendChild(videoFPSElemNode)
    this.FPSListElem.append(this.videoFPSElem)

    this.videoDroppedFramesElem = document.createElement('div')
    this.videoDroppedFramesElem.classList.add('ambientlight__video-dropped-frames')
    const videoDroppedFramesElemNode = document.createTextNode('')
    this.videoDroppedFramesElem.appendChild(videoDroppedFramesElemNode)
    this.FPSListElem.append(this.videoDroppedFramesElem)

    this.videoSyncedElem = document.createElement('div')
    this.videoSyncedElem.classList.add('ambientlight__video-synced')
    const videoSyncedElemNode = document.createTextNode('')
    this.videoSyncedElem.appendChild(videoSyncedElemNode)
    this.FPSListElem.append(this.videoSyncedElem)

    this.ambientlightFPSElem = document.createElement('div')
    this.ambientlightFPSElem.classList.add('ambientlight__ambientlight-fps')
    const ambientlightFPSElemNode = document.createTextNode('')
    this.ambientlightFPSElem.appendChild(ambientlightFPSElemNode)
    this.FPSListElem.append(this.ambientlightFPSElem)

    this.ambientlightDroppedFramesElem = document.createElement('div')
    this.ambientlightDroppedFramesElem.classList.add('ambientlight__ambientlight-dropped-frames')
    const ambientlightDroppedFramesElemNode = document.createTextNode('')
    this.ambientlightDroppedFramesElem.appendChild(ambientlightDroppedFramesElemNode)
    this.FPSListElem.append(this.ambientlightDroppedFramesElem)

    this.videoPlayerElem?.prepend(this.FPSListElem)
  }

  initVideoOverlay() {
    const videoOverlayElem = new Canvas(1, 1)
    videoOverlayElem.classList.add('ambientlight__video-overlay')
    this.videoOverlay = {
      elem: videoOverlayElem,
      ctx: videoOverlayElem.getContext('2d', {
        ctxOptions,
        alpha: true
      }),
      isHiddenChangeTimestamp: 0
    }
  }

  initFrameBlending() {
    const previousProjectorsBufferElem = new Canvas(this.projectorBuffer.elem.width, this.projectorBuffer.elem.height, true) 
    if (previousProjectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(previousProjectorsBufferElem)
    }
    this.previousProjectorBuffer = {
      elem: previousProjectorsBufferElem,
      ctx: previousProjectorsBufferElem.getContext('2d', ctxOptions)
    }

    const blendedProjectorsBufferElem = new Canvas(this.projectorBuffer.elem.width, this.projectorBuffer.elem.height, true) 
    if (blendedProjectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(blendedProjectorsBufferElem)
    }
    this.blendedProjectorBuffer = {
      elem: blendedProjectorsBufferElem,
      ctx: blendedProjectorsBufferElem.getContext('2d', ctxOptions)
    }
  }

  initVideoOverlayWithFrameBlending() {
    const videoOverlayBufferElem = new Canvas(this.srcVideoOffset.width, this.srcVideoOffset.height, true) 
    if (videoOverlayBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(videoOverlayBufferElem)
    }
    this.videoOverlayBuffer = {
      elem: videoOverlayBufferElem,
      ctx: videoOverlayBufferElem.getContext('2d', ctxOptions)
    }

    const previousVideoOverlayBufferElem = new Canvas(this.srcVideoOffset.width, this.srcVideoOffset.height, true) 
    if (previousVideoOverlayBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(previousVideoOverlayBufferElem)
    }
    this.previousVideoOverlayBuffer = {
      elem: previousVideoOverlayBufferElem,
      ctx: previousVideoOverlayBufferElem.getContext('2d', ctxOptions)
    }
  }

  resetSettingsIfNeeded() {
    const videoPath = location.search
    if (!this.prevVideoPath || videoPath !== this.prevVideoPath) {
      if (this.settings.horizontalBarsClipPercentageReset) {
        const horizontalBarChanged = this.setHorizontalBars(0)
        const verticalBarChanged = this.setVerticalBars(0)
        if(horizontalBarChanged || verticalBarChanged) {
          this.sizesChanged = true
          this.optionalFrame()
        }
      }
      if (this.settings.detectVideoFillScaleEnabled) {
        this.settings.set('videoScale', 100, true)
      }
    }
    this.prevVideoPath = videoPath
    this.settings.updateHdr()
  }

  setHorizontalBars(percentage) {
    if(this.settings.horizontalBarsClipPercentage === percentage) return false

    this.settings.set('horizontalBarsClipPercentage', percentage, true)
    return true
  }

  setVerticalBars(percentage) {
    if(this.settings.verticalBarsClipPercentage === percentage) return false

    this.settings.set('verticalBarsClipPercentage', percentage, true)
    return true
  }

  recreateProjectors() {
    this.levels = Math.max(2, Math.round((this.settings.spread / this.settings.edge)) + this.innerStrength + 1)
    if(this.projector.recreate) {
      this.projector.recreate(this.levels)
    }
  }

  clear() {
    this.barDetection.clear()

    // Clear canvasses
    const canvasses = []
    if(this.projector?.projectors?.length) {
      canvasses.push(...this.projector.projectors)
    }
    if(this.previousProjectorBuffer) {
      canvasses.push(this.previousProjectorBuffer)
      canvasses.push(this.blendedProjectorBuffer)
    }
    if(this.videoOverlay) {
      canvasses.push(this.videoOverlay)
      if(this.videoOverlayBuffer) {
        canvasses.push(this.videoOverlayBuffer)
        canvasses.push(this.previousVideoOverlayBuffer)
      }
    }
    for (const canvas of canvasses) {
      if(canvas.ctx?.clearRect) {
        canvas.ctx.clearRect(0, 0, canvas.elem.width, canvas.elem.height)
      } else {
        canvas.elem.width = 1;
      }
    }

    // ProjectorWebGL
    if(this.projector?.clearRect) {
      this.projector.clearRect()
    }

    this.buffersCleared = true
    this.checkIfNeedToHideVideoOverlay()
    this.scheduleNextFrame()
  }

  detectVideoFillScale() {
    let videoScale = 100
    if(this.videoElem.offsetWidth && this.videoElem.offsetHeight) {
      if(this.videoPlayerElem) {
        const videoScaleX = (100 - (this.settings.verticalBarsClipPercentage * 2)) / 100
        const videoScaleY = (100 - (this.settings.horizontalBarsClipPercentage * 2)) / 100
        const videoWidth = this.videoElem.offsetWidth * videoScaleX
        const videoHeight = this.videoElem.offsetHeight * videoScaleY
        const containerWidth = this.videoPlayerElem.offsetWidth
        const containerHeight = this.videoPlayerElem.offsetHeight
        const scaleX = containerWidth / videoWidth
        const scaleY = containerHeight / videoHeight

        videoScale = Math.round(Math.min(scaleX, scaleY) * 10000) / 100
        if(isNaN(videoScale)) {
          videoScale = 100
        }
        if(videoScale < 100.5) {
          videoScale = 100
        }
      }
    }
    if(this.settings.videoScale === videoScale) return

    this.settings.set('videoScale', videoScale, true)
  }

  updateView = async () => {
    this.isVR = this.videoPlayerElem?.classList.contains('ytp-webgl-spherical')

    const wasControlledByAnotherExtension = this.isControlledByAnotherExtension
    this.isControlledByAnotherExtension = (
      body.classList.contains('efyt-mini-player') // Enhancer for YouTube
    )
    if(wasControlledByAnotherExtension !== this.isControlledByAnotherExtension) {
      this.sizesChanged = true
    }

    const wasView = this.view
    if(!this.settings.enabled) {
      this.view = VIEW_DISABLED
    } else if(document.contains(this.videoPlayerElem)) {
      if(this.videoPlayerElem.classList.contains('ytp-fullscreen'))
        this.view = VIEW_FULLSCREEN
      else if(this.videoPlayerElem.classList.contains('ytp-player-minimized'))
        this.view = VIEW_POPUP
      else if(
        this.ytdWatchFlexyElem
          ? this.ytdWatchFlexyElem.getAttribute('theater') !== null
          : this.playerTheaterContainerElemFromVideo
      )
        this.view = VIEW_THEATER
      else
        this.view = VIEW_SMALL
    } else {
      this.view = VIEW_DETACHED
    }
    if(wasView === this.view) return false

    const videoPlayerSizeUpdated = this.updateImmersiveMode()

    const isFullscreen = (this.view == VIEW_FULLSCREEN)
    const fullscreenChanged = isFullscreen !== this.isFullscreen
    this.isFullscreen = isFullscreen
    
    if(fullscreenChanged && this.settings.enabled && this.isOnVideoPage) {
      this.videoPlayerResizeFromFullscreen = !this.isFullscreen
      this.videoPlayerResizeToFullscreen = this.isFullscreen
    }

    if(this.isFullscreen) {
      if(this.elem.parentElement !== this.ytdAppElem) {
        this.ytdAppElem.prepend(this.elem)
        this.ytdAppElem.prepend(this.topElem)
      }
    } else {
      if(this.elem.parentElement !== body) {
        body.prepend(this.elem)
        body.prepend(this.topElem)
      }
    }

    // Todo: Set the settings for the specific view
    // if(prevView !== this.view) {
    //   console.log('VIEW CHANGED: ', this.view)
    //   this.getAllSettings()
    // }

    if(!videoPlayerSizeUpdated) raf(() => this.updateVideoPlayerSize()) // Always force youtube to recalculate the size because it caches the size per view without invalidation based on ambient light enabled/disabled

    return true
  }

  isInEnabledView = () => {
    const enableInViews = this.settings.enableInViews
    if(enableInViews === 0) return true

    const enabled = {
      SMALL: enableInViews <= 2,
      THEATER: enableInViews >= 2 && enableInViews <= 4,
      FULLSCREEN: enableInViews >= 4
    }[this.view] || false
    return enabled
  }

  async updateSizes() {
    await this.updateView()

    if(this.settings.detectVideoFillScaleEnabled){
      this.detectVideoFillScale()
    }
    const videoScale = this.settings.videoScale
    const noClipOrScale = (this.settings.horizontalBarsClipPercentage == 0 && this.settings.verticalBarsClipPercentage == 0 && videoScale == 100)

    const videoElemParentElem = this.videoElem.parentNode

    const notVisible = (
      !this.settings.enabled ||
      this.isVR ||
      !videoElemParentElem ||
      !this.videoPlayerElem ||
      !this.isInEnabledView()
    )
    if (notVisible || noClipOrScale) {
      this.resetVideoContainerStyle()
    }
    this.lastUpdateSizesChanged = performance.now()
    if (notVisible) {
      this.hide()
      return false
    }

    this.barsClip = [this.settings.verticalBarsClipPercentage, this.settings.horizontalBarsClipPercentage].map(percentage => percentage / 100)
    this.clippedVideoScale = this.barsClip.map(clip => (1 - (clip * 2)))
    const shouldStyleVideoContainer = !this.isVideoHiddenOnWatchPage && !this.videoElem.ended && !noClipOrScale && !this.isControlledByAnotherExtension
    if (shouldStyleVideoContainer) {
      const top = Math.max(0, parseInt(this.videoElem.style.top) || 0)
      const left = Math.max(0, parseInt(this.videoElem.style.left) || 0)
      const width = Math.max(0, parseInt(this.videoElem.style.width) || 0)
      videoElemParentElem.style.width = `${width}px`
      videoElemParentElem.style.height = this.videoElem.style.height || '100%'
      videoElemParentElem.style.marginBottom = `${-this.videoElem.offsetHeight}px`
      videoElemParentElem.style.overflow = 'hidden'
      videoElemParentElem.style.transform =  `
        translate(${left}px, ${top}px)
        scale(${(videoScale / 100)}) 
        scale(${this.clippedVideoScale[0]}, ${this.clippedVideoScale[1]})
      `
      const VideoClipScale = this.clippedVideoScale.map(scale => Math.round(1000 * (1 / scale)) / 1000)
      videoElemParentElem.style.setProperty('--video-transform', `
        translate(${-left}px, ${-top}px) 
        scale(${VideoClipScale[0]}, ${VideoClipScale[1]})
      `)
    } else {
      this.resetVideoContainerStyle()
    }

    this.videoOffset = this.getElemRect(this.videoElem)
    this.isFillingFullscreen = (
      this.isFullscreen &&
      Math.abs(this.videoOffset.width - window.innerWidth) < 10 &&
      Math.abs(this.videoOffset.height - window.innerHeight) < 10 &&
      noClipOrScale
    )
    
    if (
      this.videoOffset.top === undefined ||
      !this.videoOffset.width ||
      !this.videoOffset.height ||
      !this.videoElem.videoWidth ||
      !this.videoElem.videoHeight
    ) return false //Not ready

    const unscaledWidth = Math.round(this.videoOffset.width / (videoScale / 100))
    const unscaledHeight = Math.round(this.videoOffset.height / (videoScale / 100))
    const unscaledLeft = Math.round(
      (this.videoOffset.left + window.scrollX) - 
      ((unscaledWidth - this.videoOffset.width) / 2)
    )
    const unscaledTop = Math.round(
      this.videoOffset.top - 
      ((unscaledHeight - this.videoOffset.height) / 2)
    )

    this.projectorsElem.style.left = `${unscaledLeft}px`
    this.projectorsElem.style.top = `${unscaledTop - 1}px`
    this.projectorsElem.style.width = `${unscaledWidth}px`
    this.projectorsElem.style.height = `${unscaledHeight}px`
    this.projectorsElem.style.transform = `
      scale(${(videoScale / 100)}) 
      scale(${this.clippedVideoScale[0]}, ${this.clippedVideoScale[1]})
    `
    
    if(this.settings.videoShadowOpacity != 0 && this.settings.videoShadowSize != 0) {
      this.videoShadowElem.style.display = 'block'
      this.videoShadowElem.style.left = `${unscaledLeft}px`
      this.videoShadowElem.style.top = `${unscaledTop}px`
      this.videoShadowElem.style.width = `${unscaledWidth * this.clippedVideoScale[0]}px`
      this.videoShadowElem.style.height = `${(unscaledHeight * this.clippedVideoScale[1])}px`
      this.videoShadowElem.style.transform = `
        translate3d(0,0,0)
        translate(${(unscaledWidth * this.barsClip[0])}px, ${(unscaledHeight * this.barsClip[1])}px)
        scale(${(videoScale / 100)})
      `
    } else {
      this.videoShadowElem.style.display = ''
    }

    const contrast = this.settings.contrast + (this.isHdr ? this.settings.hdrContrast - 100 : 0)
    const brightness = this.settings.brightness + (this.isHdr ? this.settings.hdrBrightness - 100 : 0)
    const saturation = this.settings.saturation + (this.isHdr ? this.settings.hdrSaturation - 100 : 0)
    this.filterElem.style.filter = `
      ${(!this.settings.webGL && blur != 0) ? `blur(${Math.round(this.videoOffset.height * .0025 * this.settings.blur)}px)` : ''}
      ${(contrast != 100) ? `contrast(${contrast}%)` : ''}
      ${(brightness != 100) ? `brightness(${brightness}%)` : ''}
      ${(saturation != 100) ? `saturate(${saturation}%)` : ''}
    `.trim()

    this.srcVideoOffset = {
      top: this.videoOffset.top,
      width: this.videoElem.videoWidth,
      height: this.videoElem.videoHeight
    }

    let pScale;
    if(this.settings.webGL) {
      const pMinSize = ((this.settings.resolution || 25) / 100) * ((this.settings.blur >= 20)
        ? 128
        : ((this.settings.blur >= 10)
          ? 192
          : 256
        ))
      pScale = Math.min(1, Math.max(pMinSize / this.srcVideoOffset.width, pMinSize / this.srcVideoOffset.height))
    } else {
      // A size of 512 videoWidth/videoHeight is required to prevent pixel flickering because CanvasContext2D uses no mipmaps
      // A CanvasContext2D size of > 256 is required to enable GPU acceleration in Chrome
      const pMinSize = Math.max(257, Math.min(512, this.srcVideoOffset.width, this.srcVideoOffset.height))
      pScale = Math.max(pMinSize / this.srcVideoOffset.width, pMinSize / this.srcVideoOffset.height)
    }
    this.p = {
      w: Math.ceil(this.srcVideoOffset.width * pScale),
      h: Math.ceil(this.srcVideoOffset.height * pScale)
    }
    this.projector.resize(this.p.w, this.p.h)

    if(this.settings.webGL) {
      if(this.projector.webGLVersion === 1) {
        const pbSize = Math.min(512, Math.max(this.srcVideoOffset.width, this.srcVideoOffset.height))
        const pbSizePowerOf2 = Math.pow(2, 1 + Math.ceil(Math.log(pbSize / 2) / Math.log(2))) // projectorBuffer size must always be a power of 2 for WebGL1 mipmap generation
        this.projectorBuffer.elem.width = pbSizePowerOf2
        this.projectorBuffer.elem.height = pbSizePowerOf2
      } else {
        const resolutionScale = (this.settings.detectHorizontalBarSizeEnabled || this.settings.detectVerticalBarSizeEnabled) ? 1 : ((this.settings.resolution || 25) / 100)
        const pbMinSize = resolutionScale * 512
        const pbScale = Math.min(1, Math.max(pbMinSize / this.srcVideoOffset.width, pbMinSize / this.srcVideoOffset.height))
        this.projectorBuffer.elem.width = this.srcVideoOffset.width * pbScale
        this.projectorBuffer.elem.height = this.srcVideoOffset.height * pbScale
      }
    } else {
      this.projectorBuffer.elem.width = this.p.w
      this.projectorBuffer.elem.height = this.p.h
    }

    const frameBlending = this.settings.frameBlending
    if (frameBlending) {
      if(!this.previousProjectorBuffer || !this.blendedProjectorBuffer) {
        this.initFrameBlending()
      }
      this.previousProjectorBuffer.elem.width = this.projectorBuffer.elem.width
      this.previousProjectorBuffer.elem.height = this.projectorBuffer.elem.height
      this.blendedProjectorBuffer.elem.width = this.projectorBuffer.elem.width
      this.blendedProjectorBuffer.elem.height = this.projectorBuffer.elem.height
    }
    const videoOverlayEnabled = this.settings.videoOverlayEnabled
    const videoOverlay = this.videoOverlay
    if (videoOverlayEnabled && !videoOverlay) {
      this.initVideoOverlay()
    }
    if (videoOverlayEnabled && frameBlending && !this.previousVideoOverlayBuffer) {
      this.initVideoOverlayWithFrameBlending()
    }
    if (videoOverlayEnabled)
      this.checkIfNeedToHideVideoOverlay()

    if (videoOverlayEnabled && videoOverlay && !videoOverlay.elem.parentNode) {
      if(this.videoContainerElem) {
      this.videoContainerElem.appendChild(videoOverlay.elem)
      } else {
        if(!this.videoContainerElemMissingThrown) {
          SentryReporter.captureException(new Error('VideoOverlayEnabled but the .html5-video-container element does not exist'))
          this.videoContainerElemMissingThrown = true
        }
        this.videoContainerElemMissingWarning = true
        this.settings.setWarning('Unable to sync the video with the ambient light. The html5-video-container element does not exist on the page. This is likely due to a update of the YouTube design. This will probably soon be fixed in a new version.')
      }
    } else if (!videoOverlayEnabled && videoOverlay && videoOverlay.elem.parentNode) {
      videoOverlay.elem.parentNode.removeChild(videoOverlay.elem)
    } else if(this.videoContainerElemMissingWarning) {
      this.settings.setWarning('')
      this.videoContainerElemMissingWarning = false
    }

    if (videoOverlayEnabled && videoOverlay) {
      videoOverlay.elem.setAttribute('style', this.videoElem.getAttribute('style'))
      videoOverlay.elem.width = this.srcVideoOffset.width
      videoOverlay.elem.height = this.srcVideoOffset.height

      if (frameBlending) {
        this.videoOverlayBuffer.elem.width = this.srcVideoOffset.width
        this.videoOverlayBuffer.elem.height = this.srcVideoOffset.height

        this.previousVideoOverlayBuffer.elem.width = this.srcVideoOffset.width
        this.previousVideoOverlayBuffer.elem.height = this.srcVideoOffset.height
      }
    }

    this.resizeCanvasses()
    this.initFPSListElem()

    this.sizesChanged = false
    this.buffersCleared = true
    return true
  }

  resetVideoContainerStyle() {
    const videoContainer = this.videoElem.parentElement
    if (videoContainer) {
      videoContainer.style.transform = ''
      videoContainer.style.overflow = ''
      videoContainer.style.height = ''
      videoContainer.style.marginBottom = ''
      videoContainer.style.setProperty('--video-transform', '')
    }
  }

  updateStyles() {
    this.mastheadElem.classList.toggle('yta-ambientlight-header-shadow', this.settings.headerShadowEnabled)

    // Fill transparency
    let fillOpacity = this.settings.surroundingContentFillOpacity
    fillOpacity = (fillOpacity !== 10) ? (fillOpacity / 100) : ''
    document.body.style.setProperty('--ambientlight-fill-opacity', fillOpacity)
    

    // Images transparency
    let imageOpacity = this.settings.surroundingContentImagesOpacity
    imageOpacity = (imageOpacity !== 100) ? (imageOpacity / 100) : ''
    document.body.style.setProperty('--ambientlight-image-opacity', imageOpacity)


    // Content shadow
    const textAndBtnOnly = this.settings.surroundingContentTextAndBtnOnly
    const shadowSize = this.settings.surroundingContentShadowSize / 5
    const shadowOpacity = this.settings.surroundingContentShadowOpacity / 100

    // All
    const getFilterShadow = (color) => (shadowSize && shadowOpacity) 
      ? (
        (shadowOpacity > .5) 
        ? `
          drop-shadow(0 0 ${shadowSize}px rgba(${color},${shadowOpacity})) 
          drop-shadow(0 0 ${shadowSize}px rgba(${color},${shadowOpacity}))
        `
        : `drop-shadow(0 0 ${shadowSize}px rgba(${color},${shadowOpacity * 2}))`
      )
      : ''
    document.body.style.setProperty(`--ambientlight-filter-shadow`, (!textAndBtnOnly ? getFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambientlight-filter-shadow-inverted`, (!textAndBtnOnly ? getFilterShadow('255,255,255') : ''))
    
    // Text and buttons only
    document.body.style.setProperty(`--ambientlight-button-shadow`, (textAndBtnOnly ? getFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambientlight-button-shadow-inverted`, (textAndBtnOnly ? getFilterShadow('255,255,255') : ''))
    const getTextShadow = (color) => (shadowSize && shadowOpacity) 
      ? `
        rgba(${color},${shadowOpacity}) 0 0 ${shadowSize * 2}px,
        rgba(${color},${shadowOpacity}) 0 0 ${shadowSize * 2}px
      `
      : ''
    document.body.style.setProperty('--ambientlight-text-shadow', (textAndBtnOnly ? getTextShadow('0,0,0') : ''))
    document.body.style.setProperty('--ambientlight-text-shadow-inverted', (textAndBtnOnly ? getTextShadow('255,255,255') : ''))


    // Video shadow
    const videoShadowSize = parseFloat(this.settings.videoShadowSize, 10) / 2 + Math.pow(this.settings.videoShadowSize / 5, 1.77) // Chrome limit: 250px | Firefox limit: 100px
    const videoShadowOpacity = this.settings.videoShadowOpacity / 100
    
    document.body.style.setProperty('--ambientlight-video-shadow-background', 
      (videoShadowSize && videoShadowOpacity) ? `rgba(0,0,0,${videoShadowOpacity})` : '')
    document.body.style.setProperty('--ambientlight-video-shadow-box-shadow', 
      (videoShadowSize && videoShadowOpacity)
        ? `
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px,
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px
        `
        : '')


    // Video scale
    document.body.style.setProperty('--ambientlight-html5-video-player-overflow', 
      (this.settings.videoScale > 100) ?  'visible' : '')


    // Debanding
    const debandingStrength = parseFloat(this.settings.debandingStrength)
    const noiseImageIndex = (debandingStrength > 75) ? 3 : (debandingStrength > 50) ? 2 : 1
    const noiseOpacity =  debandingStrength / ((debandingStrength > 75) ? 100 : (debandingStrength > 50) ? 75 : 50)

    document.body.style.setProperty('--ambientlight-debanding-content', 
      debandingStrength ? `''` : '')
    document.body.style.setProperty('--ambientlight-debanding-background', 
      debandingStrength ? `url('${baseUrl}images/noise-${noiseImageIndex}.png')` : '')
    document.body.style.setProperty('--ambientlight-debanding-opacity', 
      debandingStrength ? noiseOpacity : '')
  }

  resizeCanvasses() {
    if (this.canvassesInvalidated) {
      this.recreateProjectors()
      this.canvassesInvalidated = false
    }

    const projectorSize = {
      w: Math.round(this.p.w * this.clippedVideoScale[0]),
      h: Math.round(this.p.h * this.clippedVideoScale[1])
    }
    const ratio = (this.p.w > this.p.h) ?
      {
        x: (this.p.w / projectorSize.w),
        y: (this.p.w / projectorSize.w) * (projectorSize.w / projectorSize.h)
      } : {
        x: (this.p.h / projectorSize.h) * (projectorSize.h / projectorSize.w),
        y: (this.p.h / projectorSize.h)
      }
    const lastScale = {
      x: 1,
      y: 1
    }

    //To prevent 0x0 sized canvas elements causing a GPU memory leak
    const minScale = {
      x: 1/projectorSize.w,
      y: 1/projectorSize.h
    }

    const scaleStep = this.settings.edge / 100
    const scales = []
    for (let i = 0; i < this.levels; i++) {
      const pos = i - this.innerStrength
      let scaleX = 1
      let scaleY = 1

      if (pos > 0) {
        scaleX = 1 + ((scaleStep * ratio.x) * pos)
        scaleY = 1 + ((scaleStep * ratio.y) * pos)
      }

      if (pos < 0) {
        scaleX = 1 - ((scaleStep * ratio.x) * -pos)
        scaleY = 1 - ((scaleStep * ratio.y) * -pos)
        if (scaleX < 0) scaleX = 0
        if (scaleY < 0) scaleY = 0
      }
      lastScale.x = scaleX
      lastScale.y = scaleY
      
      scales.push({
        x: Math.max(minScale.x, scaleX),
        y: Math.max(minScale.y, scaleY)
      })
    }

    this.projector.rescale(scales, lastScale, projectorSize, this.barsClip, this.settings)
  }

  updatedSizesChanged = false
  updateSizesChanged(checkPosition) {
    if(this.updatedSizesChanged) {
      return
    }

    this.sizesChanged = this.sizesChanged || this.getSizesChanged(checkPosition)
    this.lastUpdateSizesChanged = performance.now()
    this.sizesInvalidated = false

    this.updatedSizesChanged = true
    raf(() => {
      this.updatedSizesChanged = false
    })
  }

  getSizesChanged(checkPosition = true) {
    //Resized
    if (this.previousEnabled !== this.settings.enabled) {
      this.previousEnabled = this.settings.enabled
      return true
    }

    //Auto quality moved up or down
    if (this.srcVideoOffset.width !== this.videoElem.videoWidth
      || this.srcVideoOffset.height !== this.videoElem.videoHeight) {
        return true
    }

    if (this.settings.videoOverlayEnabled && this.videoOverlay && this.videoElem.getAttribute('style') !== this.videoOverlay.elem.getAttribute('style')) {
      return true
    }
    
    const noClipOrScale = (
      this.settings.horizontalBarsClipPercentage == 0 &&
      this.settings.verticalBarsClipPercentage == 0 &&
      this.settings.videoScale == 100
    )
    if(!noClipOrScale) {
      const videoElemParentElem = this.videoElem.parentElement
      if(videoElemParentElem) {
        const videoTransform = videoElemParentElem.style.getPropertyValue('--video-transform')
        const left = Math.max(0, parseInt(this.videoElem.style.left) || 0)
        const top = Math.max(0, parseInt(this.videoElem.style.top) || 0)
        const scaleX = (Math.round(1000 * (1 / this.clippedVideoScale[0])) / 1000)
        const scaleY = (Math.round(1000 * (1 / this.clippedVideoScale[1])) / 1000)
        if(
          videoTransform.indexOf(`translate(${-left}px, ${-top}px)`) === -1 ||
          videoTransform.indexOf(`scale(${scaleX}, ${scaleY})`) === -1
        ) {
          return true
        }
      }
    }

    if(checkPosition) {
      const projectorsElemRect = this.getElemRect(this.projectorsElem)
      const videoElemRect = this.getElemRect(this.videoElem)
      const topExtraOffset = this.settings.horizontalBarsClipPercentage ? (videoElemRect.height * (this.settings.horizontalBarsClipPercentage / 100)) : 0
      const leftExtraOffset = this.settings.verticalBarsClipPercentage ? (videoElemRect.width * (this.settings.verticalBarsClipPercentage / 100)) : 0
      const expectedProjectorsRect = {
        width: videoElemRect.width - (leftExtraOffset * 2),
        height: videoElemRect.height - (topExtraOffset * 2),
        top: videoElemRect.top + topExtraOffset,
        left: videoElemRect.left + leftExtraOffset
      }
      if (
        Math.abs(projectorsElemRect.height - expectedProjectorsRect.height) > 1 ||
        Math.abs(projectorsElemRect.width - expectedProjectorsRect.width) > 1 ||
        Math.abs(projectorsElemRect.top - expectedProjectorsRect.top) > 2 ||
        Math.abs(projectorsElemRect.left - expectedProjectorsRect.left) > 2
      ) {
        return true
      }
    }

    return false
  }

  getElemRect(elem) {
    const scrollableRect = (this.isFullscreen)
      ? (this.ytdWatchFlexyElem || this.playerTheaterContainerElemFromVideo || body).getBoundingClientRect()
      : body.getBoundingClientRect()
    const elemRect = elem.getBoundingClientRect()

    return {
      top: elemRect.top - scrollableRect.top,
      left: elemRect.left - scrollableRect.left,
      width: elemRect.width,
      height: elemRect.height
    }
  }

  scheduleNextFrame() {
    if (
      this.scheduledNextFrame ||
      !this.canScheduleNextFrame()
    ) return

    this.scheduleRequestVideoFrame()
    if(
      this.settings.frameSync == FRAMESYNC_VIDEOFRAMES &&
      this.requestVideoFrameCallbackId &&
      !this.videoIsHidden &&
      !this.settings.frameBlending &&
      !this.settings.showFrametimes
    ) return

    this.scheduledNextFrame = true
    if(!this.videoIsHidden)
      requestAnimationFrame(this.onNextFrame)
    else
      setTimeout(this.scheduleNextFrameDelayed, this.videoFrameRate ? (1000 / this.videoFrameRate) : 30)
  }

  scheduleNextFrameDelayed = () => requestAnimationFrame(this.onNextFrame)

  onNextFrame = wrapErrorHandler(async function wrappedOnNextFrame() {
    if (!this.scheduledNextFrame) return

    this.scheduledNextFrame = false
    if(this.videoElem.ended) return

    if(this.settings.framerateLimit) {
      await this.onNextLimitedFrame()
    } else {
      await this.nextFrame()
      this.nextFrameTime = undefined
    }
    
    this.displayFrameCount++
  }.bind(this))

  onNextLimitedFrame = async () => {
    const time = performance.now()
    if(this.nextFrameTime > time) {
      this.scheduleNextFrame()
      return
    }

    const ambientlightFrameCount = this.ambientlightFrameCount
    await this.nextFrame()
    if(
      this.ambientlightFrameCount <= ambientlightFrameCount
    ) {
      return
    }

    const frameFadingMax = (15 * Math.pow(ProjectorWebGL.subProjectorDimensionMax, 2)) - 1
    const realFramerateLimit = (this.settings.webGL && this.settings.frameFading > frameFadingMax)
      ? Math.max(1, (frameFadingMax / (this.settings.frameFading || 1)) * this.settings.framerateLimit)
      : this.settings.framerateLimit
    this.nextFrameTime = Math.max((this.nextFrameTime || time) + (1000 / realFramerateLimit), time)
  }

  canScheduleNextFrame = () => (!(
    !this.settings.enabled ||
    !this.isOnVideoPage ||
    this.pendingStart ||
    this.videoElem.ended ||
    this.videoElem.paused ||
    this.videoElem.seeking ||
    // this.isBuffering || // Delays requestVideoFrameCallback when going to a unloaded timestamp
    this.isVideoHiddenOnWatchPage ||
    this.isAmbientlightHiddenOnWatchPage
  ))

  optionalFrame = async () => {
    if(
      !this.settings.enabled ||
      !this.isOnVideoPage ||
      this.pendingStart ||
      this.resizeAfterFrames > 0 ||
      this.videoElem.ended ||
      ((!this.videoElem.paused && !this.videoElem.seeking) && this.scheduledNextFrame)
    ) return
    
    await this.nextFrame()
  }

  getNow = () => Math.round(100 * performance.now()) / 100

  nextFrame = async () => {
    try {
      const videoFrameTimes = this.settings.showFrametimes ? [...this.videoFrameTimes] : []
      const frameTimes = this.settings.showFrametimes ? {
        frameStart: this.getNow()
      } : {}
    
      this.delayedUpdateSizesChanged = false
      if(this.p && this.sizesInvalidated) {
        this.updateSizesChanged()
      }
      if (!this.p || this.sizesChanged) {
        //If was detected hidden by updateSizes, this.p won't be initialized yet
        if(!await this.updateSizes()) return
      } else {
        this.delayedUpdateSizesChanged = true
      }
      
      let results = {}
      if (this.settings.showFrametimes)
        frameTimes.drawStart = this.getNow()

      if(!this.settings.webGL || this.getImageDataAllowed) {
        results = this.drawAmbientlight() || {}
      }

      if (this.settings.showFrametimes)
        frameTimes.drawEnd = this.getNow()

      if(this.canScheduleNextFrame() && !this.isBuffering) {
        this.scheduleNextFrame()
      }

      if (results?.detectBarSize) {
        this.scheduleBarSizeDetection()
      }

      this.nextFrametimes(videoFrameTimes, frameTimes, results)

      if(
        this.afterNextFrameIdleCallback ||
        (
          !this.settings.videoOverlayEnabled &&
          !(
            this.delayedUpdateSizesChanged &&
            (performance.now() - this.lastUpdateSizesChanged) > 2000
          ) &&
          !((performance.now() - this.lastUpdateStatsTime) > this.updateStatsInterval)
        )
      ) return
      
      this.afterNextFrameIdleCallback = requestIdleCallback(this.afterNextFrame, { timeout: 1000/30 })
    } catch (ex) {
      const message = (ex.name === 'SecurityError')
        ? 'A refresh could help, but it is most likely that your browser does not allow the ambient light to read the video pixels of this specific YouTube video. You can probably watch other YouTube videos without this problem.'
        : `A refresh of the page might help. If not, there could be a specific problem with this YouTube video.\n\nError: ${ex.name}\nReason: ${ex.message}`
      this.settings.setWarning(`Failed to display the ambient light\n\n${message}`)
      if(this.catchedErrors[ex.name]) return

      this.catchedErrors[ex.name] = true
      if([
        'SecurityError',
        'NS_ERROR_NOT_AVAILABLE',
        'NS_ERROR_OUT_OF_MEMORY'
      ].includes(ex.name)) return

      throw ex
    }
  }

  nextFrametimes = (videoFrameTimes, frameTimes, results) => {
    if(!this.settings.showFrametimes || !results?.hasNewFrame) return
  
    frameTimes.frameEnd = this.getNow()
    frameTimes.video = videoFrameTimes.pop() || 0
    this.videoFrameTimes.splice(this.videoFrameTimes.indexOf(frameTimes.video), 1)
    for (const video of videoFrameTimes) {
      this.videoFrameTimes.splice(this.videoFrameTimes.indexOf(video), 1)
      this.frameTimes.push({
        video
      })
    }
    this.frameTimes.push(frameTimes)

    requestIdleCallback(() => {
      frameTimes.displayEnd = this.getNow()
    }, { timeout: 1 })
    requestIdleCallback(() => {
      frameTimes.busyEnd = this.getNow()
    })
  }

  afterNextFrame = async () => {
    try {
      this.afterNextFrameIdleCallback = undefined

      this.detectFrameRates()
      
      if (this.settings.videoOverlayEnabled) {
        this.checkIfNeedToHideVideoOverlay()
      }
      
      if (
        this.delayedUpdateSizesChanged &&
        (performance.now() - this.lastUpdateSizesChanged) > 2000
      ) {
        this.updateSizesChanged(true)
        if(this.sizesChanged) {
          await this.optionalFrame()
        }
      } else if((performance.now() - this.lastUpdateStatsTime) > this.updateStatsInterval) {
        this.updateStats()
        this.lastUpdateStatsTime = performance.now()
      }
    } catch (ex) {
      // Prevent recursive error reporting
      if(this.scheduledNextFrame) {
        cancelAnimationFrame(this.scheduledNextFrame)
        this.scheduledNextFrame = undefined
      }

      throw ex
    }
  }

  isNewFrame(oldLines, newLines) {
    if (!oldLines || oldLines.length !== newLines.length) {
      return true
    }

    for (let i = 0; i < oldLines.length; i++) {
      for (let xi = 0; xi < oldLines[i].length; xi+=10) {
        if (oldLines[i][xi] !== newLines[i][xi]) {
          return true
        }
      }
    }

    return false
  }

  // Todo:
  // - Fix frame drops on 60hz monitors with a 50hz video playing?:
  //     Was caused by faulty NVidia 3050TI driver 
  //     and chromium video callback being sometimes 1 frame delayed
  //     and requestVideoFrameCallback being executed at the end of the draw flow
  // - Do more complex logic at a later time
  detectFrameRate(list, count, currentFrameRate, update) {
    const time = performance.now()

    // Add new item
    let fps = 0
    if (list.length) {
      if(count < list[0].count) {
        // Clear list with invalid values
        list.splice(0, list.length)
      } else {
        const previous = list[0]
        fps = Math.max(0, (
          (count - previous.count) / 
          ((time - previous.time) / 1000)
        ))
      }
    }
    list.push({
      count,
      time,
      fps
    })

    if (!update || list.length < 2) return currentFrameRate

    // Todo: delay removal and calculations to idle callback?

      // Remove old items
      const thresholdTime = time - this.frameCountHistory
      const thresholdIndex = list.findIndex(i => i.time >= thresholdTime)
      if(thresholdIndex > 0) list.splice(0, thresholdIndex - 1)

      // Calculate fps
      const aligableList = list.filter(i => i.fps)
      if(!aligableList.length) return currentFrameRate

      aligableList.sort((a, b) => a.fps - b.fps)
      if(aligableList.length > 10) {
        const bound = Math.floor(aligableList.length / 16)
        aligableList.splice(0, bound)
        aligableList.splice(aligableList.length - bound, bound)
      }

      const difference = Math.min(5, aligableList[aligableList.length - 1].fps - aligableList[0].fps)
      const deleteCount = Math.min(aligableList.length - 2, Math.max(0, Math.floor(aligableList.length * (difference / 5) - 2)))
      if(deleteCount) {
        aligableList.sort((a, b) => a.time - b.time)
        aligableList.splice(0, deleteCount)
      }

      const average = aligableList.reduce((sum, i) => sum + i.fps, 0) / aligableList.length

      return average
  }

  detectFrameRates() {
    const update = performance.now() > (this.previousUpdate || 0) + this.updateStatsInterval
    if(update) this.previousUpdate = performance.now()
    this.detectDisplayFrameRate(update)
    this.detectAmbientlightFrameRate(update)
    this.detectVideoFrameRate(update)
  }

  videoFrameCounts = []
  detectVideoFrameRate(update) {
    this.videoFrameRate = this.detectFrameRate(
      this.videoFrameCounts,
      this.getVideoFrameCount() + this.getVideoDroppedFrameCount(),
      this.videoFrameRate,
      update
    )
  }

  displayFrameCounts = []
  displayFrameCount = 0
  detectDisplayFrameRate = (update) => {
    this.displayFrameRate = this.detectFrameRate(
      this.displayFrameCounts,
      this.displayFrameCount,
      this.displayFrameRate,
      update
    )
  }

  ambientlightFrameCounts = []
  detectAmbientlightFrameRate(update) {
    this.ambientlightFrameRate = this.detectFrameRate(
      this.ambientlightFrameCounts,
      this.ambientlightFrameCount,
      this.ambientlightFrameRate,
      update
    )
  }

  getVideoDroppedFrameCount() {
    if (!this.videoElem) return 0

    return this.videoElem.getVideoPlaybackQuality().droppedVideoFrames
  }

  getVideoFrameCount() {
    if (!this.videoElem) return 0
    return (
      this.videoElem.mozPaintedFrames || // Firefox
      (this.videoElem.webkitDecodedFrameCount - this.videoElem.webkitDroppedFrameCount) || // Chrome
      0
    )
  }

  hideStats() {
    if(this.isHidden || !this.settings.showFPS) {
      this.videoFPSElem.childNodes[0].nodeValue = ''
      this.videoDroppedFramesElem.childNodes[0].nodeValue = ''
      this.videoSyncedElem.childNodes[0].nodeValue = ''
      this.ambientlightFPSElem.childNodes[0].nodeValue = ''
      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue = ''
    }

    if(this.isHidden || !this.settings.showFPS || !this.settings.showFrametimes) {
      this.displayFPSElem.childNodes[0].nodeValue = ''
    }

    if((this.isHidden || !this.settings.showFrametimes) && this.frameTimesCanvas?.parentNode) {
      this.ambientlightFTLegendElem.childNodes[0].nodeValue = ''
      this.frameTimesCtx.clearRect(0, 0, this.frameTimesCanvas.width, this.frameTimesCanvas.height)
      this.ambientlightFTElem.removeChild(this.frameTimesCanvas)
      this.ambientlightFTElem.style.display = 'none'
    }
  }

  videoFrameTimes = []
  frameTimes = []

  updateStats() {
    if (this.isHidden) return;

    if(this.settings.showFPS) {
      // Video FPS
      const videoFPSText = `VIDEO: ${this.videoFrameRate.toFixed(2)} ${this.videoFrameRate ? `(${(1000/this.videoFrameRate).toFixed(2)}ms)` : ''}`

      // Video dropped frames
      const videoDroppedFrameCount = this.getVideoDroppedFrameCount()
      const videoDroppedFramesText = `VIDEO DROPPED: ${videoDroppedFrameCount}`
      const videoDroppedFramesColor = (videoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

      // Video synced
      let videoSyncedText = '';
      let videoSyncedColor = '#f55';
      if (this.settings.videoOverlayEnabled) {
        videoSyncedText = `VIDEO SYNCED: ${this.videoOverlay?.isHidden ? 'NO' : 'YES'}`
        videoSyncedColor = this.videoOverlay?.isHidden ? '#f55' : '#7f7'
        this.detectVideoSyncedWasHidden = this.videoOverlay?.isHidden
      }

      // Ambientlight FPS
      const ambientlightFPSText = `AMBIENT: ${this.ambientlightFrameRate.toFixed(2)} ${this.ambientlightFrameRate ? `(${(1000/this.ambientlightFrameRate).toFixed(2)}ms)${this.settings.framerateLimit ? ` LIMIT: ${this.settings.framerateLimit}` : ''}` : ''}`
      const ambientlightFrameRateTarget = this.settings.framerateLimit ? Math.min(this.videoFrameRate, this.settings.framerateLimit) : this.videoFrameRate
      const ambientlightFPSColor = (this.ambientlightFrameRate < ambientlightFrameRateTarget * .9)
        ? '#f55'
        : (this.ambientlightFrameRate < ambientlightFrameRateTarget - 0.01) ? '#ff3' : '#7f7'

      // Ambientlight dropped frames
      const ambientlightDroppedFramesText = `AMBIENT DROPPED: ${this.ambientlightVideoDroppedFrameCount}`
      const ambientlightDroppedFramesColor = (this.ambientlightVideoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

      // Render all stats

      this.videoFPSElem.childNodes[0].nodeValue = videoFPSText

      this.videoDroppedFramesElem.childNodes[0].nodeValue = videoDroppedFramesText
      this.videoDroppedFramesElem.style.color = videoDroppedFramesColor

      this.videoSyncedElem.childNodes[0].nodeValue = videoSyncedText
      this.videoSyncedElem.style.color = videoSyncedColor

      this.ambientlightFPSElem.childNodes[0].nodeValue = ambientlightFPSText
      this.ambientlightFPSElem.style.color = ambientlightFPSColor

      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue = ambientlightDroppedFramesText
      this.ambientlightDroppedFramesElem.style.color = ambientlightDroppedFramesColor
    }

    if(this.settings.showFrametimes && this.settings.showFPS) {
      // Display FPS
      const displayFPSText = `DISPLAY: ${this.displayFrameRate.toFixed(2)} ${this.displayFrameRate ? `(${(1000/this.displayFrameRate).toFixed(2)}ms)` : ''}`
      const displayFPSColor = (this.displayFrameRate < this.videoFrameRate - 1)
        ? '#f55'
        : (this.displayFrameRate < this.videoFrameRate - 0.01) ? '#ff3' : '#7f7'

      this.displayFPSElem.childNodes[0].nodeValue = displayFPSText
      this.displayFPSElem.style.color = displayFPSColor
    } else if(this.displayFPSElem.childNodes[0].nodeValue !== '') {
      this.displayFPSElem.childNodes[0].nodeValue = ''
    }

    this.updateFrameTimesStats()
  }

  updateFrameTimesStats = () => {
    if(!this.settings.showFrametimes || this.isHidden || !this.frameTimes.length) {
      if(this.frameTimesCanvas?.parentNode) {
        this.frameTimesCtx.clearRect(0, 0, this.frameTimesCanvas.width, this.frameTimesCanvas.height)
        this.ambientlightFTElem.removeChild(this.frameTimesCanvas)
        this.ambientlightFTLegendElem.childNodes[0].nodeValue = ''
        this.ambientlightFTElem.style.display = 'none'
      }
      return
    }

    // Ambient light FrameTimes
    let frameTimes = this.frameTimes
    this.frameTimes = this.frameTimes.slice(-this.updateStatsFrametimesHistoryMax)
    frameTimes.pop()
    frameTimes = frameTimes.slice(-this.updateStatsFrametimesHistoryMax)

    const displayFrameDuration = (1000 / (this.displayFrameRate || 1000))
    const videoFrameDuration = (1000 / (this.videoFrameRate || 1000))
    let lastVideoFrameTime = 0
    for (const ft of frameTimes) {
      if (!ft.video) {
        ft.video = (this.settings.frameSync === FRAMESYNC_VIDEOFRAMES)
          ? {
            processingDuration: lastVideoFrameTime.processingDuration,
            timestamp: lastVideoFrameTime.timestamp + videoFrameDuration,
            presentationTime: lastVideoFrameTime.presentationTime + videoFrameDuration,
            received: lastVideoFrameTime.received + videoFrameDuration,
            expectedDisplayTime: lastVideoFrameTime.expectedDisplayTime + videoFrameDuration
          }
          : {
            processingDuration: 0,
            timestamp: ft.frameStart,
            presentationTime: ft.frameStart,
            received: ft.frameStart,
            expectedDisplayTime: ft.frameStart + displayFrameDuration
          }
      }
      lastVideoFrameTime = ft.video
      if (!ft.displayEnd)
        ft.displayEnd = ft.video.received + videoFrameDuration
      if (!ft.busyEnd)
        ft.busyEnd = ft.video.received + videoFrameDuration
    }

    const videoProcessingRange = this.getRange(
      frameTimes.map(ft => ft.video.received - (ft.video.timestamp - ft.video.processingDuration))
    );
    const ambientlightProcessingRange = this.getRange(
      frameTimes.map(ft => ft.displayEnd - ft.video.received)
    );
    const ambientlightBudgetRange = this.getRange(
      frameTimes.map(ft => ft.video.expectedDisplayTime - ft.video.received)
    );
    const otherBusyRange = this.getRange(
      frameTimes.map(ft => ft.busyEnd - ft.displayEnd)
    );
    const delayedFrames = frameTimes.filter(ft => ft.displayEnd > ft.video.expectedDisplayTime).length
    const lostFrames = frameTimes.filter(ft => !ft.frameStart).length

    const legend = `         FRAMETIMES                 MIN        MAX
BLUE   | video processing:   ${videoProcessingRange[0]       }ms ${videoProcessingRange[1]       }ms
GREEN  | ambient processing: ${ambientlightProcessingRange[0]}ms ${ambientlightProcessingRange[1]}ms
GRAY   | ambient budget:     ${ambientlightBudgetRange[0]    }ms ${ambientlightBudgetRange[1]    }ms
PURPLE | other processing:   ${otherBusyRange[0]             }ms ${otherBusyRange[1]             }ms

                 FRAMECOUNTERS
GREEN          | on time:  ${frameTimes.length - delayedFrames - lostFrames}
YELLOW/ORANGE  | delayed:  ${delayedFrames}
RED            | dropped:  ${lostFrames}

         LINES
GREEN  | when the video frame is rendered
YELLOW | render delayed by 1 display frame
ORANGE | delayed by more than 1 display frame
GREY   | previous display frames`
    this.ambientlightFTLegendElem.childNodes[0].nodeValue = legend

    const scaleX = 3
    const width = frameTimes.length * scaleX
    const height = 300
    const rangeY = 1.65
    const scaleY = height / (videoFrameDuration * (rangeY * 2)) // Math.min(500, (Math.max(videoFrameDuration, longestDuration) * 1.25))

    if(!this.frameTimesCanvas) {
      this.frameTimesCanvas = new Canvas(width, height)
      this.frameTimesCanvas.setAttribute('title', 'Click to toggle legend')
      on(this.frameTimesCanvas, 'click', e => {
        e.preventDefault();
        this.ambientlightFTElem.toggleAttribute('legend');
      }, { capture: true })
      on(this.frameTimesCanvas, 'mousedown', e => {
        e.preventDefault();
      }, { capture: true }) // Prevent pause
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas)
      this.ambientlightFTElem.style.display = ''

      this.frameTimesCtx = this.frameTimesCanvas.getContext('2d', { alpha: true })
    } else if (
      this.frameTimesCanvas.width !== width ||
      this.frameTimesCanvas.height !== height
    ) {
      this.frameTimesCanvas.width = width
      this.frameTimesCanvas.height = height
    } else {
      this.frameTimesCtx.clearRect(0, 0, width, height)
    }
    if(!this.frameTimesCanvas?.parentNode) {
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas)
      this.ambientlightFTElem.style.display = ''
    }

    const rects = []
    for (let i = 0, length = frameTimes.length; i < length; i++ ) {
      const ft = frameTimes[i];
      const videoSubmit = ft.video.timestamp
      const videoDisplay = ft.video.expectedDisplayTime - videoSubmit // Todo: Fix frametimes relative to the displayTime instead of the video timestamp
      const x = i * scaleX
      const y = Math.ceil(((videoFrameDuration * rangeY) - videoDisplay) * scaleY)
      if (ft.frameStart !== undefined) {
        const nextTimestamp = (i === frameTimes.length - 1) ? null : (frameTimes[i+1].video.timestamp - videoSubmit)
        const busyEnd = (ft.busyEnd - videoSubmit)
        const displayEnd = (ft.displayEnd - videoSubmit)
        const displayEnd2x = videoDisplay + displayFrameDuration
        const drawEnd = (ft.drawEnd - videoSubmit)
        const drawStart = (ft.drawStart - videoSubmit)
        const received = (ft.video.received - videoSubmit)
        const presented = (ft.video.presentationTime - videoSubmit)
        const timestamp = ft.video.processingDuration
        const previousBusyEnd = (i === 0) ? null : (frameTimes[i-1].busyEnd - videoSubmit)
        const previousExpectedDisplayTime = (i === 0) ? null : (frameTimes[i-1].video.expectedDisplayTime - videoSubmit)
        
        if (previousBusyEnd) {
          rects.push(['#999', x, 0, scaleX, y + Math.ceil(previousBusyEnd * scaleY)])
          rects.push(['#555', x, 0, scaleX, y + Math.ceil(previousExpectedDisplayTime * scaleY)])
        }
        rects.push(['#999', x, y, scaleX, Math.ceil(busyEnd * scaleY)])
        rects.push([(displayEnd <= videoDisplay ? '#0f0' : (displayEnd <= displayEnd2x ? '#ff0' : '#f80')), x, y, scaleX, Math.ceil(displayEnd * scaleY)])
        rects.push([(displayEnd <= videoDisplay ? '#3e1' : (displayEnd <= displayEnd2x ? '#cc0' : '#e60')), x, y, scaleX, Math.ceil(drawEnd * scaleY)])
        rects.push([(displayEnd <= videoDisplay ? '#8f4' : (displayEnd <= displayEnd2x ? '#990' : '#c50')), x, y, scaleX, Math.ceil(drawStart * scaleY)])
        rects.push(['#06d', x, y + Math.ceil(presented * scaleY), scaleX, -Math.ceil(timestamp * scaleY)])
        rects.push(['#00f', x, y, scaleX, Math.ceil(received * scaleY)])
        // rects.push(['#000', x, y, scaleX, Math.ceil(presented * scaleY)])
        // rects.push(['#f0f', x, y + Math.ceil(videoDisplay * scaleY) - 2, scaleX, 3])
        if (nextTimestamp) {
          rects.push(['#555', x, y + Math.ceil(nextTimestamp * scaleY), scaleX, height - (y + Math.ceil(nextTimestamp * scaleY))])
        }
      } else {
        rects.push(['#f00', x, 0, scaleX, height])
      }
    }
    
    const displayEndY = Math.ceil((videoFrameDuration * rangeY) * scaleY)
    rects.push(['#00ff00aa', 0, displayEndY, width, 1])
    const displayEndY2x = Math.ceil(displayEndY + (displayFrameDuration * scaleY))
    rects.push(['#ffff0099', 0, displayEndY2x, width, 1])
    for(let i = 0; i < 50; i++) {
      const displayEndYnx = Math.ceil(displayEndY + ((displayFrameDuration * (2 + i)) * scaleY))
      if(displayEndYnx > height) break;
      rects.push(['#ff880066', 0, displayEndYnx, width, 1])
    }
    for(let i = 0; i < 50; i++) {
      const displayEndYxn = Math.ceil(displayEndY - (displayFrameDuration * (1 + i) * scaleY))
      if(displayEndYxn < 0) break;
      rects.push(['#ffffff66', 0, displayEndYxn, width, 1])
    }

    for (const rect of rects) {
      this.frameTimesCtx.fillStyle = rect[0]
      this.frameTimesCtx.fillRect(rect[1], rect[2], rect[3], rect[4])
    }
  }

  getRange = (list) => list.length 
    ? list
      .sort((a, b) => a - b)
      .reduce((lowest, de, i) => (i === 0)
        ? [de]
        : (i === list.length - 1)
          ? [lowest.toFixed(2)?.padStart(8, ' '), de.toFixed(2)?.padStart(8, ' ')]
          : lowest
      )
    : ['?', '?'];

  shouldShow = () => (
    this.settings.enabled &&
    this.isOnVideoPage &&
    !this.isVR &&
    this.isInEnabledView()
  )

  drawAmbientlight() {
    const shouldShow = this.shouldShow()
    if(!shouldShow) {
      if (!this.isHidden) this.hide()
      return
    }

    const drawTime = performance.now()
    if (this.isHidden) this.show()

    if (
      (
        this.atTop &&
        this.isFillingFullscreen && 
        !this.settings.detectHorizontalBarSizeEnabled &&
        !this.settings.detectVerticalBarSizeEnabled &&
        !this.settings.frameBlending &&
        !this.settings.videoOverlayEnabled
      ) ||
      this.isControlledByAnotherExtension ||
      this.isVideoHiddenOnWatchPage || 
      // this.isAmbientlightHiddenOnWatchPage || // Disabled because: When in fullscreen isFillingFullscreen goes to false the observer needs a frame to render the shown ambientlight element. So instead we handle this in the canScheduleNextFrame check
      this.videoElem.ended || 
      this.videoElem.readyState === 0 || // HAVE_NOTHING
      this.videoElem.readyState === 1    // HAVE_METADATA
    ) return

    let newVideoFrameCount = this.getVideoFrameCount()

    let hasNewFrame = false
    if(this.settings.frameSync == FRAMESYNC_VIDEOFRAMES) {
      if(this.videoIsHidden) {
        hasNewFrame = (this.previousFrameTime < (drawTime - (1000 / Math.max(24, this.videoFrameRate)))) // Force video.webkitDecodedFrameCount to update on Chromium by always executing drawImage
      } else {
        if(this.videoFrameCallbackReceived && this.videoFrameCount == newVideoFrameCount) {
          newVideoFrameCount++
        }
        hasNewFrame = this.videoFrameCallbackReceived
        this.videoFrameCallbackReceived = false

        // Fallback for when requestVideoFrameCallback stopped working
        if (!hasNewFrame) {
          hasNewFrame = (this.videoFrameCount < newVideoFrameCount)
        }
      }
    } else if(this.settings.frameSync == FRAMESYNC_DECODEDFRAMES) {
      hasNewFrame = (this.videoFrameCount < newVideoFrameCount)
    } else if (this.settings.frameSync == FRAMESYNC_DISPLAYFRAMES) {
      hasNewFrame = true
    }
    hasNewFrame = hasNewFrame || this.buffersCleared
    
    const droppedFrames = (this.videoFrameCount > 120 && this.videoFrameCount < newVideoFrameCount - 1)
    if (droppedFrames && !this.buffersCleared) {
      this.ambientlightVideoDroppedFrameCount += newVideoFrameCount - (this.videoFrameCount + 1)
    }
    if (newVideoFrameCount > this.videoFrameCount || newVideoFrameCount < this.videoFrameCount - 60) {
      this.videoFrameCount = newVideoFrameCount
    }


    // Horizontal bar detection
    const detectBarSize = (
      hasNewFrame &&
      !this.barDetection?.run && 
      (this.settings.detectHorizontalBarSizeEnabled || this.settings.detectVerticalBarSizeEnabled)
    )

    const dontDrawAmbientlight = (
      this.atTop &&
      this.isFillingFullscreen
    )

    const dontDrawBuffer = (dontDrawAmbientlight && !detectBarSize)

    if (this.settings.frameBlending && this.settings.frameBlendingSmoothness) {
      if (!this.previousProjectorBuffer) {
        this.initFrameBlending()
      }
      if (this.settings.videoOverlayEnabled && !this.previousVideoOverlayBuffer) {
        this.initVideoOverlayWithFrameBlending()
      }

      // Prevent unnessecary frames drawing when frameBlending is not 100% but keep counting becuase we calculate with this.ambientlightFrameRate
      if(hasNewFrame || this.buffersCleared || !this.previousDrawFullAlpha) {
        if (hasNewFrame || this.buffersCleared) {
          if (this.settings.videoOverlayEnabled) {
            this.previousVideoOverlayBuffer.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
            this.videoOverlayBuffer.ctx.drawImage(this.videoElem, 
              0, 0, this.videoOverlayBuffer.elem.width, this.videoOverlayBuffer.elem.height)
            if(this.buffersCleared) {
              this.previousVideoOverlayBuffer.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
            }
          }

          if(!dontDrawBuffer) {
            if(!this.buffersCleared) {
              this.previousProjectorBuffer.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
            }
            // Prevent adjusted barsClipPx from leaking previous frame into the frame
            this.projectorBuffer.ctx.clearRect(0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
            
            this.projectorBuffer.ctx.drawImage(this.videoElem,
              0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
            if(this.buffersCleared) {
              this.previousProjectorBuffer.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
            }
          }
        }

        let alpha =  1
        const ambientlightFrameDuration = 1000 / this.ambientlightFrameRate
        if(hasNewFrame) {
          this.frameBlendingFrameTimeStart = drawTime - (ambientlightFrameDuration / 2)
        }
        if(this.displayFrameRate >= this.videoFrameRate * 1.33) {
          if(hasNewFrame && !this.previousDrawFullAlpha) {
            alpha = 0 // Show previous frame fully to prevent seams
          } else {
            const videoFrameDuration = 1000 / this.videoFrameRate
            const frameToDrawDuration = drawTime - this.frameBlendingFrameTimeStart
            const frameToDrawDurationThresshold = (frameToDrawDuration + (ambientlightFrameDuration / 2)) / (this.settings.frameBlendingSmoothness / 100)
            if (frameToDrawDurationThresshold < videoFrameDuration) {
              alpha = Math.min(1, (
                frameToDrawDuration / (
                  1000 / (
                    this.videoFrameRate / 
                    (this.settings.frameBlendingSmoothness / 100) || 1
                  )
                )
              ))
            }
          }
        }
        if(alpha === 1) {
          this.previousDrawFullAlpha = true
        } else {
          this.previousDrawFullAlpha = false
        }

        if (this.settings.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.isHidden) {
          if(alpha !== 1) {
            if(this.videoOverlay.ctx.globalAlpha !== 1) {
              this.videoOverlay.ctx.globalAlpha = 1
            }
            this.videoOverlay.ctx.drawImage(this.previousVideoOverlayBuffer.elem, 0, 0)
          }
          if(alpha > 0.005) {
            this.videoOverlay.ctx.globalAlpha = alpha
            this.videoOverlay.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
          }
          this.videoOverlay.ctx.globalAlpha = 1
        }

        if (!dontDrawAmbientlight) {
          //this.blendedProjectorBuffer can contain an old frame and be impossible to drawImage onto
          //this.previousProjectorBuffer can also contain an old frame
          
          if(alpha !== 1) {
            if(this.blendedProjectorBuffer.ctx.globalAlpha !== 1)
              this.blendedProjectorBuffer.ctx.globalAlpha = 1
            this.blendedProjectorBuffer.ctx.drawImage(this.previousProjectorBuffer.elem, 0, 0)
          }
          if(alpha > 0.005) {
            this.blendedProjectorBuffer.ctx.globalAlpha = alpha
            this.blendedProjectorBuffer.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
          }
          this.blendedProjectorBuffer.ctx.globalAlpha = 1

          this.projector.draw(this.blendedProjectorBuffer.elem)
        }
      }
    } else {
      if (!hasNewFrame) return

      if (this.settings.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.isHidden) {
        if(this.enableChromiumBug1092080Workaround) {
          this.videoOverlay.ctx.clearRect(0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        }
        this.videoOverlay.ctx.drawImage(this.videoElem, 
          0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
      }

      if (!dontDrawBuffer) {
        this.projectorBuffer.ctx.drawImage(this.videoElem,
          0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)

        if (!dontDrawAmbientlight) {
          this.projector.draw(this.projectorBuffer.elem)
        }
      }
    }

    this.buffersCleared = false
    if(!dontDrawBuffer || this.settings.videoOverlayEnabled) this.ambientlightFrameCount++
    this.previousDrawTime = drawTime
    if(hasNewFrame) {
      this.previousFrameTime = drawTime
    }

    if(this.enableMozillaBug1606251Workaround) {
      this.elem.style.transform = `translateZ(${this.ambientlightFrameCount % 10}px)`;
    }
    
    return { hasNewFrame, detectBarSize }
  }

  scheduleBarSizeDetection = () => {
    try {
      if(this.barDetection.run) return

      if(
        (this.getImageDataAllowed && this.checkGetImageDataAllowed(true)) || 
        this.getImageDataAllowed
      ) {
        this.barDetection.detect(
          this.projectorBuffer.elem,
          this.settings.detectColoredHorizontalBarSizeEnabled,
          this.settings.detectHorizontalBarSizeOffsetPercentage,
          this.settings.detectHorizontalBarSizeEnabled,
          this.settings.horizontalBarsClipPercentage,
          this.settings.detectVerticalBarSizeEnabled,
          this.settings.verticalBarsClipPercentage,
          this.p ? this.p.h / this.p.w : 1,
          !this.settings.frameBlending,
          wrapErrorHandler(this.scheduleBarSizeDetectionCallback)
        )
      }
    } catch (ex) {
      if (!this.showedDetectBarSizeWarning) {
        this.showedDetectBarSizeWarning = true
        throw ex
      }
    }
  }

  scheduleBarSizeDetectionCallback = async (horizontalPercentage, verticalPercentage) => {
    const horizontalBarChanged = (
      this.settings.detectHorizontalBarSizeEnabled && 
      horizontalPercentage !== undefined && 
      this.setHorizontalBars(horizontalPercentage)
    )
    const verticalBarChanged = (
      this.settings.detectVerticalBarSizeEnabled && 
      verticalPercentage !== undefined && 
      this.setVerticalBars(verticalPercentage)
    )
    if(!horizontalBarChanged && !verticalBarChanged) return

    this.sizesChanged = true
    await this.optionalFrame()
  }

  checkIfNeedToHideVideoOverlay() {
    if(!this.videoOverlay) return

    if(!this.hideVideoOverlayCache) {
      this.hideVideoOverlayCache = {
        prevAmbientlightVideoDroppedFrameCount: this.ambientlightVideoDroppedFrameCount,
        framesInfo: [],
        isHiddenChangeTimestamp: 0
      }
    }

    let {
      prevAmbientlightVideoDroppedFrameCount,
      framesInfo,
      isHiddenChangeTimestamp
    } = this.hideVideoOverlayCache

    const newFramesDropped = Math.max(0, this.ambientlightVideoDroppedFrameCount - prevAmbientlightVideoDroppedFrameCount)
    this.hideVideoOverlayCache.prevAmbientlightVideoDroppedFrameCount = this.ambientlightVideoDroppedFrameCount
    framesInfo.push({
      time: performance.now(),
      framesDropped: newFramesDropped
    })
    const frameDropTimeLimit = performance.now() - 2000
    framesInfo = framesInfo.filter(info => info.time > frameDropTimeLimit)
    this.hideVideoOverlayCache.framesInfo = framesInfo

    let hide = this.isBuffering || this.videoElem.paused || this.videoElem.seeking || this.videoIsHidden
    const syncThreshold = this.settings.videoOverlaySyncThreshold
    if(!hide && syncThreshold !== 100) {
      if(
        framesInfo.length < 5
      ) {
        hide = true
      } else {
        const droppedFramesCount = framesInfo.reduce((sum, info) => sum + info.framesDropped, 0)
        const droppedFramesThreshold = (this.videoFrameRate * 2) * (syncThreshold / 100)
        hide = droppedFramesCount > droppedFramesThreshold
      }
    }

    if (hide) {
      if (!this.videoOverlay.isHidden) {
        this.videoOverlay.elem.classList.add('ambientlight__video-overlay--hide')
        this.videoOverlay.isHidden = true
        this.hideVideoOverlayCache.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    } else if (
      syncThreshold == 100 ||
      isHiddenChangeTimestamp + 2000 < performance.now()
    ) {
      if (this.videoOverlay.isHidden) {
        this.videoOverlay.elem.classList.remove('ambientlight__video-overlay--hide')
        this.videoOverlay.isHidden = false
        this.hideVideoOverlayCache.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    }
  }

  async enable(initial = false) {
    if (!initial) {
      this.settings.set('enabled', true, true)
    }
    
    await this.start(initial)
  }

  // async disableYouTubeAmbientMode() {
  //   try {
  //     if(
  //       !ytcfg?.data_?.WEB_PLAYER_CONTEXT_CONFIGS.WEB_PLAYER_CONTEXT_CONFIG_ID_KEVLAR_WATCH?.cinematicSettingsAvailable ||
  //       !ytcfg?.data_?.EXPERIMENT_FLAGS?.kevlar_watch_cinematics
  //     ) return

  //     const ambientModeIcon = 'path[d="M21 7v10H3V7h18m1-1H2v12h20V6zM11.5 2v3h1V2h-1zm1 17h-1v3h1v-3zM3.79 3 6 5.21l.71-.71L4.5 2.29 3.79 3zm2.92 16.5L6 18.79 3.79 21l.71.71 2.21-2.21zM19.5 2.29 17.29 4.5l.71.71L20.21 3l-.71-.71zm0 19.42.71-.71L18 18.79l-.71.71 2.21 2.21z"]'
  //     let ambientModeCheckbox = document.querySelector(`.ytp-menuitem ${ambientModeIcon}`)?.closest('.ytp-menuitem')
      
  //     if(ambientModeCheckbox) {
  //       const enabled = ambientModeCheckbox.getAttribute('aria-checked') === 'true'
  //       if(enabled) {
  //         ambientModeCheckbox.click()
  //       }
  //       return
  //     }

  //     const settingsBtn = document.querySelector('.ytp-settings-button')
  //     const settingsPopupId = settingsBtn?.getAttribute('aria-controls')
  //     const settingsPopup = document.querySelector(`.ytp-popup[id="${settingsPopupId}"]`)
  //     settingsPopup.classList.add('disable-youtube-ambient-mode-workaround')
  //     await new Promise(resolve => raf(resolve)) // Await rendering
  //     const wasActiveElement = document.activeElement
  //     settingsBtn?.click() // Open settings

  //     try {
  //       await new Promise(resolve => raf(resolve)) // Await rendering
  //       await waitForDomElement(() => document.querySelector(`.ytp-menuitem ${ambientModeIcon}`), document.querySelector('.html5-video-player'), 1000)
  //       ambientModeCheckbox = document.querySelector(`.ytp-menuitem ${ambientModeIcon}`)?.closest('.ytp-menuitem')
  //       if(ambientModeCheckbox) {
  //         const enabled = ambientModeCheckbox.getAttribute('aria-checked') === 'true'
  //         if(enabled) {
  //           ambientModeCheckbox.click()
  //         }
  //       }
  //     } catch(ex) {
  //       console.log(`Ambient light for YouTube™ | Skipped disabling YouTube\'s own Ambient Mode: ${ex?.message}`)
  //     }

  //     settingsBtn?.click() // Close settings
  //     await new Promise(resolve => raf(resolve)) // Await rendering

  //     if(document.activeElement == settingsBtn && wasActiveElement !== settingsBtn) {
  //       if(wasActiveElement) {
  //         wasActiveElement.focus()
  //       } else {
  //         settingsBtn.blur()
  //       }
  //     }

  //     await new Promise(resolve => setTimeout(resolve, 500)) // Await close animation
  //     await new Promise(resolve => raf(resolve)) // Await rendering
  //     settingsPopup.classList.remove('disable-youtube-ambient-mode-workaround')
  //   } catch(ex) {
  //     console.log(`Ambient light for YouTube™ | Failed to automatically disable YouTube\'s own Ambient Mode: ${ex?.message}`)
  //   }
  // }

  async disable() {
    if(this.pendingStart) return
    this.settings.set('enabled', false, true)

    await this.hide()

    const videoElemParentElem = this.videoElem.parentNode
    if (videoElemParentElem) {
      videoElemParentElem.style.overflow = ''
      videoElemParentElem.style.transform = ''
      videoElemParentElem.style.height = ''
      videoElemParentElem.style.marginBottom = ''
    }
  }

  start = async (initial = false) => {
    if (!this.isOnVideoPage || !this.settings.enabled || this.pendingStart) return

    this.showedCompareWarning = false
    this.showedDetectBarSizeWarning = false
    this.nextFrameTime = undefined
    this.videoFrameRateMeasureStartFrame = 0
    this.videoFrameRateMeasureStartTime = 0
    this.ambientlightVideoDroppedFrameCount = 0
    this.buffersCleared = true // Prevent old frame from preventing the new frame from being drawn

    try {
      this.isHdr = this.videoPlayerElem.getVideoData().isHdr
    } catch(ex) {
      console.warn('Ambient light for YouTube™ | Failed to execute HDR video check')
    }

    this.checkGetImageDataAllowed()
    this.resetSettingsIfNeeded()
    this.updateView()

    this.pendingStart = true
    if(this.shouldShow()) await this.show()
    if(initial) {
      await new Promise(resolve => raf(resolve))
      await new Promise(resolve => requestIdleCallback(resolve, { timeout: 2000 })) // Buffering/rendering budget for low-end devices
      await new Promise(resolve => raf(resolve))
    }
    this.pendingStart = undefined

    // Continue only if still enabled after await
    if(this.settings.enabled) {
      // Prevent incorrect stats from showing
      this.lastUpdateStatsTime = performance.now() + this.updateStatsInterval
      await this.nextFrame()
      // this.disableYouTubeAmbientMode()
    }
  }

  scheduleRequestVideoFrame = () => {
    if (
      // this.videoFrameCallbackReceived || // Doesn't matter because this can be true now but not when the new video frame is received
      this.requestVideoFrameCallbackId ||
      this.settings.frameSync != FRAMESYNC_VIDEOFRAMES ||

      this.videoIsHidden || // Partial solution for https://bugs.chromium.org/p/chromium/issues/detail?id=1142112#c9
      !this.canScheduleNextFrame()
    ) return

    const id = this.requestVideoFrameCallbackId = this.videoElem.requestVideoFrameCallback(wrapErrorHandler(function requestVideoFrameCallback(timestamp, info) {
      this.videoElem.requestVideoFrameCallback(() => {}) // Requesting as soon as possible to prevent skipped video frames on displays with a matching framerate
      if (this.requestVideoFrameCallbackId !== id) {
        console.warn(`Ambient light for YouTube™ | Old rvfc fired. Ignoring a possible duplicate. ${this.requestVideoFrameCallbackId}, ${id}`)
        return
      }
      this.receiveVideoFrame(timestamp, info)
    }.bind(this)))
  }

  receiveVideoFrame = (timestamp, info) => {
    this.receiveVideoFrametimes(timestamp, info)
    this.requestVideoFrameCallbackId = undefined
    this.videoFrameCallbackReceived = true
    
    if(this.scheduledNextFrame) return
    this.scheduledNextFrame = true
    wrapErrorHandler(async () => await this.onNextFrame(), true)()
  }

  receiveVideoFrametimes = (timestamp, info) => {
    if (this.settings.showFrametimes) {
      const now = this.getNow()
      if (this.previousPresentedFrames) {
        const skippedFrames = info.presentedFrames - this.previousPresentedFrames - 1
        for (let i = 0; i < skippedFrames; i++) {
          this.videoFrameTimes.push({
            processingDuration: info.processingDuration * 1000,
            timestamp,
            presentationTime: info.presentationTime - (0.1 * i),
            received: now - (0.1 * i),
            expectedDisplayTime: info.expectedDisplayTime - (0.1 * i)
          })
        }
      }
      this.videoFrameTimes.push({
        processingDuration: info.processingDuration * 1000,
        timestamp,
        presentationTime: info.presentationTime,
        received: now,
        expectedDisplayTime: info.expectedDisplayTime
      })
      this.previousPresentedFrames = info.presentedFrames
    }
  }

  async hide() {
    if (this.isHidden) return
    this.isHidden = true

    await this.updateTheme()

    if (this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    this.resetVideoContainerStyle()
    this.clear()
    this.hideStats()

    html.removeAttribute('data-ambientlight-enabled')
    html.removeAttribute('data-ambientlight-hide-scrollbar')

    this.updateSizes()
    this.updateVideoPlayerSize()
  }

  async show() {
    if (!this.isHidden) return
    this.isHidden = false

    await this.updateTheme(() => {
      // Pre-style to prevent black/white flashes
      if(this.playerTheaterContainerElem) this.playerTheaterContainerElem.style.background = 'none'
      html.style.setProperty('background', this.shouldBeDarkTheme() ? '#000' : '#fff', 'important')
    })
    
    const stack = new Error().stack
    await new Promise((resolve, reject) => raf(() => {
      try {
        html.setAttribute('data-ambientlight-enabled', true)
        if(this.settings.hideScrollbar) html.setAttribute('data-ambientlight-hide-scrollbar', true)

        // Reset
        if(this.playerTheaterContainerElem) this.playerTheaterContainerElem.style.background = ''
        html.style.background = ''

        this.updateVideoPlayerSize()
        this.updateSizes()
        resolve()
      } catch(ex) {
        appendErrorStack(stack, ex)
        reject(ex)
      }
    }))
  }

  updateAtTop = () => {
    this.mastheadElem.classList.toggle('at-top', this.atTop)
  }

  isDarkTheme = () => (html.getAttribute('dark') !== null)
  
  shouldBeDarkTheme = () => {
    const toTheme = ((!this.settings.enabled || this.isHidden || this.settings.theme === THEME_DEFAULT) ? this.originalTheme : this.settings.theme)
    return (toTheme === THEME_DARK)
  }

  shouldToggleTheme = () => {
    const toDark = this.shouldBeDarkTheme()
    return !(
      this.isDarkTheme() === toDark ||
      (toDark && !isWatchPageUrl())
    )
  }

  updateTheme = wrapErrorHandler(async function updateTheme(beforeToggleCallback = () => undefined) {
    if (!this.shouldToggleTheme()) return beforeToggleCallback()
    
    if(this.themeToggleFailed !== false) {
      const lastFailedThemeToggle = await contentScript.getStorageEntryOrEntries('last-failed-theme-toggle')
      if(lastFailedThemeToggle) {
        const now = new Date().getTime()
        const withinThresshold = now - 10000 < lastFailedThemeToggle
        if(withinThresshold) {
          this.settings.setWarning(`Because the previous attempt failed and to prevent repeated page refreshes we temporarily disabled the automatic toggle to the ${this.isDarkTheme() ? 'light' : 'dark'} appearance for 10 seconds.\n\nSet the "Appearance (theme)" setting to "Default" to disable the automatic appearance toggle permanently if it keeps on failing.\n(And let me know via the feedback form that it failed so that I can fix it in the next version of the extension)`)
          return beforeToggleCallback()
        }
        contentScript.setStorageEntry('last-failed-theme-toggle', undefined)
      }
      if(this.themeToggleFailed) {
        this.settings.setWarning('')
        this.themeToggleFailed = false
      }

      if (!this.shouldToggleTheme()) return beforeToggleCallback()
    }

    beforeToggleCallback()
    await this.toggleDarkTheme()
  }.bind(this), true)

  async toggleDarkTheme() {
    const wasDark = this.isDarkTheme()
    
    try {
      yt.config_.EXPERIMENT_FLAGS.kevlar_refresh_on_theme_change = false // Prevents the video page from refreshing every time
    } catch { }
    
    const detail = {
      actionName: 'yt-dark-mode-toggled-action',
      optionalAction: false,
      args: [ !wasDark ], // boolean for iframe live chat
      disableBroadcast: false,
      returnValue: []
    }
    const event = new CustomEvent('yt-action', {
      currentTarget: this.ytdAppElem,
      bubbles: true,
      cancelable: false,
      composed: true,
      detail,
      returnValue: true
    })

    try {
      this.ytdAppElem.dispatchEvent(event)
    } catch(ex) {
      SentryReporter.captureException(ex)
      return
    }

    const isDark = this.isDarkTheme()
    if (wasDark !== isDark) return
    
    this.themeToggleFailed = true
    contentScript.setStorageEntry('last-failed-theme-toggle', new Date().getTime())
    console.warn(`Ambient light for YouTube™ | Failed to toggle theme from ${wasDark ? 'dark' : 'light'} to ${isDark ? 'dark' : 'light'} mode`)
  }

  initLiveChat = () => {
    this.initLiveChatSecondaryElem()
    if(this.secondaryInnerElem) return

    const observer = new MutationObserver(wrapErrorHandler(() => {
      this.initLiveChatSecondaryElem()
      if(!this.secondaryInnerElem) return

      observer.disconnect()
    }))
    this.observer.observe(this.ytdAppElem, {
      childList: true,
      subtree: true
    })
  }
  
  initLiveChatSecondaryElem = () => {
    this.secondaryInnerElem = document.querySelector('#secondary-inner')
    if(!this.secondaryInnerElem) return

    this.initLiveChatElem()
    const observer = new MutationObserver(wrapErrorHandler(this.initLiveChatElem))
    observer.observe(this.secondaryInnerElem, {
      childList: true
    })
  }

  initLiveChatElem = () => {
    const liveChat = this.secondaryInnerElem.querySelector('ytd-live-chat-frame')
    if(!liveChat || this.liveChat === liveChat) return
    
    this.liveChat = liveChat
    this.initLiveChatIframe()
    const observer = new MutationObserver(wrapErrorHandler(this.initLiveChatIframe))
    observer.observe(liveChat, {
      childList: true
    })
  }

  initLiveChatIframe = () => {
    const iframe = this.liveChat.querySelector('iframe')
    if(!iframe || this.liveChatIframe === iframe) return

    this.liveChatIframe = iframe
    this.updateLiveChatTheme()
    iframe.addEventListener('load', this.updateLiveChatTheme)
  }

  updateLiveChatTheme = () => {
    if (!this.liveChat || !this.liveChatIframe) return

    const toDark = this.shouldBeDarkTheme()
    this.liveChat.postToContentWindow({
      'yt-live-chat-set-dark-theme': toDark
    })
  }

  updateImmersiveMode() {
    this.immersiveTheater = (this.settings.immersiveTheaterView && this.view === VIEW_THEATER)
    const changed = (html.getAttribute('data-ambientlight-immersive') === 'true') !== this.immersiveTheater
    if(!changed) return false

    if(this.immersiveTheater) {
      html.setAttribute('data-ambientlight-immersive', true)
    } else {
      html.removeAttribute('data-ambientlight-immersive')
    }

    raf(() => this.updateVideoPlayerSize()) // Because it is incorrect when transitioning from immersive theater to small
    return true
  }
}
