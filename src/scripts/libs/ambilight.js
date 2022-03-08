import { $, html, body, on, off, raf, ctxOptions, Canvas, SafeOffscreenCanvas, requestIdleCallback, setTimeout, wrapErrorHandler } from './generic'
import AmbilightSentry, { getSelectorTreeString, getNodeTreeString } from './ambilight-sentry'
import { HorizontalBarDetection } from './horizontal-bar-detection'
import { isWatchPageUrl } from './utils'
import Settings from './settings'
import Projector2d from './projector-2d'
import ProjectorWebGL from './projector-webgl'
import { WebGLCanvas } from './canvas-webgl'

const VIEW_DETACHED = 'VIEW_DETACHED'
const VIEW_SMALL = 'VIEW_SMALL'
const VIEW_THEATER = 'VIEW_THEATER'
const VIEW_FULLSCREEN = 'VIEW_FULLSCREEN'
const VIEW_POPUP = 'VIEW_POPUP'

const THEME_LIGHT = -1
const THEME_DEFAULT = 0
const THEME_DARK = 1

export default class Ambilight {
  horizontalBarDetection = new HorizontalBarDetection()
  innerStrength = 2
  lastCheckVideoSizeTime = 0

  videoOffset = {}
  srcVideoOffset = {}

  isHidden = true
  isOnVideoPage = true
  showedCompareWarning = false
  getImageDataAllowed = true

  atTop = true
  p = null
  view = -1
  isFullscreen = false
  isFillingFullscreen = false
  isVR = false

  lastUpdateStatsTime = 0
  videoFrameCount = 0
  displayFrameRate = 0
  videoFrameRate = 0
  videoFrameRateMeasureStartTime = 0
  videoFrameRateMeasureStartFrame = 0
  ambilightFrameCount = 0
  ambilightFrameRate = 0
  ambilightVideoDroppedFrameCount = 0
  previousFrameTime = 0
  previousDrawTime = 0

  enableMozillaBug1606251Workaround = false
  enableChromiumBug1123708Workaround = false
  enableChromiumBug1092080Workaround = false

  constructor(ytdAppElem, videoElem) {
    this.ytdAppElem = ytdAppElem
    this.mastheadElem = ytdAppElem.querySelector('#masthead-container')
    if(!this.mastheadElem) {
      throw new Error(`Cannot find mastheadElem: #masthead-container`)
    }

    this.videoHasRequestVideoFrameCallback = !!videoElem.requestVideoFrameCallback
    this.detectChromiumBug1142112Workaround()
    this.initElems(videoElem)
    this.initVideoElem(videoElem)
    this.detectMozillaBug1606251Workaround()
    this.detectChromiumBug1123708Workaround()
    this.detectChromiumBug1092080Workaround()

    this.initFeedbackLink()
    this.initSettings()

    this.initAmbilightElems()
    this.initBuffers()
    this.recreateProjectors()
    this.initFPSListElem()

    this.initStyles()
    this.updateStyles()

    this.updateImmersiveMode()
    this.checkGetImageDataAllowed()

    this.initListeners()

    wrapErrorHandler(() => {
      if (this.settings.enabled)
        this.enable(true)
    })()
  }

  initElems(videoElem) {
    this.ytdWatchFlexyElem = videoElem.closest('ytd-watch-flexy')
    if(!this.ytdWatchFlexyElem) {
      throw new Error('Cannot find ytdWatchFlexyElem: ytd-watch-flexy')
    }

    this.videoPlayerElem = videoElem.closest('.html5-video-player')
    if(!this.videoPlayerElem) {
      throw new Error('Cannot find videoPlayerElem: .html5-video-player')
    }

    this.videoContainerElem = videoElem.closest('.html5-video-container')
    if (!this.videoContainerElem) {
      throw new Error('Cannot find videoContainerElem: .html5-video-container')
    }
    
    this.settingsMenuBtnParent = this.videoPlayerElem.querySelector('.ytp-right-controls, .ytp-chrome-controls > *:last-child')
    if(!this.settingsMenuBtnParent) {
      throw new Error('Cannot find settingsMenuBtnParent: .ytp-right-controls, .ytp-chrome-controls > *:last-child')
    }
  }

