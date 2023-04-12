import { html, body, on, off, raf, ctxOptions, Canvas, SafeOffscreenCanvas, setTimeout, wrapErrorHandler, appendErrorStack } from './generic'
import SentryReporter, { parseSettingsToSentry } from './sentry-reporter'
import BarDetection from './bar-detection'
import Settings, { FRAMESYNC_DECODEDFRAMES, FRAMESYNC_DISPLAYFRAMES, FRAMESYNC_VIDEOFRAMES } from './settings'
import Projector2d from './projector-2d'
import ProjectorWebGL from './projector-webgl'
import { WebGLOffscreenCanvas } from './canvas-webgl'
import { getAverageVideoFramesDifference } from './static-image-detection'
import Theming from './theming'
import Stats from './stats'

const VIEW_DISABLED = 'DISABLED'
const VIEW_DETACHED = 'DETACHED'
const VIEW_SMALL = 'SMALL'
const VIEW_THEATER = 'THEATER'
const VIEW_FULLSCREEN = 'FULLSCREEN'
const VIEW_POPUP = 'POPUP'

const baseUrl = document.currentScript?.getAttribute('data-base-url') || ''

export default class Ambientlight {
  innerStrength = 2
  lastUpdateSizesChanged = 0
  averageVideoFramesDifference = 1

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
  videoFrameCount = 0
  displayFrameRate = 0
  videoFrameRate = 0
  ambientlightFrameCount = 0
  ambientlightFrameRate = 0
  ambientlightVideoDroppedFrameCount = 0
  previousFrameTime = 0
  previousDrawTime = 0

  enableMozillaBug1606251Workaround = false
  enableChromiumBug1123708Workaround = false
  enableChromiumBug1092080Workaround = false
  enableChromiumBugDirectVideoOverlayWorkaround = false

  constructor(ytdAppElem, videoElem) {
    return (async function AmbientlightConstructor() {
      this.ytdAppElem = ytdAppElem
      this.mastheadElem = document.querySelector('#masthead-container')
      if(!this.mastheadElem) {
        throw new Error(`Cannot find mastheadElem: #masthead-container`)
      }

      this.detectChromiumBug1142112Workaround()
      this.detectChromiumBugDirectVideoOverlayWorkaround()
      this.initElems(videoElem)
      this.detectMozillaBug1606251Workaround()
      this.detectMozillaBugSlowCanvas2DReadPixelsWorkaround()
      this.detectChromiumBug1092080Workaround()

      await this.initSettings()
      this.theming = new Theming(this)
      this.stats = new Stats(this)
      this.barDetection = new BarDetection()
      this.detectChromiumBug1123708Workaround()
      this.detectChromiumBugVideoJitterWorkaround()

      if(document.visibilityState === 'hidden') {
        await new Promise(resolve => raf(resolve)) // Prevents lost WebGLContext on pageload in a background tab
      }
      await this.initAmbientlightElems()
      this.initBuffersWrapper()
      await this.initProjectorBuffers()
      this.recreateProjectors()
      this.stats.initElems()

      this.initStyles()
      this.updateStyles()

      this.checkGetImageDataAllowed()
      await this.initListeners()

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
    return document.querySelector('ytd-watch-flexy #player-container-inner')
  }

  get playerTheaterContainerElem() {
    return document.querySelector('ytd-watch-flexy #player-theater-container')
  }

  get playerTheaterContainerElemFromVideo() {
    return this.videoElem?.closest('#player-theater-container')
  }

  get ytdWatchFlexyElemFromVideo() {
    return this.videoElem?.closest('ytd-watch-flexy')
  }

  get ytdWatchFlexyElem() {
    if(!this._ytdWatchFlexyElem) this._ytdWatchFlexyElem = document.querySelector('ytd-watch-flexy')
    return this._ytdWatchFlexyElem
  }

  get thumbnailOverlayElem() {
    if(!this._thumbnailOverlayElem) this._thumbnailOverlayElem = document.querySelector('ytd-watch-flexy .ytp-cued-thumbnail-overlay')
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
    
    this.settingsMenuBtnParent = document.querySelector('ytd-watch-flexy .ytp-right-controls, ytd-watch-flexy .ytp-chrome-controls > *:last-child')
    if(!this.settingsMenuBtnParent) {
      throw new Error('Cannot find settingsMenuBtnParent: .ytp-right-controls, .ytp-chrome-controls > *:last-child')
    }

    this.initVideoElem(videoElem, false)
  }

  initVideoElem(videoElem, initListeners = true) {
    this.cancelScheduledRequestVideoFrame()
    this.videoElem = videoElem
    if(this.enableChromiumBugDirectVideoOverlayWorkaround) {
      this.videoElem.classList.add('ambientlight__chromium-bug-direct-video-overlay-workaround')
    }
    if(initListeners) this.initVideoListeners()
  }

  // FireFox workaround: WebGLParent::RecvReadPixels is slow when reading from a HtmlCanvasElement/OffscreenCanvas (performance scales linear with the amount of pixels to be read)
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1719154
  detectMozillaBugSlowCanvas2DReadPixelsWorkaround() {
    const match = navigator.userAgent.match(/Firefox\/((?:\.|[0-9])+)/)
    if(match) {
      this.enableMozillaBugReadPixelsWorkaround = true
    }
  }
  shouldDrawDirectlyFromVideoElem = () => (
    this.enableMozillaBugReadPixelsWorkaround &&
    this.projector.webGLVersion === 2
  )

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

  detectChromiumBugDirectVideoOverlayWorkaround() {
    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && version >= 59) {
      this.enableChromiumBugDirectVideoOverlayWorkaround = true
    }
  }

  // Fixes video stuttering when display framerate > ambient framerate
  detectChromiumBugVideoJitterWorkaround() {
    if(!this.settings.webGL) return // This has to much impact on the performance of the Canvas2D renderer

    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version) {
      this.enableChromiumBugVideoJitterWorkaround = true
      this.settings.updateVisibility()
    }
  }