  initVideoElem(videoElem) {
    this.videoElem = videoElem
    this.applyChromiumBug1142112Workaround()
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
  // when requestVideoFrameCallback is used and the video is offscreen 
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1142112
  detectChromiumBug1142112Workaround() {
    const match = navigator.userAgent.match(/Chrome\/((?:\.|[0-9])+)/)
    const version = (match && match.length > 1) ? parseFloat(match[1]) : null
    if(version && this.videoHasRequestVideoFrameCallback) {
      this.enableChromiumBug1142112Workaround = true
    }
  }

  applyChromiumBug1142112Workaround() {
    if(!this.enableChromiumBug1142112Workaround) return;

    try {
      if(this.videoObserver) {
        this.videoObserver.disconnect()
      }

      this.videoIsHidden = false
      if(!this.videoObserver) {
        this.videoObserver = new IntersectionObserver(
          wrapErrorHandler((entries, observer) => {
            // Disconnect when ambilight crashed on initialization to avoid invalid error reports
            if(!window.ambilight) {
              observer.disconnect()
              return
            }

            for (const entry of entries) {
              this.videoIsHidden = (entry.intersectionRatio === 0)
              this.videoVisibilityChangeTime = performance.now()
              this.videoElem.getVideoPlaybackQuality() // Correct dropped frames
            }
          }, true),
          {
            threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
          }
        )
      }

      const videoElem = this.videoElem
      this.videoObserver.observe(videoElem)
      
      if(videoElem.ambilightGetVideoPlaybackQuality) return

      const ambilight = this
      Object.defineProperty(videoElem, 'ambilightGetVideoPlaybackQuality', {
        value: videoElem.getVideoPlaybackQuality
      })
      this.previousDroppedVideoFrames = 0
      this.droppedVideoFramesCorrection = 0
      let previousGetVideoPlaybackQualityTime = performance.now()
      videoElem.getVideoPlaybackQuality = function() {
        const original = videoElem.ambilightGetVideoPlaybackQuality()
        let droppedVideoFrames = original.droppedVideoFrames
        if(droppedVideoFrames < ambilight.previousDroppedVideoFrames) {
          ambilight.previousDroppedVideoFrames = 0
          ambilight.droppedVideoFramesCorrection = 0
        }
        // Ignore dropped frames for 2 seconds due to requestVideoFrameCallback dropping frames when the video is offscreen
        if(ambilight.videoIsHidden || (ambilight.videoVisibilityChangeTime > previousGetVideoPlaybackQualityTime - 2000)) {
          ambilight.droppedVideoFramesCorrection += (droppedVideoFrames - ambilight.previousDroppedVideoFrames)
          // console.log('droppedVideoFramesCorrection ', ambilight.droppedVideoFramesCorrection)
        } else {
          // console.log('Reporting original', original.droppedVideoFrames, ' dropped frames')
        }
        ambilight.previousDroppedVideoFrames = droppedVideoFrames
        droppedVideoFrames = Math.max(0, droppedVideoFrames - ambilight.droppedVideoFramesCorrection)
        // if(ambilight.droppedVideoFramesCorrection) {
        //   console.log('original droppedVideoFrames:', ambilight.previousDroppedVideoFrames, ' corrected:', droppedVideoFrames)
        // }
        previousGetVideoPlaybackQualityTime = performance.now()
        return {
          corruptedVideoFrames: original.corruptedVideoFrames,
          creationTime: original.creationTime,
          droppedVideoFrames,
          totalVideoFrames: original.totalVideoFrames,
        }
      }
    } catch(ex) {
      console.warn('Ambient light for YouTube™ | applyChromiumBug1142112Workaround error. Continuing ambilight initialization...')
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }

  // Chromium workaround: Force to render the blur originating from the canvasses past the browser window
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1123708
  detectChromiumBug1123708Workaround() {
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

  scheduleHandleVideoResize = () => {
    if (!this.settings.enabled || !this.isOnVideoPage) return
    if(this.scheduledHandleVideoResize) {
      // console.log('prevented duplicate calls')
      return
    }

    const wasView = this.view
    this.updateView()
    this.updateImmersiveMode()
    if(wasView === this.view) {
      // Spare multiple resize handler calls when resizing the browser window
      this.scheduledHandleVideoResize = raf(() => {
        this.scheduledHandleVideoResize = null
        this.handleVideoResize()
      })
    } else {
      // When changing viewmodes draw directly to prevent flickering
      this.handleVideoResize()
    }
  }

  handleVideoResize = () => {
    if (!this.settings.enabled || !this.isOnVideoPage) return

    // console.log('handleVideoResize')
    this.nextFrame()
  }

  initListeners() {
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

    on(this.videoElem, 'seeked', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      // When the video is paused this is the first event. Else [loadeddata] is first
      if (this.initVideoIfSrcChanged()) return

      this.buffersCleared = true // Always prevent old frame from being drawn
      this.optionalFrame()
    })
    on(this.videoElem, 'loadeddata', (e) => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      // Whent the video is playing this is the first event. Else [seeked] is first
      this.initVideoIfSrcChanged()
    })
    on(this.videoElem, 'playing', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      if (this.videoElem.paused) return // When paused handled by [seeked]
      this.optionalFrame()
    })
    on(this.videoElem, 'ended', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      this.clear()
      this.scheduledNextFrame = false
      this.resetVideoContainerStyle() // Prevent visible video element above player because of the modified style attribute
    })
    on(this.videoElem, 'emptied', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      this.clear()
      this.scheduledNextFrame = false
    })
    on(this.videoElem, 'error', (ex) => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      console.error('Video error:', ex)
    })

    on(this.videoElem, 'click', this.settings.onCloseMenu)

    on(document, 'visibilitychange', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return
      if(document.visibilityState !== 'hidden') return

      this.buffersCleared = true
      this.checkIfNeedToHideVideoOverlay()
    }, false);

    on(document, 'keydown', (e) => {
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
    })

    this.bodyResizeObserver = new ResizeObserver(wrapErrorHandler(entries => {
      // console.log('body resized')
      wrapErrorHandler(() => {
        this.videoPlayerElem.setInternalSize() // Video element has the wrong size when resizing the browser down to width to ytp-large-width-mode
      })()
      this.sizesInvalidated = true
      this.scheduleHandleVideoResize() // Because the position could be shifted
    }))
    this.bodyResizeObserver.observe(document.body)

    // Makes sure the player size is updated before the first frame is rendered
    // (youtube does this to late in the next frame)
    this.videoContainerResizeObserver = new ResizeObserver(wrapErrorHandler(entries => {
      // console.log('container resized')
      this.videoPlayerElem.setSize() // Resize the video element because youtube does not observe the player
      this.videoPlayerElem.setInternalSize() // setSize alone does not always resize the videoElem
    }))
    this.videoContainerResizeObserver.observe(this.videoContainerElem)

    this.videoResizeObserver = new ResizeObserver(wrapErrorHandler(entries => {
      // console.log('video resized')
      wrapErrorHandler(() => {
        this.videoPlayerElem.setInternalSize() // Sometimes when the video is resized by setInternalSize it is incorrect
      })()
      this.sizesInvalidated = true
      this.scheduleHandleVideoResize()
    }))
    this.videoResizeObserver.observe(this.videoElem)

    // Fix YouTube bug: focus on video element without scrolling to the top
    on(this.videoElem, 'focus', () => {
      if (!this.settings.enabled || !this.isOnVideoPage) return

      const startTop = {
        window: this.view === VIEW_FULLSCREEN ? this.ytdAppElem.scrollTop : window.scrollY,
        video: this.videoContainerElem?.getBoundingClientRect()?.top
      };
      raf(() => {
        const endTop = {
          window: VIEW_FULLSCREEN ? this.ytdAppElem.scrollTop : window.scrollY,
          video: this.videoContainerElem?.getBoundingClientRect()?.top
        }
        if(startTop.window === endTop.window) return
        
        if(this.view === VIEW_FULLSCREEN) {
          this.ytdAppElem.scrollTop = startTop.window
        } else {
          window.scrollTo(window.scrollX, startTop.window)
        }
      })
    }, true)

    // Appearance (theme) changes initiated by the YouTube menu
    this.originalTheme = html.getAttribute('dark') ? 1 : -1
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

    // More reliable way to detect the end screen and other modes in which the video is invisible.
    // Because when seeking to the end the ended event is not fired from the videoElem
    if (this.videoPlayerElem) {
      on(this.videoPlayerElem, 'onStateChange', (state) => {
        this.isBuffering = (state === 3)

        if(!this.isBuffering && this.settings.enabled && this.isOnVideoPage)
          this.scheduleNextFrame()
      })
      this.isBuffering = (this.videoPlayerElem.getPlayerState() === 3)

      const observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => {
        const mutation = mutationsList[0]
        const classList = mutation.target.classList
        
        const isVideoHiddenOnWatchPage = (
          classList.contains('ended-mode') || 
          // classList.contains('unstarted-mode')  || // Unstarted is not hidden? Causes initial render without ambilight
          classList.contains('ytp-player-minimized')
        )
        if(this.isVideoHiddenOnWatchPage === isVideoHiddenOnWatchPage) return

        this.isVideoHiddenOnWatchPage = isVideoHiddenOnWatchPage
        if(!this.isVideoHiddenOnWatchPage) {
          this.optionalFrame()
          return
        }

        this.clear()
        this.resetVideoContainerStyle()
      }))
    
      observer.observe(this.videoPlayerElem, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class']
      })
    } else {
      console.warn('Ambient light for YouTube™ | html5-video-player not found')
    }
  }

  onKeyPressed = (key) => {
    const keys = this.settings.getKeys()
    
    if (key === keys.detectHorizontalBarSizeEnabled) // b by default
      this.settings.clickUI('detectHorizontalBarSizeEnabled')
    if (key === keys.detectVideoFillScaleEnabled) // w by default
      this.settings.clickUI('detectVideoFillScaleEnabled')
    if (key === keys.immersive) // z by default
      this.toggleImmersiveMode()
    if (key === keys.enabled) // a by default
      this.toggleEnabled()
  }

  toggleEnabled(enabled) {
    enabled = (enabled !== undefined) ? enabled : !this.settings.enabled
    if (enabled) {
      this.enable()
    } else {
      this.disable()
    }
    this.settings.displayBezelForSetting('enabled')
  }

  toggleImmersiveMode(enabled) {
    enabled = (enabled !== undefined) ? enabled : !this.settings.immersive
    this.settings.set('immersive', enabled)
    this.updateImmersiveMode()
    this.settings.displayBezelForSetting('immersive')
  }

  checkGetImageDataAllowed(reportUnexpectedChange = false) {
    const isSameOriginVideo = (this.videoElem.src && this.videoElem.src.indexOf(location.origin) !== -1)
    const getImageDataAllowed = (!window.chrome || isSameOriginVideo)
    if(this.getImageDataAllowed === getImageDataAllowed) return

    this.getImageDataAllowed = getImageDataAllowed
    this.settings.setGetImageDataAllowedVisibility(getImageDataAllowed)
  }

  initAmbilightElems() {
    this.elem = document.createElement('div')
    this.elem.classList.add('ambilight')
    body.prepend(this.elem)

    this.topElem = document.createElement('div')
    this.topElem.classList.add('ambilight__top')
    body.prepend(this.topElem)
    
    this.topElemObserver = new IntersectionObserver(
      wrapErrorHandler((entries, observer) => {
        for (const entry of entries) {
          this.atTop = (entry.intersectionRatio !== 0)
          this.checkScrollPosition()

          // When the video is filled and paused in fullscreen the ambilight is out of sync with the video
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
    this.videoShadowElem.classList.add('ambilight__video-shadow')
    this.elem.prepend(this.videoShadowElem)

    this.filterElem = document.createElement('div')
    this.filterElem.classList.add('ambilight__filter')
    this.elem.prepend(this.filterElem)

    if (this.enableChromiumBug1123708Workaround) {
      this.chromiumBug1123708WorkaroundElem = new Canvas(1, 1, true)
      this.chromiumBug1123708WorkaroundElem.classList.add('ambilight__chromium-bug-1123708-workaround')
      this.filterElem.prepend(this.chromiumBug1123708WorkaroundElem)
    }
  
    this.clipElem = document.createElement('div')
    this.clipElem.classList.add('ambilight__clip')
    this.filterElem.prepend(this.clipElem)

    this.projectorsElem = document.createElement('div')
    this.projectorsElem.classList.add('ambilight__projectors')
    this.clipElem.prepend(this.projectorsElem)
    
    this.projectorListElem = document.createElement('div')
    this.projectorListElem.classList.add('ambilight__projector-list')
    this.projectorsElem.prepend(this.projectorListElem)

    //this.projector = new Projector2d(this.projectorsElem)
    this.projector = new ProjectorWebGL(this.projectorListElem) 

    const shadowElem = new Canvas(1920, 1080, true)
    shadowElem.classList.add('ambilight__shadow')
    this.projectorsElem.appendChild(shadowElem)
    const shadowCtx = shadowElem.getContext('2d', { ...ctxOptions, alpha: true })
    this.shadow = {
      elem: shadowElem,
      ctx: shadowCtx
    }

    // Dont draw ambilight when its not in viewport
    this.isAmbilightHiddenOnWatchPage = false
    if(this.ambilightObserver) {
      this.ambilightObserver.disconnect()
    }
    if(!this.ambilightObserver) {
      this.ambilightObserver = new IntersectionObserver(
        wrapErrorHandler((entries, observer) => {
          for (const entry of entries) {
            this.isAmbilightHiddenOnWatchPage = (entry.intersectionRatio === 0)
            if(this.isAmbilightHiddenOnWatchPage) continue
            
            this.optionalFrame()
          }
        }, true),
        {
          threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      )
    }
    this.ambilightObserver.observe(shadowElem)

    // Warning: Using Canvas elements in this div instead of OffScreenCanvas
    // while waiting for a fix for this issue:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1015729
    //this.buffersElem = document.createElement('div')
    //this.buffersElem.classList.add('ambilight__buffers')
    //this.elem.prepend(this.buffersElem)
  }

  initBuffers() {
    this.buffersWrapperElem = document.createElement('div')
    this.buffersWrapperElem.classList.add('ambilight__buffers-wrapper')

    const videoSnapshotBufferElem = new WebGLCanvas(1, 1, true)
    if (videoSnapshotBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(videoSnapshotBufferElem)
    }
    this.videoSnapshotBuffer = {
      elem: videoSnapshotBufferElem,
      ctx: videoSnapshotBufferElem.getContext('2d', ctxOptions)
    }

    const videoSnapshotGetImageDataBufferElem = new SafeOffscreenCanvas(1, 1)
    if (videoSnapshotGetImageDataBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(videoSnapshotGetImageDataBufferElem)
    }
    this.videoSnapshotGetImageDataBuffer = {
      elem: videoSnapshotGetImageDataBufferElem,
      ctx: videoSnapshotGetImageDataBufferElem.getContext('2d', {
        ...ctxOptions,
        desynchronized: true
      })
    }

    const projectorsBufferElem = new WebGLCanvas(1, 1, true)
    if (projectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(projectorsBufferElem)
    }
    this.projectorBuffer = {
      elem: projectorsBufferElem,
      ctx: projectorsBufferElem.getContext('2d', ctxOptions)
    }

    this.elem.appendChild(this.buffersWrapperElem)
  }

  initSettings() {
    this.settings = new Settings(this, this.settingsMenuBtnParent, this.videoPlayerElem)
  }

  initFPSListElem() {
    if (this.videoSyncedElem && this.videoSyncedElem.isConnected) return

    this.FPSListElem = document.createElement('div')
    this.FPSListElem.classList.add('ambilight__fps-list')

    this.displayFPSElem = document.createElement('div')
    this.displayFPSElem.classList.add('ambilight__display-fps')
    this.FPSListElem.append(this.displayFPSElem)

    this.videoFPSElem = document.createElement('div')
    this.videoFPSElem.classList.add('ambilight__video-fps')
    this.FPSListElem.append(this.videoFPSElem)

    this.videoDroppedFramesElem = document.createElement('div')
    this.videoDroppedFramesElem.classList.add('ambilight__video-dropped-frames')
    this.FPSListElem.append(this.videoDroppedFramesElem)

    this.videoSyncedElem = document.createElement('div')
    this.videoSyncedElem.classList.add('ambilight__video-synced')
    this.FPSListElem.append(this.videoSyncedElem)

    this.ambilightFPSElem = document.createElement('div')
    this.ambilightFPSElem.classList.add('ambilight__ambilight-fps')
    this.FPSListElem.append(this.ambilightFPSElem)

    this.ambilightDroppedFramesElem = document.createElement('div')
    this.ambilightDroppedFramesElem.classList.add('ambilight__ambilight-dropped-frames')
    this.FPSListElem.append(this.ambilightDroppedFramesElem)

    this.videoPlayerElem.prepend(this.FPSListElem)
  }

  initVideoOverlay() {
    const videoOverlayElem = new Canvas(1, 1)
    videoOverlayElem.classList.add('ambilight__video-overlay')
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
    //this.previousProjectorBuffer
    const previousProjectorsBufferElem = new Canvas(1, 1, true) 
    if (previousProjectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(previousProjectorsBufferElem)
    }
    this.previousProjectorBuffer = {
      elem: previousProjectorsBufferElem,
      ctx: previousProjectorsBufferElem.getContext('2d', ctxOptions)
    }

    //this.blendedProjectorBuffer
    const blendedProjectorsBufferElem = new Canvas(1, 1, true) 
    if (blendedProjectorsBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(blendedProjectorsBufferElem)
    }
    this.blendedProjectorBuffer = {
      elem: blendedProjectorsBufferElem,
      ctx: blendedProjectorsBufferElem.getContext('2d', ctxOptions)
    }
  }

  initVideoOverlayWithFrameBlending() {
    //this.videoOverlayBuffer
    const videoOverlayBufferElem = new Canvas(1, 1, true) 
    if (videoOverlayBufferElem.tagName === 'CANVAS') {
      this.buffersWrapperElem.appendChild(videoOverlayBufferElem)
    }
    this.videoOverlayBuffer = {
      elem: videoOverlayBufferElem,
      ctx: videoOverlayBufferElem.getContext('2d', ctxOptions)
    }

    //this.previousVideoOverlayBuffer
    const previousVideoOverlayBufferElem = new Canvas(1, 1, true) 
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
        this.setHorizontalBars(0)
      }
      if (this.settings.detectVideoFillScaleEnabled) {
        this.settings.set('videoScale', 100, true)
      }
    }
    this.prevVideoPath = videoPath
  }

  setHorizontalBars(percentage) {
    if(this.settings.horizontalBarsClipPercentage === percentage) return

    this.settings.horizontalBarsClipPercentage = percentage
    this.sizesInvalidated = true
    this.optionalFrame()
    setTimeout(() => {
      this.settings.set('horizontalBarsClipPercentage', percentage, true)
    }, 1)
  }

  initFeedbackLink() {
    const version = html.getAttribute('data-ambilight-version') || ''
    const os = html.getAttribute('data-ambilight-os') || ''
    const browser = html.getAttribute('data-ambilight-browser') || ''
    this.feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}&entry.964326861=${browser}`
  }

  recreateProjectors() {
    const levels = Math.max(2, Math.round((this.settings.spread / this.settings.edge)) + this.innerStrength + 1)
    this.projector.recreate(levels)
  }

  clear() {
    this.horizontalBarDetection.clear()

    // Clear canvasses
    const canvasses = [
      this.videoSnapshotBuffer,
      this.videoSnapshotGetImageDataBuffer,
      ...this.projector.projectors
    ]
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
      // canvas.ctx.clearRect(0, 0, canvas.elem.width, canvas.elem.height)
      canvas.elem.width = 1;
    }

    this.buffersCleared = true
    this.sizesInvalidated = true
    this.checkIfNeedToHideVideoOverlay()
    this.scheduleNextFrame()
  }

  detectVideoFillScale() {
    let videoScale = 100
    if(this.videoElem.offsetWidth && this.videoElem.offsetHeight) {
      if(this.videoPlayerElem) {
        const videoScaleY = (100 - (this.settings.horizontalBarsClipPercentage * 2)) / 100
        const videoWidth = this.videoElem.offsetWidth
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

  updateView() {
    // const prevView = this.view
    if(document.contains(this.videoPlayerElem)) {
      if(this.videoPlayerElem.classList.contains('ytp-fullscreen'))
        this.view = VIEW_FULLSCREEN
      else if(this.videoPlayerElem.classList.contains('ytp-player-minimized'))
        this.view = VIEW_POPUP
      else if(this.ytdWatchFlexyElem && this.ytdWatchFlexyElem.getAttribute('theater') !== null)
        this.view = VIEW_THEATER
      else
        this.view = VIEW_SMALL
    } else {
      this.view = VIEW_DETACHED
    }
    this.isFullscreen = (this.view == VIEW_FULLSCREEN)
    // Todo: Set the settings for the specific view
    // if(prevView !== this.view) {
    //   console.log('VIEW CHANGED: ', this.view)
    //   this.getAllSettings()
    // }
  }

  updateSizes() {
    // console.log('updateSizes')
    if(this.settings.detectVideoFillScaleEnabled){
      this.detectVideoFillScale()
    }

    this.updateView()
    this.isVR = this.videoPlayerElem.classList.contains('ytp-webgl-spherical')
    const videoScale = this.settings.videoScale
    const noClipOrScale = (this.settings.horizontalBarsClipPercentage == 0 && videoScale == 100)

    const videoElemParentElem = this.videoElem.parentNode

    const notVisible = (
      !this.settings.enabled ||
      this.isVR ||
      !videoElemParentElem ||
      !this.videoPlayerElem ||
      this.videoPlayerElem.classList.contains('ytp-player-minimized') ||
      (this.isFullscreen && !this.settings.enableInFullscreen)
    )
    if (notVisible || noClipOrScale) {
      this.resetVideoContainerStyle()
    }
    if (notVisible) {
      this.hide()
      return true
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

    const horizontalBarsClip = this.settings.horizontalBarsClipPercentage / 100
    const shouldStyleVideoContainer = !this.isVideoHiddenOnWatchPage && !this.videoElem.ended && !noClipOrScale
    if (shouldStyleVideoContainer) {
      const top = Math.max(0, parseInt(this.videoElem.style.top))
      videoElemParentElem.style.height = '100%'
      videoElemParentElem.style.marginBottom = `${-this.videoElem.offsetHeight}px`
      videoElemParentElem.style.overflow = 'hidden'

      this.horizontalBarsClipScaleY = (1 - (horizontalBarsClip * 2))
      videoElemParentElem.style.transform =  `
        translateY(${top}px) 
        scale(${(videoScale / 100)}) 
        scaleY(${this.horizontalBarsClipScaleY})
      `
      videoElemParentElem.style.setProperty('--video-transform', `
        translateY(${-top}px) 
        scaleY(${(Math.round(1000 * (1 / this.horizontalBarsClipScaleY)) / 1000)})
      `)
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

    this.srcVideoOffset = {
      top: this.videoOffset.top,
      width: this.videoElem.videoWidth,
      height: this.videoElem.videoHeight
    }

    const minSize = 512
    const scaleX = this.srcVideoOffset.width / minSize
    const scaleY = this.srcVideoOffset.height / minSize
    const scale = Math.min(scaleX, scaleY)
    // A size of > 256 is required to enable keep GPU acceleration enabled in Chrome
    // A side with a size of <= 512 is required to enable GPU acceleration in Chrome
    if (scale < 1) {
      this.p = {
        w: minSize,
        h: minSize
      }
    } else {
      this.p = {
        w: Math.round(this.srcVideoOffset.width / scale),
        h: Math.round((this.srcVideoOffset.height) / scale) // * (1 - (horizontalBarsClip * 2))
      }
    }

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

    this.horizontalBarsClipScaleY = (1 - (horizontalBarsClip * 2))
    this.projectorsElem.style.left = `${unscaledLeft}px`
    this.projectorsElem.style.top = `${unscaledTop - 1}px`
    this.projectorsElem.style.width = `${unscaledWidth}px`
    this.projectorsElem.style.height = `${unscaledHeight}px`
    this.projectorsElem.style.transform = `
      scale(${(videoScale / 100)}) 
      scaleY(${this.horizontalBarsClipScaleY})
    `
    
    if(this.settings.videoShadowOpacity != 0 && this.settings.videoShadowSize != 0) {
      this.videoShadowElem.style.display = 'block'
      this.videoShadowElem.style.left = `${unscaledLeft}px`
      this.videoShadowElem.style.top = `${unscaledTop}px`
      this.videoShadowElem.style.width = `${unscaledWidth}px`
      this.videoShadowElem.style.height = `${(unscaledHeight * this.horizontalBarsClipScaleY)}px`
      this.videoShadowElem.style.transform = `
        translate3d(0,0,0) 
        translateY(${(unscaledHeight * horizontalBarsClip)}px) 
        scale(${(videoScale / 100)})
      `
    } else {
      this.videoShadowElem.style.display = ''
    }

    const blur = this.settings.blur
    const contrast = this.settings.contrast
    const brightness = this.settings.brightness
    const saturation = this.settings.saturation
    this.filterElem.style.filter = `
      ${(blur != 0) ? `blur(${Math.round(this.videoOffset.height) * (blur * .0025)}px)` : ''}
      ${(contrast != 100) ? `contrast(${contrast}%)` : ''}
      ${(brightness != 100) ? `brightness(${brightness}%)` : ''}
      ${(saturation != 100) ? `saturate(${saturation}%)` : ''}
    `.trim()

    this.projector.resize(this.p.w, this.p.h)

    this.projectorBuffer.elem.width = this.p.w
    this.projectorBuffer.elem.height = this.p.h

    const frameBlending = this.settings.frameBlending
    if (frameBlending) {
      if(!this.previousProjectorBuffer || !this.blendedProjectorBuffer) {
        this.initFrameBlending()
      }
      this.previousProjectorBuffer.elem.width = this.p.w
      this.previousProjectorBuffer.elem.height = this.p.h
      this.blendedProjectorBuffer.elem.width = this.p.w
      this.blendedProjectorBuffer.elem.height = this.p.h
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
      this.videoContainerElem.appendChild(videoOverlay.elem)
    } else if (!videoOverlayEnabled && videoOverlay && videoOverlay.elem.parentNode) {
      videoOverlay.elem.parentNode.removeChild(videoOverlay.elem)
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

    this.videoSnapshotBuffer.elem.width = this.p.w
    this.videoSnapshotBuffer.elem.height = this.p.h
    this.videoSnapshotGetImageDataBuffer.elem.width = this.p.w
    this.videoSnapshotGetImageDataBuffer.elem.height = this.p.h
    this.videoSnapshotBufferBarsClipPx = Math.round(this.videoSnapshotBuffer.elem.height * horizontalBarsClip)


    this.resizeCanvasses()
    this.initFPSListElem()

    this.sizesInvalidated = false
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
    // console.log('updateStyles')
    // Images transparency

    const ImagesTransparency = this.settings.surroundingContentImagesTransparency
    const imageOpacity = (ImagesTransparency) ? (1 - (ImagesTransparency / 100)) : ''
    document.body.style.setProperty('--ambilight-image-opacity', imageOpacity)


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
    document.body.style.setProperty(`--ambilight-filter-shadow`, (!textAndBtnOnly ? getFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambilight-filter-shadow-inverted`, (!textAndBtnOnly ? getFilterShadow('255,255,255') : ''))
    
    // Text and buttons only
    document.body.style.setProperty(`--ambilight-button-shadow`, (textAndBtnOnly ? getFilterShadow('0,0,0') : ''))
    document.body.style.setProperty(`--ambilight-button-shadow-inverted`, (textAndBtnOnly ? getFilterShadow('255,255,255') : ''))
    const getTextShadow = (color) => (shadowSize && shadowOpacity) 
      ? `
        rgba(${color},${shadowOpacity}) 0 0 ${shadowSize * 2}px,
        rgba(${color},${shadowOpacity}) 0 0 ${shadowSize * 2}px
      `
      : ''
    document.body.style.setProperty('--ambilight-text-shadow', (textAndBtnOnly ? getTextShadow('0,0,0') : ''))
    document.body.style.setProperty('--ambilight-text-shadow-inverted', (textAndBtnOnly ? getTextShadow('255,255,255') : ''))


    // Video shadow
    
    const videoShadowSize = parseFloat(this.settings.videoShadowSize, 10) / 2 + Math.pow(this.settings.videoShadowSize / 5, 1.77) // Chrome limit: 250px | Firefox limit: 100px
    const videoShadowOpacity = this.settings.videoShadowOpacity / 100
    
    document.body.style.setProperty('--ambilight-video-shadow-background', 
      (videoShadowSize && videoShadowOpacity) ? `rgba(0,0,0,${videoShadowOpacity})` : '')
    document.body.style.setProperty('--ambilight-video-shadow-box-shadow', 
      (videoShadowSize && videoShadowOpacity)
        ? `
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px,
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px
        `
        : '')


    // Video scale

    document.body.style.setProperty('--ambilight-html5-video-player-overflow', 
      (this.settings.videoScale > 100) ?  'visible' : '')


    // Debanding

    const baseurl = html.getAttribute('data-ambilight-baseurl') || ''
    const debandingStrength = parseFloat(this.settings.debandingStrength)
    const noiseImageIndex = (debandingStrength > 75) ? 3 : (debandingStrength > 50) ? 2 : 1
    const noiseOpacity =  debandingStrength / ((debandingStrength > 75) ? 100 : (debandingStrength > 50) ? 75 : 50)

    document.body.style.setProperty('--ambilight-debanding-content', 
      debandingStrength ? `''` : '')
    document.body.style.setProperty('--ambilight-debanding-background', 
      debandingStrength ? `url('${baseurl}images/noise-${noiseImageIndex}.png')` : '')
    document.body.style.setProperty('--ambilight-debanding-opacity', 
      debandingStrength ? noiseOpacity : '')
  }

  resizeCanvasses() {
    const projectorSize = {
      w: this.videoOffset.width,
      h: this.videoOffset.height * this.horizontalBarsClipScaleY
    }
    const ratio = (projectorSize.w > projectorSize.h) ?
      {
        x: 1,
        y: (projectorSize.w / projectorSize.h)
      } : {
        x: (projectorSize.h / projectorSize.w),
        y: 1
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
    for (let i = 0; i < this.projector.levels; i++) {
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

    this.projector.rescale(scales)

    this.shadow.elem.style.transform = `scale(${lastScale.x + 0.01}, ${lastScale.y + 0.01})`
    this.shadow.ctx.clearRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)

    //Shadow gradient 
    const drawGradient = (size, edge, keyframes, fadeOutFrom, darkest, horizontal) => {
      const points = [
        0,
        ...keyframes.map(e => Math.max(
          0, edge - (edge * e.p) - (edge * fadeOutFrom * (1 - e.p))
        )),
        edge - (edge * fadeOutFrom),
        edge + size + (edge * fadeOutFrom),
        ...keyframes.reverse().map(e => Math.min(
          edge + size + edge, edge + size + (edge * e.p) + (edge * fadeOutFrom * (1 - e.p))
        )),
        edge + size + edge
      ]

      const pointMax = (points[points.length - 1])
      const gradient = this.shadow.ctx.createLinearGradient(
        0,
        0,
        horizontal ? this.shadow.elem.width : 0,
        !horizontal ? this.shadow.elem.height : 0
      )

      let gradientStops = []
      gradientStops.push([Math.min(1, points[0] / pointMax), `rgba(0,0,0,${darkest})`])
      for (const i in keyframes) {
        const e = keyframes[i]
        gradientStops.push([Math.min(1, points[0 + keyframes.length - i] / pointMax), `rgba(0,0,0,${e.o})`])
      }
      gradientStops.push([Math.min(1, points[1 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
      gradientStops.push([Math.min(1, points[2 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
      keyframes.reverse()
      for (const i in keyframes) {
        const e = keyframes[i]
        gradientStops.push([Math.min(1, points[2 + (keyframes.length * 2) - i] / pointMax), `rgba(0,0,0,${e.o})`])
      }
      gradientStops.push([Math.min(1, points[3 + (keyframes.length * 2)] / pointMax), `rgba(0,0,0,${darkest})`])

      gradientStops = gradientStops.map(args => [(Math.round(args[0] * 10000)/ 10000), args[1]])
      for (const gs of gradientStops) {
        gradient.addColorStop(...gs)
      }
      this.shadow.ctx.fillStyle = gradient
      this.shadow.ctx.fillRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)
    }

    const edge = {
      w: ((projectorSize.w * lastScale.x) - projectorSize.w) / 2 / lastScale.x,
      h: ((projectorSize.h * lastScale.y) - projectorSize.h) / 2 / lastScale.y
    }
    const video = {
      w: (projectorSize.w / lastScale.x),
      h: (projectorSize.h / lastScale.y)
    }

    const plotKeyframes = (length, powerOf, darkest) => {
      const keyframes = []
      for (let i = 1; i < length; i++) {
        keyframes.push({
          p: (i / length),
          o: Math.pow(i / length, powerOf) * darkest
        })
      }
      return keyframes.map(({p, o}) => ({
        p: (Math.round(p * 10000) / 10000),
        o: (Math.round(o * 10000) / 10000)
      }))
    }
    const darkest = 1
    const easing = (16 / (this.settings.fadeOutEasing * .64))
    const keyframes = plotKeyframes(256, easing, darkest)

    let fadeOutFrom = this.settings.bloom / 100
    const fadeOutMinH = -(video.h / 2 / edge.h)
    const fadeOutMinW = -(video.w / 2 / edge.w)
    fadeOutFrom = Math.max(fadeOutFrom, fadeOutMinH, fadeOutMinW)

    drawGradient(video.h, edge.h, keyframes, fadeOutFrom, darkest, false)
    drawGradient(video.w, edge.w, keyframes, fadeOutFrom, darkest, true)

    // Directions
    const scaleW = this.shadow.elem.width / (video.w + edge.w + edge.w)
    const scaleH = this.shadow.elem.height / (video.h + edge.h + edge.h)
    this.shadow.ctx.fillStyle = '#000000'


    if(!this.settings.directionTopEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.moveTo(0, 0)
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      
      this.shadow.ctx.fill()
    }

    if(!this.settings.directionRightEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.shadow.ctx.fill()
    }

    if(!this.settings.directionBottomEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.moveTo(0,                                     scaleH * (edge.h + video.h + edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.shadow.ctx.fill()
    }

    if(!this.settings.directionLeftEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.moveTo(0,                                     0)
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(0,                                     scaleH * (edge.h + video.h + edge.h))
      
      this.shadow.ctx.fill()
    }
  }

  checkVideoSize(checkPosition = true) {
    if (this.canvassesInvalidated) {
      this.canvassesInvalidated = false
      this.recreateProjectors()
    }

    if (this.sizesInvalidated) {
      this.sizesInvalidated = false
      return this.updateSizes()
    }

    //Resized
    if (this.previousEnabled !== this.settings.enabled) {
      this.previousEnabled = this.settings.enabled
      return this.updateSizes()
    }

    //Auto quality moved up or down
    if (this.srcVideoOffset.width !== this.videoElem.videoWidth
      || this.srcVideoOffset.height !== this.videoElem.videoHeight) {
      return this.updateSizes()
    }

    if (this.settings.videoOverlayEnabled && this.videoOverlay && this.videoElem.getAttribute('style') !== this.videoOverlay.elem.getAttribute('style')) {
      return this.updateSizes()
    }
    
    const noClipOrScale = (this.settings.horizontalBarsClipPercentage == 0 && this.settings.videoScale == 100)
    if(!noClipOrScale) {
      const videoElemParentElem = this.videoElem.parentElement
      if(videoElemParentElem) {
        const videoTransform = videoElemParentElem.style.getPropertyValue('--video-transform')
        const top = Math.max(0, parseInt(this.videoElem.style.top))
        const scaleY = (Math.round(1000 * (1 / this.horizontalBarsClipScaleY)) / 1000)
        if(
          videoTransform.indexOf(`translateY(${-top}px)`) === -1 ||
          videoTransform.indexOf(`scaleY(${scaleY})`) === -1
        ) {
          return this.updateSizes()
        }
      }
    }

    if(checkPosition) {
      const projectorsElemRect = this.getElemRect(this.projectorsElem)
      const videoElemRect = this.getElemRect(this.videoElem)
      const expectedProjectsElemRectY = videoElemRect.top + (videoElemRect.height * (this.settings.horizontalBarsClipPercentage/100))
      if (
        Math.abs(projectorsElemRect.width - videoElemRect.width) > 1 ||
        Math.abs(projectorsElemRect.left - videoElemRect.left) > 1 ||
        Math.abs(projectorsElemRect.top - expectedProjectsElemRectY) > 2
      ) {
        return this.updateSizes()
      }
    }

    return true
  }

  getElemRect(elem) {
    const scrollableRect = (this.isFullscreen) ? this.ytdWatchFlexyElem.getBoundingClientRect() : body.getBoundingClientRect()
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
      this.settings.frameSync == 150 &&
      this.requestVideoFrameCallbackId &&
      !this.videoIsHidden &&
      !this.settings.frameBlending &&
      !this.settings.showFPS
    ) return

    this.scheduledNextFrame = true
    if(!this.videoIsHidden)
      requestAnimationFrame(this.onNextFrame)
    else
      setTimeout(() => requestAnimationFrame(this.onNextFrame), this.videoFrameRate ? (1000 / this.videoFrameRate) : 30)
  }

  onNextFrame = wrapErrorHandler(() => {
    if (!this.scheduledNextFrame) return

    this.scheduledNextFrame = false
    if(this.videoElem.ended) return

    if(this.settings.framerateLimit) {
      this.onNextLimitedFrame()
    } else {
      this.nextFrame()
      this.nextFrameTime = undefined
    }

    this.detectDisplayFrameRate()
    this.detectAmbilightFrameRate()
    this.detectVideoFrameRate()
    // this.detectVideoIsDroppingFrames()
  })

  onNextLimitedFrame = () => {
    const time = performance.now()
    if(this.nextFrameTime > time) {
      this.scheduleNextFrame()
      return
    }

    const ambilightFrameCount = this.ambilightFrameCount
    this.nextFrame()
    if(
      this.ambilightFrameCount <= ambilightFrameCount
    ) {
      return
    }

    this.nextFrameTime = Math.max((this.nextFrameTime || time) + (1000 / this.settings.framerateLimit), time)
  }

  canScheduleNextFrame = () => (!(
    !this.settings.enabled ||
    !this.isOnVideoPage ||
    this.videoElem.ended ||
    this.videoElem.paused ||
    this.videoElem.seeking ||
    // this.isBuffering || // Delays requestVideoFrameCallback when going to a unloaded timestamp
    this.isVideoHiddenOnWatchPage ||
    this.isAmbilightHiddenOnWatchPage
  ))

  optionalFrame = () => {
    if(
      !this.settings.enabled ||
      !this.isOnVideoPage ||
      this.videoElem.ended ||
      ((!this.videoElem.paused && !this.videoElem.seeking) && this.scheduledNextFrame)
    ) return
    
    this.nextFrame()
  }

  nextFrame = () => {
    this.delayedCheckVideoSizeAndPosition = false
    if (!this.p) {
      if(!this.checkVideoSize()) {
        //If was detected hidden by checkVideoSize => updateSizes this.p won't be initialized yet
        return
      }
    } else if(this.sizesInvalidated) {
      this.checkVideoSize(false)
    } else {
      this.delayedCheckVideoSizeAndPosition = true
    }
    
    let results = {}
    try {
      results = this.drawAmbilight() || {}
    } catch (ex) {
      if(ex.name == 'NS_ERROR_NOT_AVAILABLE') {
        if(!this.catchedNS_ERROR_NOT_AVAILABLE) {
          this.catchedNS_ERROR_NOT_AVAILABLE = true
          throw ex
        }
      } else if(ex.name == 'NS_ERROR_OUT_OF_MEMORY') {
        if(!this.catchedNS_ERROR_OUT_OF_MEMORY) {
          this.catchedNS_ERROR_OUT_OF_MEMORY = true
          throw ex
        }
      } else {
        throw ex
      }
    }

    if(this.canScheduleNextFrame() && !this.isBuffering) {
      this.scheduleNextFrame()
    }

    if (results.detectHorizontalBarSize) {
      this.scheduleHorizontalBarSizeDetection()
    }

    if(
      this.afterNextFrameIdleCallback ||
      (
        !this.settings.videoOverlayEnabled &&
        !(
          this.delayedCheckVideoSizeAndPosition &&
          (performance.now() - this.lastCheckVideoSizeTime) > 2000
        ) &&
        !((performance.now() - this.lastUpdateStatsTime) > 2000)
      )
    ) return
    
    this.afterNextFrameIdleCallback = requestIdleCallback(this.afterNextFrame, { timeout: 1000/30 })
  }

  afterNextFrame = () => {
    try {
      this.afterNextFrameIdleCallback = undefined

      if (this.settings.videoOverlayEnabled) {
        this.checkIfNeedToHideVideoOverlay()
      }
      
      if (
        this.delayedCheckVideoSizeAndPosition &&
        (performance.now() - this.lastCheckVideoSizeTime) > 2000
      ) {
        this.checkVideoSize(true)
        this.lastCheckVideoSizeTime = performance.now()
      } else if((performance.now() - this.lastUpdateStatsTime) > 2000) {
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

  detectVideoFrameRate() {
    if (this.videoFrameRateStartTime === undefined) {
      this.videoFrameRateStartTime = 0
      this.videoFrameRateStartCount = 0
    }

    const videoFrameRateTime = performance.now()
    if (this.videoFrameRateStartTime + 2000 < videoFrameRateTime) {
      const videoFrameRateCount = this.getVideoFrameCount() + this.getVideoDroppedFrameCount()
      if (this.videoFrameRateStartCount !== 0) {
        this.videoFrameRate = Math.max(0,
          (
            (videoFrameRateCount - this.videoFrameRateStartCount) / 
            ((videoFrameRateTime - this.videoFrameRateStartTime) / 1000)
          )
        )
      }
      this.videoFrameRateStartCount = videoFrameRateCount
      this.videoFrameRateStartTime = videoFrameRateTime
    }
  }

  detectDisplayFrameRate = () => {
    const displayFrameRateTime = performance.now()
    if (this.displayFrameRateStartTime < displayFrameRateTime - 2000) {
      this.displayFrameRate = Math.max(0, 
        (
          this.displayFrameRateFrame / 
          ((displayFrameRateTime - this.displayFrameRateStartTime) / 1000)
        )
      )
      this.displayFrameRateFrame = 1
      this.displayFrameRateStartTime = displayFrameRateTime
    } else {
      if (!this.displayFrameRateFrame) {
        this.displayFrameRateFrame = 1
        this.displayFrameRateStartTime = displayFrameRateTime
      } else {
        this.displayFrameRateFrame++
      }
    }
  }

  detectAmbilightFrameRate() {
    if (this.ambilightFrameRateStartTime === undefined) {
      this.ambilightFrameRateStartTime = 0
      this.ambilightFrameRateStartCount = 0
    }

    const time = performance.now()
    if (this.ambilightFrameRateStartTime + 2000 < time) {
      const count = this.ambilightFrameCount
      if (this.ambilightFrameRateStartCount !== 0) {
        this.ambilightFrameRate = Math.max(0, 
          (
            (count - this.ambilightFrameRateStartCount) / 
            ((time - this.ambilightFrameRateStartTime) / 1000)
          )
        )
      }
      this.ambilightFrameRateStartCount = count
      this.ambilightFrameRateStartTime = time
    }
  }

  getVideoDroppedFrameCount() {
    if (!this.videoElem) return 0

    // Firefox
    if(this.videoElem.mozDecodedFrames) {
      let mozDroppedFrames = Math.max(0, (this.videoElem.mozPresentedFrames - this.videoElem.mozPaintedFrames))

      // We need a cache becuase mozPresentedFrames is sometimes updated before mozPaintedFrames
      const cache = this.videoMozDroppedFramesCache || []
      cache.push(mozDroppedFrames)
      if (cache.length > 30) cache.splice(0, 1)
      this.videoMozDroppedFramesCache = cache
      mozDroppedFrames = [...cache].sort((a, b) => a - b)[0]

      return mozDroppedFrames
    }

    return (
      this.videoElem.webkitDroppedFrameCount || // Chrome
      0
    )
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
    this.videoFPSElem.textContent = ''
    this.videoDroppedFramesElem.textContent = ''
    this.videoSyncedElem.textContent = ''
    this.ambilightFPSElem.textContent = ''
    this.ambilightDroppedFramesElem.textContent = ''
    this.displayFPSElem.textContent = ''
  }

  updateStats() {
    if (!this.settings.showFPS || this.isHidden) return;

    // Display FPS
    const displayFPSText = `DISPLAY: ${this.displayFrameRate.toFixed(2)} ${this.displayFrameRate ? `(${(1000/this.displayFrameRate).toFixed(2)}ms)` : ''}`
    const displayFPSColor = (this.displayFrameRate < this.videoFrameRate - 1)
      ? '#f55'
      : (this.displayFrameRate < this.videoFrameRate - 0.01) ? '#ff3' : '#7f7'

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

    // Ambilight FPS
    const ambilightFPSText = `AMBIENT LIGHT: ${this.ambilightFrameRate.toFixed(2)} ${this.ambilightFrameRate ? `(${(1000/this.ambilightFrameRate).toFixed(2)}ms)` : ''}`
    const ambilightFPSColor = (this.ambilightFrameRate < this.videoFrameRate * .9)
      ? '#f55'
      : (this.ambilightFrameRate < this.videoFrameRate - 0.01) ? '#ff3' : '#7f7'

    // Ambilight dropped frames
    const ambilightDroppedFramesText = `AMBIENT LIGHT DROPPED: ${this.ambilightVideoDroppedFrameCount}`
    const ambilightDroppedFramesColor = (this.ambilightVideoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

    // Render all stats
    this.displayFPSElem.style.color = displayFPSColor
    this.displayFPSElem.textContent = displayFPSText
    this.videoFPSElem.textContent = videoFPSText
    this.videoDroppedFramesElem.textContent = videoDroppedFramesText
    this.videoDroppedFramesElem.style.color = videoDroppedFramesColor
    this.videoSyncedElem.textContent = videoSyncedText
    this.videoSyncedElem.style.color = videoSyncedColor
    this.ambilightFPSElem.textContent = ambilightFPSText
    this.ambilightFPSElem.style.color = ambilightFPSColor
    this.ambilightDroppedFramesElem.textContent = ambilightDroppedFramesText
    this.ambilightDroppedFramesElem.style.color = ambilightDroppedFramesColor
  }

  drawAmbilight() {
    if (!this.settings.enabled || !this.isOnVideoPage) return

    if (
      this.isVR ||
      (!this.settings.enableInFullscreen && this.isFullscreen)
    ) {
      this.hide()
      return
    }

    const drawTime = performance.now()
    if (this.isHidden) {
      this.show()
    }

    if (
      (
        this.atTop &&
        this.isFillingFullscreen && 
        !this.settings.detectHorizontalBarSizeEnabled &&
        !this.settings.frameBlending &&
        !this.settings.videoOverlayEnabled
      ) ||
      this.isVideoHiddenOnWatchPage || 
      // this.isAmbilightHiddenOnWatchPage || // Disabled because: When in fullscreen isFillingFullscreen goes to false the observer needs a frame to render the shown ambilight element. So instead we handle this in the canScheduleNextFrame check
      this.videoElem.ended || 
      this.videoElem.readyState === 0 || // HAVE_NOTHING
      this.videoElem.readyState === 1    // HAVE_METADATA
    ) return

    //performance.mark('start-drawing')
    let newVideoFrameCount = this.getVideoFrameCount()

    let updateVideoSnapshot = this.buffersCleared
    if(!updateVideoSnapshot) {
      if (this.settings.frameSync == 150) { // PERFECT
        if(this.videoIsHidden) {
          updateVideoSnapshot = (this.previousFrameTime < (drawTime - (1000 / Math.max(24, this.videoFrameRate)))) // Force video.webkitDecodedFrameCount to update on Chromium by always executing drawImage
        } else {
          if(this.videoFrameCallbackReceived && this.videoFrameCount == newVideoFrameCount) {
            newVideoFrameCount++
          }
          updateVideoSnapshot = this.videoFrameCallbackReceived
          this.videoFrameCallbackReceived = false

          // Fallback for when requestVideoFrameCallback stopped working
          if (!updateVideoSnapshot) {
            updateVideoSnapshot = (this.videoFrameCount < newVideoFrameCount)
          }
        }
      } else if(this.settings.frameSync == 0) { // PERFORMANCE
        updateVideoSnapshot = (this.videoFrameCount < newVideoFrameCount)
      } else if (this.settings.frameSync == 50) { // BALANCED
        updateVideoSnapshot = true
      } else if (this.settings.frameSync == 100) { // HIGH PRECISION
        updateVideoSnapshot = true
      }
    }

    if(updateVideoSnapshot) {
      this.videoSnapshotBuffer.ctx.drawImage(this.videoElem, 
        0, 0, this.videoSnapshotBuffer.elem.width, this.videoSnapshotBuffer.elem.height)
    }

    let hasNewFrame = this.buffersCleared
    if(this.settings.frameSync == 150) { // PERFECT
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if(this.settings.frameSync == 0) { // PERFORMANCE
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if (this.settings.frameSync == 50 || this.settings.frameBlending) { // BALANCED
      hasNewFrame = hasNewFrame || (this.videoFrameCount < newVideoFrameCount)
      
      if (this.videoFrameRate && this.displayFrameRate && this.displayFrameRate > this.videoFrameRate) {
        if(!hasNewFrame || this.settings.framerateLimit > this.videoFrameRate - 1) {
          if(
            (this.getImageDataAllowed && this.checkGetImageDataAllowed(true)) ||
            this.getImageDataAllowed
          ) {
            // Execute getImageData on a separate buffer for performance:
            // 1. We don't interrupt the video to ambilight canvas flow (144hz instead of 85hz)
            // 2. We don't keep getting penalized after horizontal bar detection is disabled  (144hz instead of 45hz)
            const getImageDataBuffer = this.videoSnapshotGetImageDataBuffer
            getImageDataBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem, 0, 0)

            let lines = []
            let partSize = Math.ceil(getImageDataBuffer.elem.height / 3)
            try {
              for (let i = partSize; i < getImageDataBuffer.elem.height; i += partSize) {
                lines.push(getImageDataBuffer.ctx.getImageData(0, i, getImageDataBuffer.elem.width, 1).data)
              }
            } catch (ex) {
              if (!this.showedCompareWarning) {
                this.showedCompareWarning = true
                throw ex
              }
            }

            if (!hasNewFrame) {
              const isConfirmedNewFrame = this.isNewFrame(this.oldLines, lines)
              if (isConfirmedNewFrame) {
                newVideoFrameCount++
                hasNewFrame = true
              }
            }
            //performance.mark('comparing-compare-end')

            if (hasNewFrame) {
              if(this.oldLines) {
                this.oldLines.length = 0 // Free memory
              }
              this.oldLines = lines
            }
          }
        }
      }
    } else if (this.settings.frameSync == 100) { // HIGH PRECISION
      hasNewFrame = true
    }
    
    const droppedFrames = (this.videoFrameCount > 120 && this.videoFrameCount < newVideoFrameCount - 1)
    if (droppedFrames && !this.buffersCleared) {
      this.ambilightVideoDroppedFrameCount += newVideoFrameCount - (this.videoFrameCount + 1)
    }
    if (newVideoFrameCount > this.videoFrameCount || newVideoFrameCount < this.videoFrameCount - 60) {
      this.videoFrameCount = newVideoFrameCount
    }

    const dontDrawAmbilight = (
      this.atTop &&
      this.isFillingFullscreen
    )

    if (this.settings.frameBlending && this.settings.frameBlendingSmoothness) {
      if (!this.previousProjectorBuffer) {
        this.initFrameBlending()
      }
      if (this.settings.videoOverlayEnabled && !this.previousVideoOverlayBuffer) {
        this.initVideoOverlayWithFrameBlending()
      }

      // Prevent unnessecary frames drawing when frameBlending is not 100% but keep counting becuase we calculate with this.ambilightFrameRate
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
          if(!this.buffersCleared) {
            this.previousProjectorBuffer.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
          }
          // Prevent adjusted videoSnapshotBufferBarsClipPx from leaking previous frame into the frame
          this.projectorBuffer.ctx.clearRect(0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
          this.projectorBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem,
            0,
            this.videoSnapshotBufferBarsClipPx,
            this.p.w,
            this.p.h - (this.videoSnapshotBufferBarsClipPx * 2),
            0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
          if(this.buffersCleared) {
            this.previousProjectorBuffer.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
          }
        }

        let alpha =  1
        const ambilightFrameDuration = 1000 / this.ambilightFrameRate
        if(hasNewFrame) {
          this.frameBlendingFrameTimeStart = drawTime - (ambilightFrameDuration / 2)
        }
        if(this.displayFrameRate >= this.videoFrameRate * 1.33) {
          if(hasNewFrame && !this.previousDrawFullAlpha) {
            alpha = 0 // Show previous frame fully to prevent seams
          } else {
            const videoFrameDuration = 1000 / this.videoFrameRate
            const frameToDrawDuration = drawTime - this.frameBlendingFrameTimeStart
            const frameToDrawDurationThresshold = (frameToDrawDuration + (ambilightFrameDuration / 2)) / (this.settings.frameBlendingSmoothness / 100)
            // console.log(frameToDrawDurationThresshold, frameToDrawDuration, ambilightFrameDuration, videoFrameDuration)
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
        // console.log(hasNewFrame, this.buffersCleared, alpha)

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

        if (!dontDrawAmbilight) {
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
        if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
          this.videoOverlay.ctx.clearRect(0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        }
        this.videoOverlay.ctx.drawImage(this.videoElem, 
          0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
      }

      if (!dontDrawAmbilight) {
        // Prevent adjusted videoSnapshotBufferBarsClipPx from leaking previous frame into the frame
        this.projectorBuffer.ctx.clearRect(0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
        this.projectorBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem,
          0,
          this.videoSnapshotBufferBarsClipPx,
          this.p.w,
          this.p.h - (this.videoSnapshotBufferBarsClipPx * 2), 
          0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)

        // if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
        //   for (const projector of this.projectors) {
        //     projector.ctx.clearRect(0, 0, projector.elem.width, projector.elem.height)
        //   }
        // }
        this.projector.draw(this.projectorBuffer.elem)

        // Todo: copy videoSnapshotBuffer instead with clipping
      }
    }

    this.buffersCleared = false
    this.ambilightFrameCount++
    this.previousDrawTime = drawTime
    if(hasNewFrame) {
      this.previousFrameTime = drawTime
    }

    if(this.enableMozillaBug1606251Workaround) {
      this.elem.style.transform = `translateZ(${this.ambilightFrameCount % 10}px)`;
    }

    // Horizontal bar detection
    if(
      this.settings.detectHorizontalBarSizeEnabled &&
      hasNewFrame
    ) {
      return { detectHorizontalBarSize: true }
    }
  }

  scheduleHorizontalBarSizeDetection = () => {
    try {
      if(this.horizontalBarDetection.run) return

      if(
        (this.getImageDataAllowed && this.checkGetImageDataAllowed(true)) || 
        this.getImageDataAllowed
      ) {
        this.horizontalBarDetection.detect(
          this.videoSnapshotBuffer,
          this.settings.detectColoredHorizontalBarSizeEnabled,
          this.settings.detectHorizontalBarSizeOffsetPercentage,
          this.settings.horizontalBarsClipPercentage,
          wrapErrorHandler(this.scheduleHorizontalBarSizeDetectionCallback)
        )
      }
    } catch (ex) {
      if (!this.showedDetectHorizontalBarSizeWarning) {
        this.showedDetectHorizontalBarSizeWarning = true
        throw ex
      }
    }
  }

  scheduleHorizontalBarSizeDetectionCallback = (percentage) => {
    if(this.settings.detectHorizontalBarSizeEnabled && percentage !== undefined)
      this.setHorizontalBars(percentage)
  }

  checkIfNeedToHideVideoOverlay() {
    if(!this.videoOverlay) return

    if(!this.hideVideoOverlayCache) {
      this.hideVideoOverlayCache = {
        prevAmbilightVideoDroppedFrameCount: this.ambilightVideoDroppedFrameCount,
        framesInfo: [],
        isHiddenChangeTimestamp: 0
      }
    }

    let {
      prevAmbilightVideoDroppedFrameCount,
      framesInfo,
      isHiddenChangeTimestamp
    } = this.hideVideoOverlayCache

    const newFramesDropped = Math.max(0, this.ambilightVideoDroppedFrameCount - prevAmbilightVideoDroppedFrameCount)
    this.hideVideoOverlayCache.prevAmbilightVideoDroppedFrameCount = this.ambilightVideoDroppedFrameCount
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
        this.videoOverlay.elem.classList.add('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = true
        this.hideVideoOverlayCache.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    } else if (
      syncThreshold == 100 ||
      isHiddenChangeTimestamp + 2000 < performance.now()
    ) {
      if (this.videoOverlay.isHidden) {
        this.videoOverlay.elem.classList.remove('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = false
        this.hideVideoOverlayCache.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    }
  }

  enable(initial = false) {
    if (!initial)
      this.settings.set('enabled', true, true)
    
    this.updateView()
    if (!this.settings.enableInFullscreen && this.view === VIEW_FULLSCREEN) return

    this.start()
  }

  disable() {
    this.settings.set('enabled', false, true)
    const videoElemParentElem = this.videoElem.parentNode
    if (videoElemParentElem) {
      videoElemParentElem.style.overflow = ''
      videoElemParentElem.style.transform = ''
      videoElemParentElem.style.height = ''
      videoElemParentElem.style.marginBottom = ''
    }

    this.checkVideoSize()
    this.hide()
  }

  start() {
    if (!this.isOnVideoPage || !this.settings.enabled) return

    this.videoFrameRateMeasureStartFrame = 0
    this.videoFrameRateMeasureStartTime = 0
    this.ambilightVideoDroppedFrameCount = 0

    this.showedCompareWarning = false
    this.showedDetectHorizontalBarSizeWarning = false

    this.requestVideoFrameCallbackId = undefined
    this.nextFrameTime = undefined

    this.sizesInvalidated = true // Prevent wrong size from being used
    this.buffersCleared = true // Prevent old frame from preventing the new frame from being drawn
    this.checkGetImageDataAllowed()
    this.resetSettingsIfNeeded()

    // Prevent incorrect stats from showing
    this.lastUpdateStatsTime = performance.now() + 2000

    this.nextFrame()
  }

  scheduleRequestVideoFrame = () => {
    if (
      !this.canScheduleNextFrame() ||
      
      // this.videoFrameCallbackReceived || // Doesn't matter because this can be true now but not when the new video frame is received
      this.requestVideoFrameCallbackId ||
      this.settings.frameSync != 150 ||

      this.videoIsHidden // Partial solution for https://bugs.chromium.org/p/chromium/issues/detail?id=1142112#c9
    ) return

    this.requestVideoFrameCallbackId = this.videoElem.requestVideoFrameCallback(this.receiveVideoFrame)
  }

  receiveVideoFrame = () => {
    this.requestVideoFrameCallbackId = undefined
    this.videoFrameCallbackReceived = true
    
    if(this.scheduledNextFrame) return
    this.scheduledNextFrame = true
    this.onNextFrame()
  }

  hide() {
    if (this.isHidden) return
    this.isHidden = true

    this.elem.style.opacity = 0.0000001; //Avoid memory leak https://codepen.io/wesselkroos/pen/MWWorLW
    if (this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    this.resetVideoContainerStyle()
    this.clear()
    this.hideStats()

    html.setAttribute('data-ambilight-enabled', false)
    this.updateTheme()
  }

  show() {
    if (!this.isHidden) return
    this.isHidden = false

    this.elem.style.opacity = 1
    html.setAttribute('data-ambilight-enabled', true)
    this.updateTheme()
  }

  checkScrollPosition = () => {
    const immersive = (this.settings.immersive || (this.settings.immersiveTheaterView && this.view === VIEW_THEATER))

    if (this.atTop && immersive) {
      this.ytdWatchFlexyElem.classList.add('at-top')
    } else {
      this.ytdWatchFlexyElem.classList.remove('at-top')
    }

    if (this.atTop) {
      this.mastheadElem.classList.add('at-top')
    } else {
      this.mastheadElem.classList.remove('at-top')
    }
  }
  
  shouldbeDarkTheme = () => {
    const toTheme = ((!this.settings.enabled || this.isHidden || this.settings.theme === THEME_DEFAULT) ? this.originalTheme : this.settings.theme)
    return (toTheme === THEME_DARK)
  }

  updateTheme = wrapErrorHandler(function updateTheme() {
    const toDark = this.shouldbeDarkTheme()
      if (
        !!html.getAttribute('dark') === toDark ||
        (toDark && !isWatchPageUrl())
      ) return

      this.toggleDarkTheme()
  }.bind(this), true)

  toggleDarkTheme() {
    const wasDark = !!html.getAttribute('dark')

    const detail = {
      actionName: 'yt-dark-mode-toggled-action',
      optionalAction: false,
      args: [ !wasDark ], // boolean for iframe live chat
      disableBroadcast: false,
      returnValue: []
    }
    const event = new CustomEvent('yt-action', {
      currentTarget: document.querySelector('ytd-app'),
      bubbles: true,
      cancelable: false,
      composed: true,
      detail,
      returnValue: true
    })

    this.ytdAppElem.dispatchEvent(event)
    const isDark = !!html.getAttribute('dark')
    if (wasDark === isDark) {
      throw new Error(`Failed to toggle theme from ${wasDark ? 'dark to light' : 'light to dark'} mode`)
      return
    }
  }

  updateLiveChatTheme() {
    const liveChat = document.querySelector('ytd-live-chat-frame')
    if (!liveChat) return

    const toDark = this.shouldbeDarkTheme()
    liveChat.postToContentWindow({
      "yt-live-chat-set-dark-theme": toDark
    })
  }

  updateImmersiveMode() {
    this.updateView()
    const immersiveMode = (this.settings.immersive || (this.settings.immersiveTheaterView && this.view === VIEW_THEATER))
    const changed = (html.getAttribute('data-ambilight-immersive-mode') !== immersiveMode.toString())
    html.setAttribute('data-ambilight-immersive-mode', immersiveMode)
    if(!changed) return

    this.checkScrollPosition()
  }
}