  applyChromiumBugVideoJitterWorkaround() {
    try {
      if(!this.enableChromiumBugVideoJitterWorkaround) return
      if(!this.settings.chromiumBugVideoJitterWorkaround) {
        if(this.chromiumBugVideoJitterWorkaround) {
          const { elem, observer } = this.chromiumBugVideoJitterWorkaround
          observer.disconnect()
          if(elem.parentElement)
            elem.parentElement.removeChild(elem)
          this.chromiumBugVideoJitterWorkaround = undefined
        }
        return
      }
      if(this.chromiumBugVideoJitterWorkaround) return

      const elem = document.createElement('div')
      elem.classList.add('ambientlight__chromium-bug-video-jitter-workaround')
      if(this.videoPlayerElem.classList.contains('playing-mode')) {
        this.elem.appendChild(elem)
      }

      const update = wrapErrorHandler(function chromiumBugVideoJitterWorkaroundUpdate(isPlaying) {
        if(!this.videoIsHidden && isPlaying === undefined) {
          isPlaying = this.videoPlayerElem.classList.contains('playing-mode')
        }

        if(!this.videoIsHidden && isPlaying) {
          this.elem.appendChild(elem)
        } else if(elem.parentElement) {
          elem.parentElement.removeChild(elem)
        }
      }.bind(this), true)

      const observer = new MutationObserver(wrapErrorHandler(function chromiumBugVideoJitterWorkaroundMutation(mutations) {
        if(!this.chromiumBugVideoJitterWorkaround) return;

        for(const mutation of mutations) {
          const wasPlaying = mutation.oldValue.split(' ').includes('playing-mode')
          const isPlaying = mutation.target.classList.contains('playing-mode')
          if(wasPlaying === isPlaying) continue

          update(isPlaying)
        }
      }.bind(this), true))
      observer.observe(this.videoPlayerElem, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true
      })

      this.chromiumBugVideoJitterWorkaround = {
        elem,
        observer,
        update
      }
    } catch(ex) {
      console.warn('Ambient light for YouTube™ | applyChromiumBugVideoJitterWorkaround error. Continuing ambientlight initialization...')
      SentryReporter.captureException(ex)
      this.enableChromiumBugVideoJitterWorkaround = false // Prevent retries
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

  resetAverageVideoFramesDifference = () => {
    this.averageVideoFramesDifference = 1
    this.settings.updateAverageVideoFramesDifferenceInfo()
  }

  calculateAverageVideoFramesDifference = async () => {
    if(!this.settings.energySaver) return

    try {
      // const videoId = this.ytdWatchFlexyElem?.playerData?.videoDetails?.videoId
      const difference = await getAverageVideoFramesDifference(this.ytdWatchFlexyElem);
      if(difference === undefined) return

      this.averageVideoFramesDifference = difference
      this.settings.updateAverageVideoFramesDifferenceInfo()
    } catch(ex) {
      SentryReporter.captureException(ex)
    }
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

        this.buffersCleared = true // Always prevent old frame from being drawn
        this.barDetection.clear()
        this.previousPresentedFrames = 0
        // this.stats.videoFrameTimes = []
        // this.stats.frameTimes = []
        this.videoFrameCounts = []
        this.videoPresentedFrames = 0
        this.displayFrameCounts = []
        this.ambientlightFrameCounts = []
        this.lastUpdateStatsTime = performance.now()
        await this.optionalFrame()
      },
      loadeddata: () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return

        this.sizesChanged = true
        this.buffersCleared = true
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
        this.stats.hide()
        this.scheduledNextFrame = false
        this.sizesChanged = true
        this.resetVideoParentElemStyle() // Prevent visible video element above player because of the modified style attribute
      },
      emptied: () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return
        this.clear()
        this.scheduledNextFrame = false
      },
      error: (ex) => {
        console.warn('Ambient light for YouTube™ | Video error:', ex)
        this.clear()
        this.cancelScheduledRequestVideoFrame()
        setTimeout(this.handleVideoError, 1000)
      },
      click: this.settings.onCloseMenu
    }
    for (const name in this.videoListeners) {
      off(this.videoElem, name, this.videoListeners[name])
      on(this.videoElem, name, this.videoListeners[name])
    }
    
    this.playerListeners = this.playerListeners || {
      'yt-autonav-pause-player-ended': this.videoListeners.ended
    }
    for (const name in this.playerListeners) {
      off(this.ytdWatchFlexyElem, name, this.playerListeners[name])
      on(this.ytdWatchFlexyElem, name, this.playerListeners[name])
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
              this.videoObserver.unobserve(entry.target) // video is detached and a new one was created
              continue
            }
            this.videoIsHidden = (entry.intersectionRatio === 0)
            this.videoVisibilityChangeTime = performance.now()
            this.videoElem.getVideoPlaybackQuality() // Correct dropped frames
          }

          if(this.chromiumBugVideoJitterWorkaround) {
            this.chromiumBugVideoJitterWorkaround.update()
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
    this.applyChromiumBugVideoJitterWorkaround()
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

  async initListeners() {
    this.initVideoListeners()

    if(this.settings.webGL) {
      this.projector.handleRestored = async (isControlledLose) => {
        this.buffersCleared = true
        this.sizesChanged = true
        if(!isControlledLose) {
          this.cancelScheduledRequestVideoFrame()
          // eslint-disable-next-line no-self-assign
          this.videoElem.currentTime = this.videoElem.currentTime // Triggers video draw call
        }
        await this.optionalFrame()
      }
    }

    on(document, 'visibilitychange', this.handleDocumentVisibilityChange, false)
    on(document, 'fullscreenchange', function fullscreenchange() {
      this.updateSizes()
    }.bind(this), false)

    on(document, 'keydown', this.handleKeyDown)

    if(this.topElem) {
      this.topElemObserver = new IntersectionObserver(
        wrapErrorHandler(async (entries) => {
          let atTop = true
          for (const entry of entries) {
            atTop = (entry.intersectionRatio !== 0)
          }
          if(this.atTop === atTop) return

          this.atTop = atTop
          await this.updateAtTop()

          // When the video is filled and paused in fullscreen the ambientlight is out of sync with the video
          if(this.isFillingFullscreen && !this.atTop) {
            this.buffersCleared = true
            this.optionalFrame()
          }
        }, true),
        {
          threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      )
      this.topElemObserver.observe(this.topElem)
      this.atTop = window.scrollY === 0
      await this.updateAtTop()
    }

    if(this.settings.webGL)
      window.addEventListener('resize', this.projector.handleWindowResize, false)

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
    this.videoPlayerResizeObserver = new ResizeObserver(function videoPlayerResize(e) {
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

    this.theming.initListeners()

    try {
      on(this.ytdWatchFlexyElem, 'yt-page-data-will-update', () => {
        if(this.averageVideoFramesDifference === 1) return

        this.resetAverageVideoFramesDifference()
      }, undefined, undefined, true)
      on(document, 'yt-page-data-updated', () => {
        if (!this.settings.enabled || !this.isOnVideoPage) return

        this.calculateAverageVideoFramesDifference()
      }, undefined, undefined, true)
    } catch(ex) {
      SentryReporter.captureException(ex)
    }

    const videoPlayerObserver = new MutationObserver(wrapErrorHandler(() => {
      const viewChanged = this.updateView()
      const videoHiddenChanged = this.updateIsVideoHiddenOnWatchPage()
      if(!viewChanged && !videoHiddenChanged) return

      if(videoHiddenChanged && this.isVideoHiddenOnWatchPage) {
        this.clear()
        this.resetVideoParentElemStyle()
        this.sizesChanged = true
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
    const playerContainersObserver = new MutationObserver(wrapErrorHandler(() => {
      this.updateView()
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
      requestIdleCallback(() => this.measureResizeDuration(start), { timeout: 1000 })
    }

    // Do not resize untill the next animation frame
    this.scheduledResize = raf(() => {
      this.scheduledResize = undefined
      if(this.resizeAfterFrames === 0) return

      this.resizeAfterFrames--
      this.resize()
    })
  })

  measureResizeDuration = wrapErrorHandler(function measureResizeDuration(start) {
    const duration = Math.min(1000, performance.now() - start)
    this.resizeDurations.push(duration)
    if(this.resizeDurations.length > 4) this.resizeDurations.splice(0, 1)
    const averageDuration = this.resizeDurations.reduce((a, b) => a + b) / this.resizeDurations.length
    this.delayResizes = averageDuration >= this.resizeDurationThreshold
  }.bind(this))

  handleDocumentVisibilityChange = async () => {
    if (!this.settings.enabled || !this.isOnVideoPage) return
    const isPageHidden = document.visibilityState === 'hidden'
    if(this.isPageHidden === isPageHidden) return

    this.isPageHidden = isPageHidden
    if(this.settings.webGL) {
      await this.projector.handlePageVisibility(isPageHidden)
    }
    if(document.visibilityState !== 'hidden') return

    this.buffersCleared = true
    this.checkIfNeedToHideVideoOverlay()
  }

  handleKeyDown = async (e) => {
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

    await this.onKeyPressed(e.key?.toUpperCase())
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

  onKeyPressed = async (key) => {
    if(key === ' ') return

    const keys = this.settings.getKeys()
    if (key === keys.detectHorizontalBarSizeEnabled) // b by default
      this.settings.clickUI('detectHorizontalBarSizeEnabled')
    if (key === keys.detectVerticalBarSizeEnabled)
      this.settings.clickUI('detectVerticalBarSizeEnabled')
    if (key === keys.detectVideoFillScaleEnabled) // w by default
      this.settings.clickUI('detectVideoFillScaleEnabled')
    if (key === keys.enabled) // a by default
      await this.toggleEnabled()
  }

  async toggleEnabled(enabled) {
    if(this.pendingStart) return
    enabled = (enabled !== undefined) ? enabled : !this.settings.enabled
    if (enabled) {
      await this.enable()
    } else {
      await this.disable()
    }
    this.settings.displayBezelForSetting('enabled')
  }

  checkGetImageDataAllowed() {
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

  async initAmbientlightElems() {
    this.elem = document.createElement('div')
    this.elem.classList.add('ambientlight')
    body.prepend(this.elem)

    this.topElem = document.createElement('div')
    this.topElem.classList.add('ambientlight__top')
    body.prepend(this.topElem)

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

    await this.initProjector()
  }

  initProjector = async () => {
    if(this.settings.webGL) {
      try {
        this.projector = await new ProjectorWebGL(this, this.projectorListElem, this.initProjectorListeners, this.settings)
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
        wrapErrorHandler((entries) => {
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

  async initProjectorBuffers() {
    let projectorsBufferElem;
    let projectorsBufferCtx;
    if(this.settings.webGL) {
      try {
        projectorsBufferElem = new WebGLOffscreenCanvas(1, 1, this.settings)
        projectorsBufferCtx = await projectorsBufferElem.getContext('2d', ctxOptions)
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

  initVideoOverlay() {
    const videoOverlayElem = new Canvas(1, 1)
    videoOverlayElem.classList.add('ambientlight__video-overlay')
    this.videoOverlay = {
      elem: videoOverlayElem,
      ctx: videoOverlayElem.getContext('2d', {
        ...ctxOptions,
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

  updateView = () => {
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
        this.ytdWatchFlexyElemFromVideo
          ? this.ytdWatchFlexyElemFromVideo.getAttribute('theater') !== null
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
        // prepend is overriden by Shady DOM when:
        //   window.shadyDOM.settings.noPatch === "on-demand" && ytcfg.get('EXPERIMENT_FLAGS').polymer_on_demand_shady_dom === true
        // This causes the elements to be removed from the document instead of being added to the ytdAppElem
        if(this.ytdAppElem?.__shady_native_prepend) {
          this.ytdAppElem.__shady_native_prepend(this.elem)
          this.ytdAppElem.__shady_native_prepend(this.topElem)
        } else {
          this.ytdAppElem.prepend(this.elem)
          this.ytdAppElem.prepend(this.topElem)
        }
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
    const enabled = {
      SMALL: enableInViews <= 2,
      THEATER: enableInViews === 0 || (enableInViews >= 2 && enableInViews <= 4),
      FULLSCREEN: enableInViews === 0 || enableInViews >= 4
    }[this.view] || false
    return enabled
  }

  async updateSizes() {
    this.updateView()

    if(this.settings.detectVideoFillScaleEnabled){
      this.detectVideoFillScale()
    }
    const videoScale = this.settings.videoScale
    const noClipOrScale = (this.settings.horizontalBarsClipPercentage == 0 && this.settings.verticalBarsClipPercentage == 0 && videoScale == 100)

    const videoParentElem = this.videoElem.parentElement

    const notVisible = (
      !this.settings.enabled ||
      this.isVR ||
      !videoParentElem ||
      !this.videoPlayerElem ||
      !this.isInEnabledView()
    )
    if (notVisible || noClipOrScale) {
      this.resetVideoParentElemStyle()
    }
    this.lastUpdateSizesChanged = performance.now()
    if (notVisible) {
      await this.hide()
      return false
    }

    this.barsClip = [this.settings.verticalBarsClipPercentage, this.settings.horizontalBarsClipPercentage].map(percentage => percentage / 100)
    this.clippedVideoScale = this.barsClip.map(clip => (1 - (clip * 2)))
    this.shouldStyleVideoParentElem = this.isOnVideoPage && !this.isVideoHiddenOnWatchPage && !this.videoElem.ended && !noClipOrScale && !this.isControlledByAnotherExtension
    if (this.shouldStyleVideoParentElem) {
      const top = Math.max(0, parseInt(this.videoElem.style.top) || 0)
      const left = Math.max(0, parseInt(this.videoElem.style.left) || 0)
      const width = Math.max(0, parseInt(this.videoElem.style.width) || 0)
      videoParentElem.style.width = `${width}px`
      videoParentElem.style.height = this.videoElem.style.height || '100%'
      videoParentElem.style.marginBottom = `${-this.videoElem.offsetHeight}px`
      videoParentElem.style.overflow = 'hidden'
      videoParentElem.style.transform =  `
        translate(${left}px, ${top}px)
        scale(${(videoScale / 100)}) 
        scale(${this.clippedVideoScale[0]}, ${this.clippedVideoScale[1]})
      `
      const VideoClipScale = this.clippedVideoScale.map(scale => Math.round(1000 * (1 / scale)) / 1000)
      videoParentElem.style.setProperty('--video-transform', `
        translate(${-left}px, ${-top}px) 
        scale(${VideoClipScale[0]}, ${VideoClipScale[1]})
      `)
    } else {
      this.resetVideoParentElemStyle()
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
      const relativeBlur = (this.settings.resolution / 100) * this.settings.blur
      const pMinSize = (this.settings.resolution / 100) * 
        ((this.settings.detectHorizontalBarSizeEnabled || this.settings.detectVerticalBarSizeEnabled)
        ? 256
        : (relativeBlur >= 20
            ? 128
            : (relativeBlur >= 10
              ? 192
              : 256
            )
          )
        )
      pScale = Math.min(.5, 
        Math.max(pMinSize / this.srcVideoOffset.width, pMinSize / this.srcVideoOffset.height),
        Math.min(1024 / this.srcVideoOffset.width, 1024 / this.srcVideoOffset.height))
    } else {
      // A size of 512 videoWidth/videoHeight is required to prevent pixel flickering because CanvasContext2D uses no mipmaps
      // A CanvasContext2D size of > 256 is required to enable GPU acceleration in Chrome
      const pMinSize = Math.max(257, Math.min(512, this.srcVideoOffset.width, this.srcVideoOffset.height))
      pScale = Math.max(pMinSize / this.srcVideoOffset.width, pMinSize / this.srcVideoOffset.height)
    }
    const p = {
      w: Math.ceil(this.srcVideoOffset.width * pScale),
      h: Math.ceil(this.srcVideoOffset.height * pScale)
    }
    if(this.p?.w !== p.w || this.p?.h !== p.h) {
      // console.log(`projector: ${this.srcVideoOffset.height} * ${pScale} = ${p.h}`)
      this.p = p
    }
    this.projector.resize(this.p.w, this.p.h)

    if(this.projector.webGLVersion === 1) {
      const pbSize = Math.min(512, Math.max(this.srcVideoOffset.width, this.srcVideoOffset.height))
      const pbSizePowerOf2 = Math.pow(2, 1 + Math.ceil(Math.log(pbSize / 2) / Math.log(2))) // projectorBuffer size must always be a power of 2 for WebGL1 mipmap generation in projector
      this.projectorBuffer.elem.width = pbSizePowerOf2
      this.projectorBuffer.elem.height = pbSizePowerOf2
    } else if(this.projector.webGLVersion === 2) {
      const projectorBufferWidth = this.p.w * 2
      const projectorBufferHeight = this.p.h * 2
      if(this.projectorBuffer.elem.width !== projectorBufferWidth ||
        this.projectorBuffer.elem.height !== projectorBufferHeight)
      {
        // console.log(`projectorBuffer: ${this.p.h} * 2 = ${projectorBufferHeight}`)
        this.projectorBuffer.elem.width = projectorBufferWidth
        this.projectorBuffer.elem.height = projectorBufferHeight
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
    this.stats.initElems()

    this.sizesChanged = false
    this.buffersCleared = true
    return true
  }

  resetVideoParentElemStyle() {
    this.shouldStyleVideoParentElem = false
    const videoParentElem = this.videoElem.parentElement
    if (videoParentElem) {
      videoParentElem.style.transform = ''
      videoParentElem.style.overflow = ''
      videoParentElem.style.height = ''
      videoParentElem.style.marginBottom = ''
      videoParentElem.style.setProperty('--video-transform', '')
    }
  }

  updateStyles() {
    // Fill transparency
    let fillOpacity = this.settings.surroundingContentFillOpacity
    fillOpacity = (fillOpacity !== 10) ? (fillOpacity / 100) : ''
    document.body.style.setProperty('--ambientlight-fill-opacity', fillOpacity)

    // Header transparency
    let headerFillOpacity = this.settings.headerFillOpacity
    headerFillOpacity = (headerFillOpacity !== 100) ? (headerFillOpacity / 100) : ''
    this.mastheadElem.style.setProperty('--ambientlight-fill-opacity', headerFillOpacity)
    this.mastheadElem.classList.toggle('yta-header-transparent', headerFillOpacity !== '')
    

    // Images transparency
    let imageOpacity = this.settings.surroundingContentImagesOpacity
    imageOpacity = (imageOpacity !== 100) ? (imageOpacity / 100) : ''
    document.body.style.setProperty('--ambientlight-image-opacity', imageOpacity)

    // Header transparency
    let headerImageOpacity = this.settings.headerImagesOpacity
    headerImageOpacity = (imageOpacity !== 100) ? (headerImageOpacity / 100) : ''
    this.mastheadElem.style.setProperty('--ambientlight-image-opacity', headerImageOpacity)

    
    // Shadows
    const textAndBtnOnly = this.settings.surroundingContentTextAndBtnOnly
    const getFilterShadow = (color, size, opacity) => (size && opacity) 
      ? (
        (opacity > .5) 
        ? `
          drop-shadow(0 0 ${size}px rgba(${color},${opacity})) 
          drop-shadow(0 0 ${size}px rgba(${color},${opacity}))
        `
        : `drop-shadow(0 0 ${size}px rgba(${color},${opacity * 2}))`
      )
      : ''
    const getTextShadow = (color, size, opacity) => (size && opacity) 
      ? `
        rgba(${color},${opacity}) 0 0 ${size * 2}px,
        rgba(${color},${opacity}) 0 0 ${size * 2}px
      `
      : ''

    // Header shadow
    const headerShadowSize = this.settings.headerShadowSize / 5
    const headerShadowOpacity = this.settings.headerShadowOpacity / 100
    this.mastheadElem.classList.toggle('yta-header-shadow', headerShadowSize && headerShadowOpacity)

    const getHeaderFilterShadow = (color) => getFilterShadow(color, headerShadowSize, headerShadowOpacity)
    const getHeaderTextShadow = (color) => getTextShadow(color, headerShadowSize, headerShadowOpacity)

    // Header !textAndBtnOnly
    this.mastheadElem.style.setProperty(`--ambientlight-filter-shadow`, (!textAndBtnOnly ? getHeaderFilterShadow('0,0,0') : ''))
    this.mastheadElem.style.setProperty(`--ambientlight-filter-shadow-inverted`, (!textAndBtnOnly ? getHeaderFilterShadow('255,255,255') : ''))
    
    // Header textAndBtnOnly
    this.mastheadElem.style.setProperty(`--ambientlight-button-shadow`, (textAndBtnOnly ? getHeaderFilterShadow('0,0,0') : ''))
    this.mastheadElem.style.setProperty(`--ambientlight-button-shadow-inverted`, (textAndBtnOnly ? getHeaderFilterShadow('255,255,255') : ''))

    this.mastheadElem.style.setProperty('--ambientlight-text-shadow', (textAndBtnOnly ? getHeaderTextShadow('0,0,0') : ''))
    this.mastheadElem.style.setProperty('--ambientlight-text-shadow-inverted', (textAndBtnOnly ? getHeaderTextShadow('255,255,255') : ''))

    // Content shadow
    const contentShadowSize = this.settings.surroundingContentShadowSize / 5
    const contentShadowOpacity = this.settings.surroundingContentShadowOpacity / 100
    const getContentFilterShadow = (color) => getFilterShadow(color, contentShadowSize, contentShadowOpacity)
    const getContentTextShadow = (color) => getTextShadow(color, contentShadowSize, contentShadowOpacity)

    // Content !textAndBtnOnly
    document.body.style.setProperty(`--ambientlight-filter-shadow`, (!textAndBtnOnly ? getContentFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambientlight-filter-shadow-inverted`, (!textAndBtnOnly ? getContentFilterShadow('255,255,255') : ''))
    
    // Content textAndBtnOnly
    document.body.style.setProperty(`--ambientlight-button-shadow`, (textAndBtnOnly ? getContentFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambientlight-button-shadow-inverted`, (textAndBtnOnly ? getContentFilterShadow('255,255,255') : ''))

    document.body.style.setProperty('--ambientlight-text-shadow', (textAndBtnOnly ? getContentTextShadow('0,0,0') : ''))
    document.body.style.setProperty('--ambientlight-text-shadow-inverted', (textAndBtnOnly ? getContentTextShadow('255,255,255') : ''))


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
      const videoParentElem = this.videoElem.parentElement
      if(videoParentElem) {
        const videoTransform = videoParentElem.style.getPropertyValue('--video-transform')
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
      ? (this.ytdWatchFlexyElemFromVideo || this.playerTheaterContainerElemFromVideo || body).getBoundingClientRect()
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
      !this.settings.frameFading &&
      !this.settings.showFrametimes
    ) return

    this.scheduledNextFrame = true
    if(!this.videoIsHidden)
      (window.webkitRequestAnimationFrame || requestAnimationFrame)(this.onNextFrameWrapped)
    else
      setTimeout(this.scheduleNextFrameDelayed, this.videoFrameRate ? (1000 / this.videoFrameRate) : 30)
  }


  onNextFrame = async function onNextFrame() {
    if (!this.scheduledNextFrame) return

    this.scheduledNextFrame = false
    if(this.videoElem.ended) return

    if(this.settings.framerateLimit || this.averageVideoFramesDifference < .0175) {
      await this.onNextLimitedFrame()
    } else {
      await this.nextFrame()
      this.nextFrameTime = undefined
    }
    
    this.displayFrameCount++
  }.bind(this)
  onNextFrameWrapped = wrapErrorHandler(this.onNextFrame)
  scheduleNextFrameDelayed = () => (window.webkitRequestAnimationFrame || requestAnimationFrame)(this.onNextFrameWrapped)

  onNextLimitedFrame = async () => {
    const time = performance.now()
    if(this.nextFrameTime) {
      if(this.settings.frameSync === FRAMESYNC_VIDEOFRAMES) {
        if(this.nextFrameTime > time && this.videoFrameCallbackReceived) {
          this.videoFrameCallbackReceived = false
        }
        if(!this.videoFrameCallbackReceived) {
          this.scheduleNextFrame()
          return
        }
      } else if(this.nextFrameTime > time) {
        this.scheduleNextFrame()
        return
      }
    }

    const ambientlightFrameCount = this.ambientlightFrameCount
    await this.nextFrame()
    if(
      this.ambientlightFrameCount <= ambientlightFrameCount
    ) {
      return
    }

    const realFramerateLimit = this.getRealFramerateLimit()
    this.nextFrameTime = Math.max((this.nextFrameTime || time) + (1000 / realFramerateLimit), time)
  }

  getRealFramerateLimit() {
    if(this.averageVideoFramesDifference < .002) return .2 // 5 seconds
    if(this.averageVideoFramesDifference < .0175) return 1 // 1 seconds

    const frameFadingMax = (15 * Math.pow(ProjectorWebGL.subProjectorDimensionMax, 2)) - 1
    const realFramerateLimit = (this.settings.webGL && this.settings.frameFading > frameFadingMax)
      ? Math.max(1, (frameFadingMax / (this.settings.frameFading || 1)) * this.settings.framerateLimit)
      : this.settings.framerateLimit
    return realFramerateLimit
  }

  canScheduleNextFrame = () => (!(
    !this.settings.enabled ||
    !this.isOnVideoPage ||
    this.pendingStart ||
    this.videoElem.ended ||
    this.videoElem.paused ||
    this.videoElem.seeking ||
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

  nextFrame = async () => {
    try {
      const frameTimes = this.settings.showFrametimes ? {
        frameStart: performance.now().toFixed(1)
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
        frameTimes.drawStart = performance.now().toFixed(1)

      if(!this.settings.webGL || this.getImageDataAllowed) {
        results = (await this.drawAmbientlight()) || {}
      }

      if (this.settings.showFrametimes)
        frameTimes.drawEnd = performance.now().toFixed(1)

      this.scheduleNextFrame()

      if (results?.detectBarSize) {
        this.scheduleBarSizeDetection()
      }

      this.stats.addFrametimes(frameTimes, results)

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
      ].includes(ex.name)) {
        console.warn('Ambient light for YouTube™ | Failed to display the ambient light')
        console.error(ex);
        return
      }

      throw ex
    }
  }

  afterNextFrame = async () => {
    try {
      this.afterNextFrameIdleCallback = undefined
      
      if (this.settings.videoOverlayEnabled) {
        this.detectFrameRates()
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
      }
      if((performance.now() - this.lastUpdateStatsTime) > this.updateStatsInterval) {
        this.lastUpdateStatsTime = performance.now()
        requestIdleCallback(() => {
          if (!this.settings.videoOverlayEnabled) {
            this.detectFrameRates()
          }
          this.stats.update()
        }, { timeout: 100 })
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
      this.getVideoFrameCount(),
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

    return this.videoElem.getVideoPlaybackQuality()?.droppedVideoFrames || 0
  }

  getVideoFrameCount() {
    if (!this.videoElem) return 0

    const videoPresentedFrames = (this.settings.frameSync === FRAMESYNC_VIDEOFRAMES && this.videoPresentedFrames)
      ? this.videoPresentedFrames
      : 0

    const totalVideoFrames = this.videoElem.getVideoPlaybackQuality()?.totalVideoFrames || 0
    return Math.max(videoPresentedFrames, totalVideoFrames)
  }

  shouldShow = () => (
    this.settings.enabled &&
    this.isOnVideoPage &&
    !this.isVR &&
    this.isInEnabledView()
  )

  async drawAmbientlight() {
    const shouldShow = this.shouldShow()
    if(!shouldShow) {
      if (!this.isHidden) await this.hide()
      return
    }

    const drawTime = performance.now()
    if (this.isHidden) await this.show()

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
      if (!hasNewFrame && !this.settings.frameFading) return

      if (this.settings.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.isHidden) {
        if(this.enableChromiumBug1092080Workaround) {
          this.videoOverlay.ctx.clearRect(0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        }
        this.videoOverlay.ctx.drawImage(this.videoElem, 
          0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
      }

      const shouldDrawDirectlyFromVideoElem = this.shouldDrawDirectlyFromVideoElem()
      if (!dontDrawBuffer) {
        if(!shouldDrawDirectlyFromVideoElem) {
          this.projectorBuffer.ctx.drawImage(this.videoElem,
            0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
        }

        if (!dontDrawAmbientlight) {
          if(!shouldDrawDirectlyFromVideoElem) {
            this.projector.draw(this.projectorBuffer.elem)
          } else {
            this.projector.draw(this.videoElem)
          }
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
        (this.getImageDataAllowed && this.checkGetImageDataAllowed()) || 
        this.getImageDataAllowed
      ) {
        this.barDetection.detect(
          (
            this.shouldDrawDirectlyFromVideoElem() ||
            (
              (this.projectorBuffer.elem.height < 256 || this.projectorBuffer.elem.width < 256) &&
              this.projectorBuffer.elem.height < this.videoElem.videoHeight
            )
          ) 
            ? this.videoElem
            : this.projectorBuffer.elem ,
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

    let hide = this.videoElem.paused || this.videoElem.seeking || this.videoIsHidden
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
        this.stats.update()
      }
    } else if (
      syncThreshold == 100 ||
      isHiddenChangeTimestamp + 2000 < performance.now()
    ) {
      if (this.videoOverlay.isHidden) {
        this.videoOverlay.elem.classList.remove('ambientlight__video-overlay--hide')
        this.videoOverlay.isHidden = false
        this.hideVideoOverlayCache.isHiddenChangeTimestamp = performance.now()
        this.stats.update()
      }
    }
  }

  async enable(initial = false) {
    if (!initial) {
      this.settings.set('enabled', true, true)
    }
    
    this.mastheadElem.classList.add('no-animation')
    await this.start(initial)
    this.mastheadElem.classList.remove('no-animation')
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
  }

  start = async (initial = false) => {
    if (!this.isOnVideoPage || !this.settings.enabled || this.pendingStart) return

    this.showedCompareWarning = false
    this.showedDetectBarSizeWarning = false
    this.nextFrameTime = undefined
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
      if(document.visibilityState === 'hidden') {
        await new Promise(resolve => raf(resolve))
      }
      if(this.settings.prioritizePageLoadSpeed) {
        await new Promise(resolve => requestIdleCallback(resolve, { timeout: 2000 })) // Buffering/rendering budget for low-end devices
        if(document.visibilityState === 'hidden') {
          await new Promise(resolve => raf(resolve))
        }
      }
      this.calculateAverageVideoFramesDifference()
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

  cancelScheduledRequestVideoFrame = () => {
    if(!this.requestVideoFrameCallbackId) return

    if(this.videoElem?.cancelVideoFrameCallback) {
      try {
        this.videoElem.cancelVideoFrameCallback(this.requestVideoFrameCallbackId)
      } catch(ex) {
        console.warn(`Failed to cancel current requested videoFrameCallback: ${this.requestVideoFrameCallbackId}`)
      }
    }
    this.requestVideoFrameCallbackId = undefined
  }

  scheduleRequestVideoFrame = () => {
    if (
      // this.videoFrameCallbackReceived || // Doesn't matter because this can be true now but not when the new video frame is received
      this.requestVideoFrameCallbackId ||
      this.settings.frameSync != FRAMESYNC_VIDEOFRAMES ||

      this.videoIsHidden || // Partial solution for https://bugs.chromium.org/p/chromium/issues/detail?id=1142112#c9
      !this.canScheduleNextFrame()
    ) return

    this.requestVideoFrameCallbackId = this.videoElem.requestVideoFrameCallback(this.onVideoFrame)
  }

  onVideoFrame = wrapErrorHandler(function onVideoFrame(timestamp, info) {
    if (!this.requestVideoFrameCallbackId) {
      console.warn(`Ambient light for YouTube™ | Old rvfc fired. Ignoring a possible duplicate. ${this.requestVideoFrameCallbackId} | ${timestamp} | ${info}`)
      return
    }
    this.videoElem.requestVideoFrameCallback(() => {}) // Requesting as soon as possible to prevent skipped video frames on displays with a matching framerate
    this.stats.receiveVideoFrametimes(timestamp, info)
    this.requestVideoFrameCallbackId = undefined
    this.videoFrameCallbackReceived = true
    this.videoPresentedFrames = info?.presentedFrames || 0
    
    if(this.scheduledNextFrame) return
    this.scheduledNextFrame = true

    this.onNextFrame()
  }.bind(this), true)

  async hide() {
    if (this.isHidden) return
    this.isHidden = true

    await this.theming.updateTheme()

    if (this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    this.resetVideoParentElemStyle()
    this.clear()
    this.stats.hide()

    html.removeAttribute('data-ambientlight-enabled')
    html.removeAttribute('data-ambientlight-hide-scrollbar')

    this.updateSizes()
    this.updateVideoPlayerSize()
  }

  async show() {
    if (!this.isHidden) return
    this.isHidden = false

    await this.theming.updateTheme(() => {
      // Pre-style to prevent black/white flashes
      if(this.playerTheaterContainerElem) this.playerTheaterContainerElem.style.background = 'none'
      html.style.setProperty('background', this.theming.shouldBeDarkTheme() ? '#000' : '#fff', 'important')
    })
    
    const stack = new Error().stack
    await new Promise((resolve, reject) => raf(() => {
      try {
        html.setAttribute('data-ambientlight-enabled', true)
        if(this.settings.hideScrollbar) html.setAttribute('data-ambientlight-hide-scrollbar', true)

        // Reset
        if(this.playerTheaterContainerElem) this.playerTheaterContainerElem.style.background = ''
        html.style.background = ''

        this.handleDocumentVisibilityChange() // In case the visibility had changed while disabled
        this.updateVideoPlayerSize()
        this.updateSizes()
        resolve()
      } catch(ex) {
        appendErrorStack(stack, ex)
        reject(ex)
      }
    }))
  }

  updateAtTop = async () => {
    this.mastheadElem.classList.toggle('at-top', this.atTop)

    if(this.settings.webGL)
      await this.projector.handleAtTopChange(this.atTop)
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