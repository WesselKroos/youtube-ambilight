import { $, html, body, waitForDomElement, on, off, raf, ctxOptions, Canvas, SafeOffscreenCanvas, requestIdleCallback, setTimeout, wrapErrorHandler } from './libs/generic'
import AmbilightSentry, { getSelectorTreeString, getNodeTreeString } from './libs/ambilight-sentry'
import { HorizontalBarDetection } from './gpu-horizontal-bar-detection'
import sharpen from './libs/sharpen'
import filter from './libs/filter'
import { insertScript } from './libs/utils'

const VIEW_DETACHED = 'VIEW_DETACHED'
const VIEW_SMALL = 'VIEW_SMALL'
const VIEW_THEATER = 'VIEW_THEATER'
const VIEW_FULLSCREEN = 'VIEW_FULLSCREEN'
const VIEW_POPUP = 'VIEW_POPUP'

const THEME_LIGHT = -1
const THEME_DEFAULT = 0
const THEME_DARK = 1

class Ambilight {

  horizontalBarsClipPX = 0
  horizontalBarDetection = new HorizontalBarDetection()
  lastCheckVideoSizeTime = 0
  saveStorageEntryTimeout = {}

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
      if (this.enabled)
        this.enable(true)
    })
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
    if (!this.enabled || !this.isOnVideoPage) return
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
    if (!this.enabled || !this.isOnVideoPage) return

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
      if (!this.enabled || !this.isOnVideoPage) return
      // When the video is paused this is the first event. Else [loadeddata] is first
      if (this.initVideoIfSrcChanged()) return

      this.buffersCleared = true // Always prevent old frame from being drawn
      this.optionalFrame()
    })
    on(this.videoElem, 'loadeddata', (e) => {
      if (!this.enabled || !this.isOnVideoPage) return
      // Whent the video is playing this is the first event. Else [seeked] is first
      this.initVideoIfSrcChanged()
    })
    on(this.videoElem, 'playing', () => {
      if (!this.enabled || !this.isOnVideoPage) return
      if (this.videoElem.paused) return // When paused handled by [seeked]
      this.optionalFrame()
    })
    on(this.videoElem, 'ended', () => {
      if (!this.enabled || !this.isOnVideoPage) return
      this.clear()
      this.scheduledNextFrame = false
      this.resetVideoContainerStyle() // Prevent visible video element above player because of the modified style attribute
    })
    on(this.videoElem, 'emptied', () => {
      if (!this.enabled || !this.isOnVideoPage) return
      this.clear()
      this.scheduledNextFrame = false
    })
    on(this.videoElem, 'error', (ex) => {
      if (!this.enabled || !this.isOnVideoPage) return
      console.error('Video error:', ex)
    })

    on(this.videoElem, 'click', (e) => {
      if(!this.onCloseSettingsListener) return;

      e.stopPropagation()
      this.onCloseSettings(e)
    })

    on(document, 'visibilitychange', () => {
      if (!this.enabled || !this.isOnVideoPage) return
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

      const immersiveKey = this.settings.find(setting => setting.name === 'immersive').key
      const enabledKey = this.settings.find(setting => setting.name === 'enabled').key
      const detectHorizontalBarSizeEnabledKey = this.settings.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key
      const detectVideoFillScaleEnabledKey = this.settings.find(setting => setting.name === 'detectVideoFillScaleEnabled').key
      
      const key = e.key?.toUpperCase()
      if (key === immersiveKey) // z by default
        this.toggleImmersiveMode()
      if (key === detectHorizontalBarSizeEnabledKey) // b by default
        $.s(`#setting-detectHorizontalBarSizeEnabled`).click()
      if (key === detectVideoFillScaleEnabledKey) // w by default
        $.s(`#setting-detectVideoFillScaleEnabled`).click()
      if (key === enabledKey) // a by default
        this.toggleEnabled()
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
      if (!this.enabled || !this.isOnVideoPage) return

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
      if (!this.enabled) return
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
        if (!this.enabled || !this.isOnVideoPage) return
        this.isBuffering = (state === 3)

        if(!this.isBuffering)
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

  checkGetImageDataAllowed(reportUnexpectedChange = false) {
    const isSameOriginVideo = (this.videoElem.src && this.videoElem.src.indexOf(location.origin) !== -1)
    const getImageDataAllowed = (!window.chrome || isSameOriginVideo)
    if(this.getImageDataAllowed === getImageDataAllowed) return

    this.getImageDataAllowed = getImageDataAllowed

    const settings = [
      $.s(`#setting-detectHorizontalBarSizeEnabled`),
      $.s(`#setting-detectColoredHorizontalBarSizeEnabled`),
      $.s(`#setting-detectHorizontalBarSizeOffsetPercentage`)
    ].filter(setting => setting)
    if(this.getImageDataAllowed) {
      for (const setting of settings) {
        setting.style.display = ''
      }
    } else {
      for (const setting of settings) {
        setting.style.display = 'none'
      }
    }
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
    if(this.shadowObserver) {
      this.shadowObserver.disconnect()
    }
    if(!this.shadowObserver) {
      this.shadowObserver = new IntersectionObserver(
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
    this.shadowObserver.observe(shadowElem)

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

    const videoSnapshotBufferElem = new Canvas(1, 1, true)
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

    const projectorsBufferElem = new Canvas(1, 1, true)
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
    this.settings = [
      {
        type: 'section',
        label: 'Settings',
        name: 'sectionSettingsCollapsed',
        default: true
      },
      {
        name: 'advancedSettings',
        label: 'Advanced',
        type: 'checkbox',
        default: false
      },
      {
        type: 'section',
        label: 'Quality',
        name: 'sectionAmbilightQualityPerformanceCollapsed',
        default: true,
        advanced: false
      },
      {
        name: 'showFPS',
        label: 'Show framerate',
        type: 'checkbox',
        default: false,
        advanced: true
      },
      {
        name: 'frameSync',
        label: 'Synchronization',
        questionMark: {
          title: 'How much energy will be spent on sychronising the ambilight effect with the video.\n\nPower Saver: Lowest CPU & GPU usage.\nMight result in ambilight with dropped and delayed frames.\n\nBalanced: Medium CPU & GPU usage.\nMight still result in ambilight with delayed frames on higher than 1080p videos.\n\nHigh Performance: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nPerfect (Experimental): Lowest CPU & GPU usage.\nIt is perfect, but in an experimental fase because it\'s based on a new browser technique.'
        },
        type: 'list',
        default: 50,
        min: 0,
        max: 100,
        step: 50,
        manualinput: false,
        advanced: false
      },
      {
        name: 'framerateLimit',
        label: 'Limit framerate (per second)',
        type: 'list',
        default: 0,
        min: 0,
        max: 60,
        step: 1,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoOverlayEnabled',
        label: 'Sync video with ambient light',
        questionMark: {
          title: 'Delays the video frames according to the ambient light frametimes. This makes sure that that the ambient light is never out of sync with the video, but it can introduce stuttering and/or dropped frames.'
        },
        type: 'checkbox',
        default: false,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoOverlaySyncThreshold',
        label: 'Sync video disable threshold',
        description: 'Disable when dropping % of frames',
        type: 'list',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
        advanced: true
      },
      {
        experimental: true,
        name: 'frameBlending',
        label: 'Smooth motion (frame blending)',
        questionMark: {
          title: 'Click for more information about Frame blending',
          href: 'https://www.youtube.com/watch?v=m_wfO4fvH8M&t=81s'
        },
        description: 'More GPU usage. Works with "Sync video"',
        type: 'checkbox',
        default: false,
        advanced: true
      },
      {
        experimental: true,
        name: 'frameBlendingSmoothness',
        label: 'Smooth motion strength',
        type: 'list',
        default: 80,
        min: 0,
        max: 100,
        step: 1,
        advanced: true
      },
      {
        type: 'section',
        label: 'Video filters',
        name: 'sectionVideoFiltersCollapsed',
        default: true
      },
      {
        experimental: true,
        name: 'videoTriangleBlur',
        label: 'TriangleBlur',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoLensBlur',
        label: 'LensBlur',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoFilterDenoise',
        label: 'Denoise',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoUnsharpMaskRadius',
        label: 'Unsharp mask - Radius',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoUnsharpMaskStrength',
        label: 'Unsharp mask - Strength',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoFilterNoise',
        label: 'Noise',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoSharpen',
        label: 'Sharpen',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .5,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoMatchScreenResolution',
        label: 'Match screen resolution',
        type: 'checkbox',
        default: false,
        advanced: true
      },
      {
        type: 'section',
        label: 'Page content',
        name: 'sectionOtherPageContentCollapsed',
        default: false
      },
      {
        name: 'surroundingContentTextAndBtnOnly',
        label: 'Shadow only on text and buttons',
        description: 'Decreases scroll & video stutter',
        type: 'checkbox',
        advanced: true,
        default: true
      },
      {
        name: 'surroundingContentShadowSize',
        label: 'Shadow size',
        type: 'list',
        default: 15,
        min: 0,
        max: 100,
        step: .1
      },
      {
        name: 'surroundingContentShadowOpacity',
        label: 'Shadow opacity',
        type: 'list',
        default: 30,
        min: 0,
        max: 100,
        step: .1
      },
      {
        name: 'surroundingContentImagesTransparency',
        label: 'Images transparency',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        advanced: true
      },
      {
        name: 'immersive',
        label: 'Hide when scrolled to top',
        type: 'checkbox',
        default: false,
        defaultKey: 'Z'
      },
      {
        name: 'immersiveTheaterView',
        label: 'Hide in theater mode',
        type: 'checkbox',
        default: false
      },
      {
        name: 'hideScrollbar',
        label: 'Hide scrollbar',
        type: 'checkbox',
        default: false
      },
      {
        type: 'section',
        label: 'Video',
        name: 'sectionVideoResizingCollapsed',
        default: true
      },
      {
        name: 'videoScale',
        label: 'Size',
        type: 'list',
        default: 100,
        min: 25,
        max: 200,
        step: 0.1
      },
      {
        name: 'videoShadowSize',
        label: 'Shadow size',
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        step: .1
      },
      {
        name: 'videoShadowOpacity',
        label: 'Shadow opacity',
        type: 'list',
        default: 50,
        min: 0,
        max: 100,
        step: .1
      },
      {
        type: 'section',
        label: 'Black bars',
        name: 'sectionHorizontalBarsCollapsed',
        default: true
      },
      {
        name: 'detectHorizontalBarSizeEnabled',
        label: 'Remove black bars',
        description: 'More CPU usage',
        type: 'checkbox',
        default: false,
        defaultKey: 'B'
      },
      {
        name: 'detectColoredHorizontalBarSizeEnabled',
        label: 'Also remove colored bars',
        type: 'checkbox',
        default: false
      },
      {
        name: 'detectHorizontalBarSizeOffsetPercentage',
        label: 'Black bar detection offset',
        type: 'list',
        default: 0,
        min: -5,
        max: 5,
        step: 0.1,
        advanced: true
      },
      {
        name: 'horizontalBarsClipPercentage',
        label: 'Black bars size',
        type: 'list',
        default: 0,
        min: 0,
        max: 40,
        step: 0.1,
        snapPoints: [
          { value:  8.7, label:  8 },
          { value: 12.3, label: 12, flip: true },
          { value: 13.5, label: 13 }
        ],
        advanced: true
      },
      {
        name: 'horizontalBarsClipPercentageReset',
        label: 'Reset black bars next video',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'detectVideoFillScaleEnabled',
        label: 'Fill video to screen width',
        type: 'checkbox',
        default: false,
        defaultKey: 'W'
      },
      {
        type: 'section',
        label: 'Filters',
        name: 'sectionAmbilightImageAdjustmentCollapsed',
        default: false,
        advanced: true
      },
      {
        name: 'brightness',
        label: 'Brightness',
        type: 'list',
        default: 100,
        min: 0,
        max: 200,
        advanced: true
      },
      {
        name: 'contrast',
        label: 'Contrast',
        type: 'list',
        default: 100,
        min: 0,
        max: 200,
        advanced: true
      },
      {
        name: 'saturation',
        label: 'Saturation',
        type: 'list',
        default: 100,
        min: 0,
        max: 200,
        advanced: true
      },
      {
        type: 'section',
        label: 'Directions',
        name: 'sectionDirectionsCollapsed',
        default: true,
        advanced: true
      },
      {
        name: 'directionTopEnabled',
        label: 'Top',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'directionRightEnabled',
        label: 'Right',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'directionBottomEnabled',
        label: 'Bottom',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'directionLeftEnabled',
        label: 'Left',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        type: 'section',
        label: 'Ambient light',
        name: 'sectionAmbilightCollapsed',
        default: false
      },
      {
        name: 'blur',
        label: 'Blur',
        description: 'More GPU memory',
        type: 'list',
        default: 30,
        min: 0,
        max: 100,
        step: .1
      },
      {
        name: 'spread',
        label: 'Spread',
        description: 'More GPU usage',
        type: 'list',
        default: 17,
        min: 0,
        max: 200,
        step: .1
      },
      {
        name: 'edge',
        label: 'Edge size',
        description: 'Less GPU usage. Tip: Turn blur down',
        type: 'list',
        default: 12,
        min: 2,
        max: 50,
        step: .1,
        advanced: true
      },
      {
        name: 'bloom',
        label: 'Fade out start',
        type: 'list',
        default: 15,
        min: -50,
        max: 100,
        step: .1,
        advanced: true
      },
      {
        name: 'fadeOutEasing',
        label: 'Fade out curve',
        description: 'Tip: Turn blur all the way down',
        type: 'list',
        default: 35,
        min: 1,
        max: 100,
        step: 1,
        advanced: true
      },
      {
        name: 'debandingStrength',
        label: 'Debanding (noise)',
        questionMark: {
          title: 'Click for more information about Dithering',
          href: 'https://www.lifewire.com/what-is-dithering-4686105'
        },
        type: 'list',
        default: 0,
        min: 0,
        max: 100,
        advanced: true
      },
      {
        type: 'section',
        label: 'General',
        name: 'sectionGeneralCollapsed',
        default: false
      },
      {
        name: 'theme',
        label: 'Appearance (theme)',
        type: 'list',
        manualinput: false,
        default: 1,
        min: -1,
        max: 1,
        step: 1,
        snapPoints: [
          { value: -1, label: 'Light'   },
          { value:  0, label: 'Default' },
          { value:  1, label: 'Dark'    },
        ]
      },
      {
        name: 'enableInFullscreen',
        label: 'Keep enabled in fullscreen',
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'enabled',
        label: 'Enabled',
        type: 'checkbox',
        default: true,
        defaultKey: 'A'
      },
    ]

    this.settings = this.settings.map(setting => {
      if(this.videoHasRequestVideoFrameCallback) {
        if(setting.name === 'frameSync') {
          setting.max = 150
          setting.default = 150
          setting.advanced = true // Change this in the future when frameSync 150 is released and validated to work
        }

        if(setting.name === 'sectionAmbilightQualityPerformanceCollapsed') {
          setting.advanced = true
        }

        // Change this in the future when frameSync 150 is released and validated to work for a long time
        // if(setting.name === 'frameSync') {
        //   return undefined
        // }
      }
      return setting
    }).filter(setting => setting)

    this.getAllSettings()
    this.initSettingsMenu()

    html.setAttribute('data-ambilight-enabled', this.enabled)
    html.setAttribute('data-ambilight-hide-scrollbar', this.hideScrollbar)
  }

  getAllSettings() {
    this.enabled = this.getSetting('enabled')

    //Sections
    this.sectionSettingsCollapsed = this.getSetting('sectionSettingsCollapsed')
    this.sectionAmbilightCollapsed = this.getSetting('sectionAmbilightCollapsed')
    this.sectionDirectionsCollapsed = this.getSetting('sectionDirectionsCollapsed')
    this.sectionAmbilightImageAdjustmentCollapsed = this.getSetting('sectionAmbilightImageAdjustmentCollapsed')
    this.sectionVideoResizingCollapsed = this.getSetting('sectionVideoResizingCollapsed')
    this.sectionHorizontalBarsCollapsed = this.getSetting('sectionHorizontalBarsCollapsed')
    this.sectionOtherPageContentCollapsed = this.getSetting('sectionOtherPageContentCollapsed')
    this.sectionAmbilightQualityPerformanceCollapsed = this.getSetting('sectionAmbilightQualityPerformanceCollapsed')
    this.sectionGeneralCollapsed = this.getSetting('sectionGeneralCollapsed')
    this.sectionVideoFiltersCollapsed = this.getSetting('sectionVideoFiltersCollapsed')

    this.spread = this.getSetting('spread')
    this.blur = this.getSetting('blur')
    this.bloom = this.getSetting('bloom')
    this.fadeOutEasing = this.getSetting('fadeOutEasing')
    this.edge = this.getSetting('edge')
    this.innerStrength = 2
    this.videoOverlayEnabled = this.getSetting('videoOverlayEnabled')
    this.videoOverlaySyncThreshold = this.getSetting('videoOverlaySyncThreshold')

    this.videoTriangleBlur = this.getSetting('videoTriangleBlur')
    this.videoLensBlur = this.getSetting('videoLensBlur')
    this.videoFilterDenoise = this.getSetting('videoFilterDenoise')
    this.videoUnsharpMaskRadius = this.getSetting('videoUnsharpMaskRadius')
    this.videoUnsharpMaskStrength = this.getSetting('videoUnsharpMaskStrength')
    this.videoFilterNoise = this.getSetting('videoFilterNoise')
    this.videoSharpen = this.getSetting('videoSharpen')
    this.videoMatchScreenResolution = this.getSetting('videoMatchScreenResolution')

    this.contrast = this.getSetting('contrast')
    this.brightness = this.getSetting('brightness')
    this.saturation = this.getSetting('saturation')

    this.videoScale = this.getSetting('videoScale')
    this.detectHorizontalBarSizeEnabled = this.getSetting('detectHorizontalBarSizeEnabled')
    this.detectColoredHorizontalBarSizeEnabled = this.getSetting('detectColoredHorizontalBarSizeEnabled')
    this.detectHorizontalBarSizeOffsetPercentage = this.getSetting('detectHorizontalBarSizeOffsetPercentage')
    this.horizontalBarsClipPercentage = this.getSetting('horizontalBarsClipPercentage')
    this.detectVideoFillScaleEnabled = this.getSetting('detectVideoFillScaleEnabled')
    this.horizontalBarsClipPercentageReset = this.getSetting('horizontalBarsClipPercentageReset')

    this.directionTopEnabled = this.getSetting('directionTopEnabled')
    this.directionRightEnabled = this.getSetting('directionRightEnabled')
    this.directionBottomEnabled = this.getSetting('directionBottomEnabled')
    this.directionLeftEnabled = this.getSetting('directionLeftEnabled')

    //// Migrations from version 2.32
    // Enable advancedSettings for existing users
    let previouslyEnabled = false
    let previouslyAdvancedSettings = false
    try {
      previouslyEnabled = localStorage.getItem(`ambilight-enabled`)
      previouslyAdvancedSettings = localStorage.getItem(`ambilight-advancedSettings`)
    } catch (ex) {
      console.warn('Ambient light for YouTube™ | getSetting', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
    if(previouslyAdvancedSettings === null) {
      this.setSetting('advancedSettings', (previouslyEnabled !== null))
    } else {
      this.advancedSettings = this.getSetting('advancedSettings')
    }

    // Migrate highQuality to frameSync
    const previouslyHighQuality = this.getSetting('highQuality')
    if(previouslyHighQuality === 'false') {
      this.setSetting('frameSync', 0)
      this.removeStorageEntry('highQuality')
    } else {
      this.frameSync = this.getSetting('frameSync')
    }

    this.showFPS = this.getSetting('showFPS')
    this.framerateLimit = this.getSetting('framerateLimit')
    this.frameBlending = this.getSetting('frameBlending')
    this.frameBlendingSmoothness = this.getSetting('frameBlendingSmoothness')
    this.immersive = this.getSetting('immersive')
    this.immersiveTheaterView = this.getSetting('immersiveTheaterView')
    this.hideScrollbar = this.getSetting('hideScrollbar')
    this.enableInFullscreen = this.getSetting('enableInFullscreen')
    this.theme = this.getSetting('theme')

    this.surroundingContentTextAndBtnOnly = this.getSetting('surroundingContentTextAndBtnOnly')
    this.surroundingContentShadowSize = this.getSetting('surroundingContentShadowSize')
    this.surroundingContentShadowOpacity = this.getSetting('surroundingContentShadowOpacity')
    this.surroundingContentImagesTransparency = this.getSetting('surroundingContentImagesTransparency')
    this.debandingStrength = this.getSetting('debandingStrength')

    this.videoShadowSize = this.getSetting('videoShadowSize')
    this.videoShadowOpacity = this.getSetting('videoShadowOpacity')

    for (const setting of this.settings) {
      setting.value = this[setting.name]
      if(setting.defaultKey !== undefined) {
        const key = this.getSettingKey(setting.name)
        setting.key = (key !== null) ? key : setting.defaultKey
      }
    }
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
    
    this.videoSyncedScaleElem = document.createElement("div")
    this.videoSyncedScaleElem.classList.add('ambilight__video-synced')
    this.FPSListElem.append(this.videoSyncedScaleElem)

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
      if (this.horizontalBarsClipPercentageReset) {
        this.setHorizontalBars(0)
      }
      if(this.detectVideoFillScaleEnabled) {
        this.setSetting('videoScale', 100)
      }
    }
    this.prevVideoPath = videoPath
  }

  setHorizontalBars(percentage) {
    if(this.horizontalBarsClipPercentage === percentage) return

    this.horizontalBarsClipPercentage = percentage
    this.sizesInvalidated = true
    this.optionalFrame()
    setTimeout(() => {
      this.setSetting('horizontalBarsClipPercentage', percentage)
      const rangeInput = $.s('#setting-horizontalBarsClipPercentage-range')
      if(rangeInput) {
        rangeInput.value = percentage
        rangeInput.setAttribute('data-previous-value', rangeInput.value)
        $.s(`#setting-horizontalBarsClipPercentage-value`).textContent = `${rangeInput.value}%`
        $.s(`#setting-horizontalBarsClipPercentage-manualinput`).value = rangeInput.value
      }
    }, 1)
  }

  initFeedbackLink() {
    const version = html.getAttribute('data-ambilight-version') || ''
    const os = html.getAttribute('data-ambilight-os') || ''
    const browser = html.getAttribute('data-ambilight-browser') || ''
    this.feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}&entry.964326861=${browser}`
  }

  recreateProjectors() {
    const spreadLevels = Math.max(2, Math.round((this.spread / this.edge)) + this.innerStrength + 1)

    if (!this.projectors) {
      this.projectors = []
    }

    this.projectors = this.projectors.filter((projector, i) => {
      if (i >= spreadLevels) {
        projector.elem.remove()
        return false
      }
      return true
    })

    for (let i = this.projectors.length; i < spreadLevels; i++) {
      const projectorElem = new Canvas(1, 1)
      projectorElem.classList.add('ambilight__projector')

      const projectorCtx = projectorElem.getContext('2d', ctxOptions)
      this.projectorListElem.prepend(projectorElem)

      this.projectors.push({
        elem: projectorElem,
        ctx: projectorCtx
      })
    }
  }

  clear() {
    this.horizontalBarDetection.clear()

    // Clear canvasses
    const canvasses = [
      this.videoSnapshotBuffer,
      this.videoSnapshotGetImageDataBuffer,
      ...this.projectors
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
        const videoScaleY = (100 - (this.horizontalBarsClipPercentage * 2)) / 100
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
    if(this.videoScale === videoScale) return

    this.setSetting('videoScale', videoScale)
    if($.s('#setting-videoScale')) {
      const rangeInput = $.s('#setting-videoScale-range')
      rangeInput.value = videoScale
      rangeInput.setAttribute('data-previous-value', rangeInput.value)
      $.s(`#setting-videoScale-value`).textContent = `${rangeInput.value}%`
      $.s(`#setting-videoScale-manualinput`).value = rangeInput.value
    }
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
    if(this.detectVideoFillScaleEnabled){
      this.detectVideoFillScale()
    }

    this.updateView()
    this.isVR = this.videoPlayerElem.classList.contains('ytp-webgl-spherical')
    const noClipOrScale = (this.horizontalBarsClipPercentage == 0 && this.videoScale == 100)

    const videoElemParentElem = this.videoElem.parentNode

    const notVisible = (
      !this.enabled ||
      this.isVR ||
      !videoElemParentElem ||
      !this.videoPlayerElem ||
      this.videoPlayerElem.classList.contains('ytp-player-minimized') ||
      (this.isFullscreen && !this.enableInFullscreen)
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

    const horizontalBarsClip = this.horizontalBarsClipPercentage / 100
    const shouldStyleVideoContainer = !this.isVideoHiddenOnWatchPage && !this.videoElem.ended && !noClipOrScale
    if (shouldStyleVideoContainer) {
      const top = Math.max(0, parseInt(this.videoElem.style.top))
      videoElemParentElem.style.height = '100%'
      videoElemParentElem.style.marginBottom = `${-this.videoElem.offsetHeight}px`
      videoElemParentElem.style.overflow = 'hidden'

      this.horizontalBarsClipScaleY = (1 - (horizontalBarsClip * 2))
      videoElemParentElem.style.transform =  `
        translateY(${top}px) 
        scale(${(this.videoScale / 100)}) 
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

    const unscaledWidth = Math.round(this.videoOffset.width / (this.videoScale / 100))
    const unscaledHeight = Math.round(this.videoOffset.height / (this.videoScale / 100))
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
      scale(${(this.videoScale / 100)}) 
      scaleY(${this.horizontalBarsClipScaleY})
    `
    
    if(this.videoShadowOpacity != 0 && this.videoShadowSize != 0) {
      this.videoShadowElem.style.display = 'block'
      this.videoShadowElem.style.left = `${unscaledLeft}px`
      this.videoShadowElem.style.top = `${unscaledTop}px`
      this.videoShadowElem.style.width = `${unscaledWidth}px`
      this.videoShadowElem.style.height = `${(unscaledHeight * this.horizontalBarsClipScaleY)}px`
      this.videoShadowElem.style.transform = `
        translate3d(0,0,0) 
        translateY(${(unscaledHeight * horizontalBarsClip)}px) 
        scale(${(this.videoScale / 100)})
      `
    } else {
      this.videoShadowElem.style.display = ''
    }

    this.filterElem.style.filter = `
      ${(this.blur != 0) ? `blur(${Math.round(this.videoOffset.height) * (this.blur * .0025)}px)` : ''}
      ${(this.contrast != 100) ? `contrast(${this.contrast}%)` : ''}
      ${(this.brightness != 100) ? `brightness(${this.brightness}%)` : ''}
      ${(this.saturation != 100) ? `saturate(${this.saturation}%)` : ''}
    `.trim()

    for (const projector of this.projectors) {
      if (projector.elem.width !== this.p.w)
        projector.elem.width = this.p.w
      if (projector.elem.height !== this.p.h)
        projector.elem.height = this.p.h
    }

    this.projectorBuffer.elem.width = this.p.w
    this.projectorBuffer.elem.height = this.p.h

    if (this.frameBlending) {
      if(!this.previousProjectorBuffer || !this.blendedProjectorBuffer) {
        this.initFrameBlending()
      }
      this.previousProjectorBuffer.elem.width = this.p.w
      this.previousProjectorBuffer.elem.height = this.p.h
      this.blendedProjectorBuffer.elem.width = this.p.w
      this.blendedProjectorBuffer.elem.height = this.p.h
    }
    if (this.videoOverlayEnabled && !this.videoOverlay) {
      this.initVideoOverlay()
    }
    if (this.videoOverlayEnabled && this.frameBlending && !this.previousVideoOverlayBuffer) {
      this.initVideoOverlayWithFrameBlending()
    }
    if (this.videoOverlayEnabled)
      this.checkIfNeedToHideVideoOverlay()

      if (this.frameBlending) {
        this.previousProjectorBuffer.elem.width = this.p.w
        this.previousProjectorBuffer.elem.height = this.p.h
        
        this.blendedProjectorBuffer.elem.width = this.p.w
        this.blendedProjectorBuffer.elem.height = this.p.h
      }
    if (this.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.elem.parentNode) {
      this.videoContainerElem.appendChild(this.videoOverlay.elem)
    } else if (!this.videoOverlayEnabled && this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    if (this.videoOverlayEnabled && this.videoOverlay) {
      if (this.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.appendTo($.s('.html5-video-container'))
      } else if (!this.videoOverlayEnabled && this.videoOverlay && this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
      }

      this.videoOverlay.elem.setAttribute('style', this.videoElem.getAttribute('style'))
      if(this.videoMatchScreenResolution) {
        this.videoOverlayScale = Math.round(this.videoOverlay.elem.offsetWidth) / this.srcVideoOffset.width
        this.videoOverlayScale = Math.max(0.5, Math.min(2, Math.floor(this.videoOverlayScale * 4) / 4))
        this.videoOverlay.elem.width = Math.round(this.srcVideoOffset.width * this.videoOverlayScale)
        this.videoOverlay.elem.height = Math.round(this.srcVideoOffset.height * this.videoOverlayScale)
      } else {
        this.videoOverlay.elem.width = this.srcVideoOffset.width
        this.videoOverlay.elem.height = this.srcVideoOffset.height
      }

      if (this.frameBlending) {
        this.videoOverlayBuffer.elem.width = this.videoOverlay.elem.width
        this.videoOverlayBuffer.elem.height = this.videoOverlay.elem.height

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

    const ImagesTransparency = this.surroundingContentImagesTransparency
    const imageOpacity = (ImagesTransparency) ? (1 - (ImagesTransparency / 100)) : ''
    document.body.style.setProperty('--ambilight-image-opacity', imageOpacity)


    // Content shadow

    const textAndBtnOnly = this.surroundingContentTextAndBtnOnly
    const shadowSize = this.surroundingContentShadowSize / 5
    const shadowOpacity = this.surroundingContentShadowOpacity / 100

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
    
    const videoShadowSize = parseFloat(this.videoShadowSize, 10) / 2 + Math.pow(this.videoShadowSize / 5, 1.77) // Chrome limit: 250px | Firefox limit: 100px
    const videoShadowOpacity = this.videoShadowOpacity / 100
    
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
      (this.videoScale > 100) ?  'visible' : '')


    // Debanding

    const baseurl = html.getAttribute('data-ambilight-baseurl') || ''
    const debandingStrength = parseFloat(this.debandingStrength)
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

    const scaleStep = this.edge / 100

    for (const i in this.projectors) {
      const projector = this.projectors[i]
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
      
      projector.elem.style.transform = `scale(${Math.max(minScale.x, scaleX)}, ${Math.max(minScale.y, scaleY)})`
    }

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
    const easing = (16 / (this.fadeOutEasing * .64))
    const keyframes = plotKeyframes(256, easing, darkest)

    let fadeOutFrom = this.bloom / 100
    const fadeOutMinH = -(video.h / 2 / edge.h)
    const fadeOutMinW = -(video.w / 2 / edge.w)
    fadeOutFrom = Math.max(fadeOutFrom, fadeOutMinH, fadeOutMinW)

    drawGradient(video.h, edge.h, keyframes, fadeOutFrom, darkest, false)
    drawGradient(video.w, edge.w, keyframes, fadeOutFrom, darkest, true)

    // Directions
    const scaleW = this.shadow.elem.width / (video.w + edge.w + edge.w)
    const scaleH = this.shadow.elem.height / (video.h + edge.h + edge.h)
    this.shadow.ctx.fillStyle = '#000000'


    if(!this.directionTopEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.moveTo(0, 0)
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      
      this.shadow.ctx.fill()
    }

    if(!this.directionRightEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.shadow.ctx.fill()
    }

    if(!this.directionBottomEnabled) {
      this.shadow.ctx.beginPath()

      this.shadow.ctx.moveTo(0,                                     scaleH * (edge.h + video.h + edge.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.shadow.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.shadow.ctx.fill()
    }

    if(!this.directionLeftEnabled) {
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
    if (this.previousEnabled !== this.enabled) {
      this.previousEnabled = this.enabled
      return this.updateSizes()
    }

    //Auto quality moved up or down
    if (this.srcVideoOffset.width !== this.videoElem.videoWidth
      || this.srcVideoOffset.height !== this.videoElem.videoHeight) {
      return this.updateSizes()
    }

    if (this.videoOverlayEnabled && this.videoOverlay && this.videoElem.getAttribute('style') !== this.videoOverlay.elem.getAttribute('style')) {
      return this.updateSizes()
    }
    
    const noClipOrScale = (this.horizontalBarsClipPercentage == 0 && this.videoScale == 100)
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
      const expectedProjectsElemRectY = videoElemRect.top + (videoElemRect.height * (this.horizontalBarsClipPercentage/100))
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
      !this.canScheduleNextFrame() ||
      this.scheduledNextFrame
    ) return

    this.scheduleRequestVideoFrame()
    this.scheduledNextFrame = true
    raf(this.onNextFrame)
  }

  onNextFrame = () => {
    if (!this.scheduledNextFrame) return

    this.scheduledNextFrame = false
    if(this.videoElem.ended) return

    if(this.framerateLimit) {
      this.onNextLimitedFrame()
    } else {
      this.nextFrame()
      this.nextFrameTime = undefined
    }

    this.detectDisplayFrameRate()
    this.detectAmbilightFrameRate()
    this.detectVideoFrameRate()
    // this.detectVideoIsDroppingFrames()
  }

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

    this.nextFrameTime = Math.max((this.nextFrameTime || time) + (1000 / this.framerateLimit), time)
  }

  canScheduleNextFrame = () => (!(
    !this.enabled ||
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
      !this.enabled ||
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
    
    let tasks = {}
    try {
      tasks = this.drawAmbilight() || {}
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

    if (tasks.detectHorizontalBarSize) {
      this.scheduleHorizontalBarSizeDetection()
    }

    if(this.afterNextFrameIdleCallback) return
    this.afterNextFrameIdleCallback = requestIdleCallback(this.afterNextFrame, { timeout: 1000/30 })
  }

  afterNextFrame = () => {
    try {
      this.afterNextFrameIdleCallback = undefined

      if (this.videoOverlayEnabled) {
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

      this.afterDrawAmbilightTasks = {}
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

  detectVideoSynced() {
    if (!this.showFPS || !this.videoOverlay) return

    this.videoSyncedScaleElem.textContent = this.videoOverlayEnabled ? `VIDEO SYNCED SCALE: ${this.videoOverlayScale || ''}` : ''
    this.videoSyncedScaleElem.style.color = this.videoOverlay.isHidden ? '#f33' : '#7f7'

    if (this.videoSyncedElem.textContent) {
      if (!this.videoOverlayEnabled) {
        this.videoSyncedElem.textContent = ''
        return
      }
      if (this.videoOverlay.isHidden !== undefined && this.videoOverlay.isHidden === this.detectVideoSyncedWasHidden)
        return
    }
    if (!this.videoOverlayEnabled) return

    this.videoSyncedElem.textContent = this.videoOverlayEnabled ? `VIDEO SYNCED: ${this.videoOverlay.isHidden ? 'NO' : 'YES'}` : ''
    this.videoSyncedElem.style.color = this.videoOverlay.isHidden ? '#f33' : '#7f7'
    this.detectVideoSyncedWasHidden = this.videoOverlay.isHidden
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
    this.videoSyncedScaleElem.textContent = ''
    this.ambilightFPSElem.textContent = ''
    this.ambilightDroppedFramesElem.textContent = ''
    this.displayFPSElem.textContent = ''
  }

  updateStats() {
    if (!this.showFPS || this.isHidden) return;

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
    if (this.videoOverlayEnabled) {
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
    if (!this.enabled || !this.isOnVideoPage) return

    if (
      this.isVR ||
      (!this.enableInFullscreen && this.isFullscreen)
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
        !this.detectHorizontalBarSizeEnabled &&
        !this.frameBlending &&
        !this.videoOverlayEnabled
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
      if (this.frameSync == 150) { // PERFECT
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
      } else if(this.frameSync == 0) { // PERFORMANCE
        updateVideoSnapshot = (this.videoFrameCount < newVideoFrameCount)
      } else if (this.frameSync == 50) { // BALANCED
        updateVideoSnapshot = true
      } else if (this.frameSync == 100) { // HIGH PRECISION
        updateVideoSnapshot = true
      }
    }

    if(updateVideoSnapshot) {
      this.videoSnapshotBuffer.ctx.drawImage(this.videoElem, 
        0, 0, this.videoSnapshotBuffer.elem.width, this.videoSnapshotBuffer.elem.height)
    }

    let hasNewFrame = this.buffersCleared
    if(this.frameSync == 150) { // PERFECT
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if(this.frameSync == 0) { // PERFORMANCE
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if (this.frameSync == 50 || this.frameBlending) { // BALANCED
      hasNewFrame = hasNewFrame || (this.videoFrameCount < newVideoFrameCount)
      
      if (this.videoFrameRate && this.displayFrameRate && this.displayFrameRate > this.videoFrameRate) {
        if(!hasNewFrame || this.framerateLimit > this.videoFrameRate - 1) {
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
    } else if (this.frameSync == 100) { // HIGH PRECISION
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

    if (this.frameBlending && this.frameBlendingSmoothness) {
      if (!this.previousProjectorBuffer) {
        this.initFrameBlending()
      }
      if (this.videoOverlayEnabled && !this.previousVideoOverlayBuffer) {
        this.initVideoOverlayWithFrameBlending()
      }

      // Prevent unnessecary frames drawing when frameBlending is not 100% but keep counting becuase we calculate with this.ambilightFrameRate
      if(hasNewFrame || this.buffersCleared || !this.previousDrawFullAlpha) {

        if (hasNewFrame || this.buffersCleared) {
          if (this.videoOverlayEnabled) {
            this.previousVideoOverlayBuffer.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
            this.videoOverlayBuffer.ctx.drawImage(this.videoElem, 
              0, 0, this.videoOverlayBuffer.elem.width, this.videoOverlayBuffer.elem.height)
            this.filter(this.videoOverlayBuffer.elem, this.videoOverlayBuffer.ctx)
            this.sharpen(this.videoOverlayBuffer.elem, this.videoOverlayBuffer.ctx)
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
            this.videoSnapshotBuffer.elem.width,
            this.videoSnapshotBuffer.elem.height - (this.videoSnapshotBufferBarsClipPx * 2),
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
            const frameToDrawDurationThresshold = (frameToDrawDuration + (ambilightFrameDuration / 2)) / (this.frameBlendingSmoothness / 100)
            // console.log(frameToDrawDurationThresshold, frameToDrawDuration, ambilightFrameDuration, videoFrameDuration)
            if (frameToDrawDurationThresshold < videoFrameDuration) {
              alpha = Math.min(1, (
                frameToDrawDuration / (
                  1000 / (
                    this.videoFrameRate / 
                    (this.frameBlendingSmoothness / 100) || 1
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

        if (this.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.isHidden) {
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

          for(const projector of this.projectors) {
            projector.ctx.drawImage(this.blendedProjectorBuffer.elem, 0, 0)
          }
        }
      }
    } else {
      if (!hasNewFrame) return

      if (this.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.isHidden) {
        if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
          this.videoOverlay.ctx.clearRect(0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        }
        this.videoOverlay.ctx.drawImage(this.videoElem, 
          0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        this.filter(this.videoOverlay.elem, this.videoOverlay.ctx)
        this.sharpen(this.videoOverlay.elem, this.videoOverlay.ctx)
      }

      if (!dontDrawAmbilight) {
        // Prevent adjusted videoSnapshotBufferBarsClipPx from leaking previous frame into the frame
        this.projectorBuffer.ctx.clearRect(0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
        this.projectorBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem,
          0,
          this.videoSnapshotBufferBarsClipPx,
          this.videoSnapshotBuffer.elem.width,
          this.videoSnapshotBuffer.elem.height - (this.videoSnapshotBufferBarsClipPx * 2), 
          0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)

        // if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
        //   for (const projector of this.projectors) {
        //     projector.ctx.clearRect(0, 0, projector.elem.width, projector.elem.height)
        //   }
        // }
        for(const projector of this.projectors) {
          projector.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
        }
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
      this.detectHorizontalBarSizeEnabled &&
      hasNewFrame
    ) {
      return { detectHorizontalBarSize: true }
    }
  }

  insertGPUscript() {
    if(!this.gpuScriptInserted) {
      this.gpuScriptInserted = true
      const gpuScriptSrc = html.getAttribute('data-ambilight-gpu-script-src')
      if(gpuScriptSrc) {
        insertScript(gpuScriptSrc)
      }
    }
  }

  sharpen(elem, ctx) {
    if(this.videoSharpen) {
      this.insertGPUscript()
      try {
        sharpen(elem, ctx, this.videoSharpen / 100)
      } catch(err) {
        console.error(err);
      }
    }
  }

  filter(elem, ctx) {
    const filters = [];
    if(parseFloat(this.videoFilterDenoise)) {
      filters.push(['denoise', [(101 - this.videoFilterDenoise) * 5]])
    }
    if(parseFloat(this.videoLensBlur)) {
      filters.push(['lensBlur', [this.videoLensBlur / 10, 0, 0]])
    }
    if(parseFloat(this.videoTriangleBlur)) {
      filters.push(['triangleBlur', [this.videoTriangleBlur / 10]])
    }
    if(parseFloat(this.videoUnsharpMaskRadius) && parseFloat(this.videoUnsharpMaskStrength)) {
      filters.push(['unsharpMask', [this.videoUnsharpMaskRadius / 10, this.videoUnsharpMaskStrength / 10]])
    }
    if(parseFloat(this.videoFilterNoise)) {
      filters.push(['noise', [this.videoFilterNoise / 1000]])
    }
    // console.log(this.videoFilterDenoise, this.videoUnsharpMaskRadius, this.videoUnsharpMaskStrength, this.videoFilterNoise, filters)

    if(filters.length) {
      if(!this.glfxScriptInserted) {
        this.glfxScriptInserted = true
        const glfxScriptSrc = html.getAttribute('data-ambilight-glfx-script-src')
        if(glfxScriptSrc) {
          insertScript(glfxScriptSrc)
        }
      }
      try {
        filter(elem, ctx, filters)
      } catch(err) {
        console.error(err);
      }
    }
  }

  scheduleHorizontalBarSizeDetection = () => {
    try {
      if(this.horizontalBarDetection.run) return

      if(
        (this.getImageDataAllowed && this.checkGetImageDataAllowed(true)) || 
        this.getImageDataAllowed
      ) {
        this.insertGPUscript()
        // this.startHBD = performance.now()
        this.horizontalBarDetection.detect(
          this.videoSnapshotBuffer,
          this.detectColoredHorizontalBarSizeEnabled,
          this.detectHorizontalBarSizeOffsetPercentage,
          this.horizontalBarsClipPercentage,
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
    // const duration = Math.round((performance.now() - this.startHBD) * 10) / 10
    // console.log('HBD duration:', duration.toString().padEnd(3, '.0').padStart(6, ' '))
    if(percentage !== undefined)
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
    if(!hide && this.videoOverlaySyncThreshold !== 100) {
      if(
        framesInfo.length < 5
      ) {
        hide = true
      } else {
        const droppedFramesCount = framesInfo.reduce((sum, info) => sum + info.framesDropped, 0)
        const droppedFramesThreshold = (this.videoFrameRate * 2) * (this.videoOverlaySyncThreshold / 100)
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
      this.videoOverlaySyncThreshold == 100 ||
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
    if (this.enabled && !initial) return

    this.setSetting('enabled', true)
    const enabledInput = $.s(`#setting-enabled`)
    if(enabledInput) enabledInput.setAttribute('aria-checked', true)

    this.updateView()
    if (!this.enableInFullscreen && this.view === VIEW_FULLSCREEN) return

    this.start()
  }

  disable() {
    if (!this.enabled) return

    this.setSetting('enabled', false)
    const enabledInput = $.s(`#setting-enabled`)
    if(enabledInput) enabledInput.setAttribute('aria-checked', false)

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

  toggleEnabled(enabled) {
    enabled = (enabled !== undefined) ? enabled : !this.enabled
    if (enabled) {
      this.enable()
    } else {
      this.disable()
    }
      
    const key = this.settings.find(setting => setting.name === 'enabled').key
    this.displayBezel(key, !enabled)
  }

  start() {
    if (!this.isOnVideoPage || !this.enabled) return

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
      this.frameSync != 150 ||

      this.videoIsHidden // Partial solution for https://bugs.chromium.org/p/chromium/issues/detail?id=1142112#c9
    ) return

    this.requestVideoFrameCallbackId = this.videoElem.requestVideoFrameCallback(this.receiveVideoFrame)
  }

  receiveVideoFrame = () => {
    this.requestVideoFrameCallbackId = undefined
    this.videoFrameCallbackReceived = true

    // Chromium issue: <todo>
    //
    // Call requestVideoFrameCallback immediately because the next callback sometimes 
    // misses the next video frame when the video framerate matches the display framerate
    // and requestVideoFrameCallback is called after drawing the ambilight canvas.
    // Calling requestVideoFrameCallback immediately makes sure we always get the next 
    // video frame as long as drawAmbilight is finished before the next video frame is presented.
    this.videoElem.requestVideoFrameCallback(() => {})
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
    const immersive = (this.immersive || (this.immersiveTheaterView && this.view === VIEW_THEATER))

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
    const toTheme = ((!this.enabled || this.isHidden || this.theme === THEME_DEFAULT) ? this.originalTheme : this.theme)
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
    const immersiveMode = (this.immersive || (this.immersiveTheaterView && this.view === VIEW_THEATER))
    const changed = (html.getAttribute('data-ambilight-immersive-mode') !== immersiveMode.toString())
    html.setAttribute('data-ambilight-immersive-mode', immersiveMode)
    if(!changed) return

    this.checkScrollPosition()
  }

  toggleImmersiveMode(enabled) {
    enabled = (enabled !== undefined) ? enabled : !this.immersive
    $.s(`#setting-immersive`).setAttribute('aria-checked', enabled ? 'true' : 'false')
    this.setSetting('immersive', enabled)
    this.updateImmersiveMode()

    const key = this.settings.find(setting => setting.name === 'immersive').key
    this.displayBezel(key, !enabled)
  }

  initSettingsMenu() {
    this.settingsMenuBtn = document.createElement('button')
    this.settingsMenuBtn.classList.add('ytp-button', 'ytp-ambilight-settings-button')
    this.settingsMenuBtn.setAttribute('aria-owns', 'ytp-id-190')
    on(this.settingsMenuBtn, 'click', this.onSettingsBtnClicked, undefined, (listener) => this.onSettingsBtnClickedListener = listener)
    this.settingsMenuBtn.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`

    const settingsMenuBtnTooltip = document.createElement('div')
    settingsMenuBtnTooltip.classList.add('ytp-tooltip', 'ytp-bottom', 'ytp-ambilight-settings-button-tooltip')
    settingsMenuBtnTooltip.setAttribute('aria-live', 'polite')
    const settingsMenuBtnTooltipTextWrapper = document.createElement('div')
    settingsMenuBtnTooltipTextWrapper.classList.add('ytp-tooltip-text-wrapper')
    settingsMenuBtnTooltip.prepend(settingsMenuBtnTooltipTextWrapper)
    const settingsMenuBtnTooltipText = document.createElement('span')
    settingsMenuBtnTooltipText.classList.add('ytp-tooltip-text', 'ytp-tooltip-text-no-title')
    settingsMenuBtnTooltipText.textContent = 'Ambient light settings'
    settingsMenuBtnTooltipTextWrapper.prepend(settingsMenuBtnTooltipText)

    this.settingsMenuBtn.prepend(settingsMenuBtnTooltip)
    this.settingsMenuBtnParent.prepend(this.settingsMenuBtn)

    this.settingsMenuElem = document.createElement('div')
    this.settingsMenuElem.classList.add(
      ...([
        'ytp-popup', 
        'ytp-settings-menu', 
        'ytpa-ambilight-settings-menu', 
        (this.advancedSettings) ? 'ytpa-ambilight-settings-menu--advanced' : undefined
      ].filter(c => c))
    )
    this.settingsMenuElem.setAttribute('id', 'ytp-id-190')
    this.settingsMenuElem.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <div class="ytp-menuitem ytpa-menuitem--header">
            <div class="ytp-menuitem-label">
              <a class="ytpa-feedback-link" rowspan="2" href="${this.feedbackFormLink}" target="_blank">
                <span class="ytpa-feedback-link__text">Give feedback or rate Ambient light for YouTube™</span>
              </a>
            </div>
            <div class="ytp-menuitem-content">
              <button
                class="ytpa-reset-settings-btn"
                title="Reset all settings"
              ></button>
            </div>
          </div>
          ${
      this.settings.map(setting => {
        let classes = 'ytp-menuitem'
        if(setting.advanced) classes += ' ytpa-menuitem--advanced'
        if(setting.new) classes += ' ytpa-menuitem--new'
        if(setting.experimental) classes += ' ytpa-menuitem--experimental'
        
        const label = `${setting.label}
          ${setting.key ? ` [<span contenteditable="true" class="ytpa-menuitem-key" title="Click here and press a key to change the hotkey">${setting.key}</span>]` : ''}
          ${setting.questionMark 
            ? `<a
            title="${setting.questionMark.title}" 
            ${setting.questionMark.href ? `href="${setting.questionMark.href}" target="_blank"` : 'href="#" onclick="return false"' }
            style="padding: 0 5px;">
              ?
            </a>`
            : ''
          }
          ${setting.description ? `<br/><span class="ytpa-menuitem-description">${setting.description}</span>` : ''}
        `
        
        if (setting.type === 'checkbox') {
          return `
            <div id="setting-${setting.name}" 
            class="${classes}" 
            role="menuitemcheckbox" 
            aria-checked="${setting.value ? 'true' : 'false'}" 
            tabindex="0"
            title="Right click to reset">
              <div class="ytp-menuitem-label">${label}</div>
              <div class="ytp-menuitem-content">
                <div class="ytp-menuitem-toggle-checkbox"></div>
              </div>
            </div>
          `
        } else if (setting.type === 'list') {
          return `
            <div id="setting-${setting.name}" class="ytp-menuitem-range-wrapper">
              <div class="${classes}" aria-haspopup="false" role="menuitemrange" tabindex="0">
                <div class="ytp-menuitem-label">${label}</div>
                <div class="ytp-menuitem-content">
                  ${(setting.manualinput !== false)
                    ? `<input id="setting-${setting.name}-manualinput" type="text" class="ytpa-menuitem-input" value="${setting.value}" />`
                    : ''
                  }
                  <div class="ytp-menuitem-value" id="setting-${setting.name}-value">${this.getSettingListDisplayText(setting)}</div>
                </div>
              </div>
              <div 
              class="ytp-menuitem-range ${setting.snapPoints ? 'ytp-menuitem-range--has-snap-points' : ''}" 
              rowspan="2" 
              title="Right click to reset">
                <input 
                  id="setting-${setting.name}-range" 
                  type="range" 
                  min="${setting.min}" 
                  max="${setting.max}" 
                  colspan="2" 
                  value="${setting.value}" 
                  step="${setting.step || 1}" />
              </div>
              ${!setting.snapPoints ? '' : `
                <datalist class="setting-range-datalist" id="snap-points-${setting.name}">
                  ${setting.snapPoints.map(({ label, value, flip }, i) => {
                    return `
                      <option 
                        class="setting-range-datalist__label ${flip ? 'setting-range-datalist__label--flip' : ''}" 
                        value="${value}" 
                        label="${label}" 
                        title="Snap to ${label}" 
                        style="margin-left: ${(value + (-setting.min)) * (100 / (setting.max - setting.min))}%">
                        ${label}
                      </option>
                    `;
                  }).join('')}
                </datalist>
              `}
            </div>
          `
        } else if (setting.type === 'section') {
          return `
            <div 
              class="ytpa-section ${setting.value ? 'is-collapsed' : ''} ${setting.advanced ? 'ytpa-section--advanced' : ''}" 
              data-name="${setting.name}">
              <div class="ytpa-section__cell">
                <div class="ytpa-section__label">${label}</div>
              </div>
              <div class="ytpa-section__cell">
                <div class="ytpa-section__fill">-</div>
              </div>
            </div>
          `
        }
      }).join('')
          }
        </div>
      </div>`

    const resetSettingsBtnElem = this.settingsMenuElem.querySelector('.ytpa-reset-settings-btn')
    on(resetSettingsBtnElem, 'click', () => {
      if(!confirm('Are you sure you want to reset ALL the settings?')) return
      
      // Reset values
      for (const input of this.settingsMenuElem.querySelectorAll('[role="menuitemcheckbox"], input[type="range"]')) {
        input.dispatchEvent(new Event('contextmenu'))
      }

      // Reset keys
      for (const setting of this.settings.filter(setting => setting.key)) {
          // this.setSettingKey(setting.name, setting.key)
          const keyElem = $.s(`#setting-${setting.name}`).querySelector('.ytpa-menuitem-key')
          keyElem.dispatchEvent(new KeyboardEvent('keypress', {
            key: setting.defaultKey
          }))
        }
    })
    for (const label of this.settingsMenuElem.querySelectorAll('.setting-range-datalist__label')) {
      on(label, 'click', (e) => {
        const value = e.target.value
        const name = e.target.parentNode.id.replace('snap-points-', '')
        const inputElem = $.s(`#setting-${name}-range`)
        inputElem.value = value
        inputElem.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    for (const section of this.settingsMenuElem.querySelectorAll('.ytpa-section')) {
      on(section, 'click', (e) => {
        const name = section.getAttribute('data-name')
        const settingSection = this.settings.find(setting => setting.type == 'section' && setting.name == name)
        if (!settingSection) return
        settingSection.value = !settingSection.value
        this.setSetting(name, settingSection.value)

        if (settingSection.value) {
          section.classList.add('is-collapsed')
        } else {
          section.classList.remove('is-collapsed')
        }
      })
    }
    
    on(this.settingsMenuElem, 'mousemove click dblclick contextmenu touchstart touchmove touchend', (e) => {
      e.stopPropagation()
    })
    on(this.settingsMenuElem, 'contextmenu', (e) => {
      e.preventDefault()
    })

    this.settingsMenuElemParent = this.videoPlayerElem
    this.settingsMenuElemParent.prepend(this.settingsMenuElem)
    try {
      this.settingsMenuElem.scrollTop = this.settingsMenuElem.scrollHeight
      this.settingsMenuOnCloseScrollBottom = (!this.settingsMenuElem.scrollTop) 
        ? -1 
        : (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - this.settingsMenuElem.scrollTop
      this.settingsMenuOnCloseScrollHeight = (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight)
    } catch(ex) {
      console.error('Ambient light for YouTube™ | initSettingsMenuScrollInformation', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }

    this.settingsBezelElem = document.createElement('div')
    this.settingsBezelElem.classList.add('yta-bezel', 'ytp-bezel')
    this.settingsBezelElem.setAttribute('role', 'status')
    this.settingsBezelElem.innerHTML = `
      <div class="ytp-bezel-icon">
        <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
          <text class="ytp-svg-fill" x="50%" y="59%" dominant-baseline="middle" text-anchor="middle"></text>
        </svg>
      </div>`
    on(this.settingsBezelElem, 'animationend', () => {
      this.settingsBezelElem.style.display = 'none'
    })
    this.settingsBezelTextElem = this.settingsBezelElem.querySelector('text')
    this.settingsMenuElemParent.prepend(this.settingsBezelElem)

    for (const setting of this.settings) {
      const settingElem = $.s(`#setting-${setting.name}`)
      if (!settingElem) continue
      
      const keyElem = settingElem.querySelector('.ytpa-menuitem-key')
      if (keyElem) {
        const settingElem = $.s(`#setting-${setting.name}`)
        on(keyElem, 'click', (e) => {
          e.stopPropagation()
          e.preventDefault()
        })
        on(keyElem, 'focus', (e) => {
          // Select all
          const range = document.createRange()
          range.selectNodeContents(keyElem)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        })
        on(keyElem, 'keydown keyup keypress', (e) => {
          e.stopPropagation()
        })
        on(keyElem, 'keypress', (e) => {
          if(e.key.length === 1) {
            const key = e.key?.toUpperCase()
            this.setSettingKey(setting.name, key)
            keyElem.textContent = key
          } else {
            keyElem.textContent = setting.defaultKey
          }

          keyElem.blur()
        })
        on(keyElem, 'blur', (e) => {
          // Deselect all
          const sel = window.getSelection()
          sel.removeAllRanges()
        })
      }

      if (setting.type === 'list') {
        const inputElem = $.s(`#setting-${setting.name}-range`)
        const valueElem = $.s(`#setting-${setting.name}-value`)

        const manualInputElem = $.s(`#setting-${setting.name}-manualinput`)
        if(manualInputElem) {
          on(manualInputElem, 'keydown keyup keypress', (e) => {
            e.stopPropagation()
          })
          const onChange = (empty = false) => {
            const manualValue = manualInputElem.value
            if(inputElem.value === manualInputElem.value) return
            inputElem.value = manualInputElem.value
            inputElem.dispatchEvent(new Event('change'))
          }
          on(manualInputElem, 'change', (e) => onChange())
          on(manualInputElem, 'blur', (e) => onChange())
          on(manualInputElem, 'keypress', (e) => {
            if(e.key !== 'Enter') return
            manualInputElem.blur()
          })
        }

        on(inputElem, 'change mousemove dblclick contextmenu touchmove', (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = parseFloat(inputElem.value)
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            value = this.settings.find(s => s.name === setting.name).default
          } else if (inputElem.value === inputElem.getAttribute('data-previous-value')) {
            return
          }
          inputElem.value = value
          inputElem.setAttribute('data-previous-value', value)
          if (manualInputElem) {
            manualInputElem.value = inputElem.value
          }
          this.setSetting(setting.name, value)
          valueElem.textContent = this.getSettingListDisplayText({...setting, value})

          if(setting.name === 'theme') {
            this.updateTheme()
            return
          }

          if(!this.advancedSettings) {
            if(setting.name === 'blur') {
              const edgeSetting = this.settings.find(setting => setting.name === 'edge')
              const edgeValue = (value <= 5 ) ? 2 : ((value >= 42.5) ? 17 : (
                value/2.5
              ))

              const edgeInputElem = $.s(`#setting-${edgeSetting.name}-range`)
              edgeInputElem.value = edgeValue
              edgeInputElem.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }

          if(
            setting.name === 'horizontalBarsClipPercentage' &&
            this.detectHorizontalBarSizeEnabled
          ) {
            const controllerInput = $.s(`#setting-detectHorizontalBarSizeEnabled`)
            controllerInput.dontResetControlledSetting = true
            controllerInput.click()
          }

          if(setting.name === 'videoScale') {
            if(this.detectVideoFillScaleEnabled) {
              const controllerInput = $.s(`#setting-detectVideoFillScaleEnabled`)
              controllerInput.dontResetControlledSetting = true
              controllerInput.click()
            }
          }

          if (
            setting.name === 'surroundingContentShadowSize' ||
            setting.name === 'surroundingContentShadowOpacity' ||
            setting.name === 'surroundingContentImagesTransparency' ||
            setting.name === 'debandingStrength' ||
            setting.name === 'videoShadowSize' ||
            setting.name === 'videoShadowOpacity' ||
            setting.name === 'videoScale'
          ) {
            this.updateStyles()
          }

          if (
            this.detectHorizontalBarSizeEnabled &&
            setting.name === 'detectHorizontalBarSizeOffsetPercentage'
          ) {
            this.horizontalBarDetection.clear()
            this.scheduleHorizontalBarSizeDetection()
          }

          if (
            setting.name === 'spread' || 
            setting.name === 'edge'
          ) {
            this.canvassesInvalidated = true
          }

          this.buffersCleared = true
          this.sizesInvalidated = true
          this.optionalFrame()
        })
      } else if (setting.type === 'checkbox') {
        on(settingElem, 'dblclick contextmenu click', (e) => {
          setting.value = !setting.value
          if (e.type === 'dblclick' || e.type === 'contextmenu') {
            setting.value = this.settings.find(s => s.name === setting.name).default
          }

          if (setting.name === 'enabled') {
            this.toggleEnabled(setting.value)
          }
          if (setting.name === 'immersive') {
            this.toggleImmersiveMode(setting.value)
          }
          if (setting.name === 'hideScrollbar') {
            html.setAttribute('data-ambilight-hide-scrollbar', setting.value)
          }
          if (
            setting.name === 'videoOverlayEnabled' ||
            setting.name === 'frameSync' ||
            setting.name === 'frameBlending' ||
            setting.name === 'enableInFullscreen' ||
            setting.name === 'showFPS' ||
            setting.name === 'surroundingContentTextAndBtnOnly' ||
            setting.name === 'horizontalBarsClipPercentageReset' ||
            setting.name === 'detectHorizontalBarSizeEnabled' ||
            setting.name === 'detectColoredHorizontalBarSizeEnabled' ||
            setting.name === 'detectVideoFillScaleEnabled' ||
            setting.name === 'directionTopEnabled' ||
            setting.name === 'directionRightEnabled' ||
            setting.name === 'directionBottomEnabled' ||
            setting.name === 'directionLeftEnabled' ||
            setting.name === 'advancedSettings' ||
            setting.name === 'hideScrollbar' ||
            setting.name === 'immersiveTheaterView' ||
            setting.name === 'videoMatchScreenResolution'
          ) {
            this.setSetting(setting.name, setting.value)
            $.s(`#setting-${setting.name}`).setAttribute('aria-checked', setting.value)
          }

          if(setting.name === 'immersiveTheaterView') {
            this.updateImmersiveMode()
          }

          if(setting.name === 'videoMatchScreenResolution') {
            if(this.videoElem.paused) {
              this.start()
            }
          }

          if(setting.name === 'detectHorizontalBarSizeEnabled') {
            if(!setting.value) {
              if(!settingElem.dontResetControlledSetting) {
                const horizontalBarsClipPercentageSetting = this.settings.find(setting => setting.name === 'horizontalBarsClipPercentage')
                const horizontalBarsClipPercentageInputElem = $.s(`#setting-${horizontalBarsClipPercentageSetting.name}-range`)
                horizontalBarsClipPercentageInputElem.value = horizontalBarsClipPercentageSetting.default
                horizontalBarsClipPercentageInputElem.dispatchEvent(new Event('change', { bubbles: true }))
              }
            } else {
              this.horizontalBarDetection.clear()
              this.scheduleHorizontalBarSizeDetection()
            }
            if(settingElem.dontResetControlledSetting) {
              settingElem.dontResetControlledSetting = false
            }
            this.updateControlledSettings()

            const key = this.settings.find(setting => setting.name === 'detectHorizontalBarSizeEnabled').key
            this.displayBezel(key, !setting.value)
          }

          if(setting.name === 'detectVideoFillScaleEnabled') {
            if(!setting.value) {
              if(!settingElem.dontResetControlledSetting) {
                const videoScaleSetting = this.settings.find(setting => setting.name === 'videoScale')
                const videoScaleInputElem = $.s(`#setting-${videoScaleSetting.name}-range`)
                videoScaleInputElem.value = videoScaleSetting.default
                videoScaleInputElem.dispatchEvent(new Event('change', { bubbles: true }))
              }
            }
            if(settingElem.dontResetControlledSetting) {
              settingElem.dontResetControlledSetting = false
            }
            this.updateControlledSettings()

            const key = this.settings.find(setting => setting.name === 'detectVideoFillScaleEnabled').key
            this.displayBezel(key, !setting.value)
          }

          if(setting.name === 'advancedSettings') {
            if(setting.value) {
              this.settingsMenuElem.classList.add('ytpa-ambilight-settings-menu--advanced')
            } else {
              this.settingsMenuElem.classList.remove('ytpa-ambilight-settings-menu--advanced')
            }
          }

          if (setting.name === 'showFPS') {
            if(setting.value) {
              this.updateStats()
            } else {
              this.hideStats()
            }
            return
          }

          if(setting.name === 'surroundingContentTextAndBtnOnly') {
            this.updateStyles()
            return
          }

          this.updateSizes()
          this.optionalFrame()
        })
      }
    }

    this.updateControlledSettings()
  }

  displayBezel(text, strike = false) {
    this.settingsBezelElem.style.display = 'none'
    setTimeout(() => {
      this.settingsBezelElem.classList.toggle('yta-bezel--strike', strike)
      this.settingsBezelElem.style.display = ''
      this.settingsBezelTextElem.textContent = text
    }, 0);
  }

  updateControlledSettings() {
    const videoScaleValue = $.s(`#setting-videoScale-value`)
    if(!this.detectVideoFillScaleEnabled) {
      videoScaleValue.classList.remove('is-controlled-by-setting')
      videoScaleValue.setAttribute('title', '')
    } else {
      videoScaleValue.classList.add('is-controlled-by-setting')
      videoScaleValue.setAttribute('title', 'Controlled by the "Fill video to screen width" setting.\nManually adjusting this setting will turn off "Fill video to screen width"')
    }

    const horizontalBarsClipPercentageValue = $.s(`#setting-horizontalBarsClipPercentage-value`)
    if(!this.detectHorizontalBarSizeEnabled) {
      horizontalBarsClipPercentageValue.classList.remove('is-controlled-by-setting')
      horizontalBarsClipPercentageValue.setAttribute('title', '')
    } else {
      horizontalBarsClipPercentageValue.classList.add('is-controlled-by-setting')
      horizontalBarsClipPercentageValue.setAttribute('title', 'Controlled by the "Remove black bars" setting.\nManually adjusting this setting will turn off "Remove black bars"')
    }
  }

  getSettingListDisplayText(setting) {
    if (setting.name === 'frameSync') {
      if (setting.value == 0)
        return 'Power Saver'
      if (setting.value == 50)
        return 'Balanced'
      if (setting.value == 100)
        return 'High Performance'
      if (setting.value == 150)
        return 'Perfect (Experimental)'
    }
    if(setting.name === 'framerateLimit') {
      return (this.framerateLimit == 0) ? 'max fps' : `${setting.value} fps`
    }
    if(setting.name === 'theme') {
      return setting.snapPoints.find(point => point.value === setting.value)?.label
    }
    return `${setting.value}%`
  }

  settingsMenuOnCloseScrollBottom = 0
  settingsMenuOnCloseScrollHeight = 0
  onSettingsBtnClicked = () => {
    const isOpen = this.settingsMenuElem.classList.contains('is-visible')
    if (isOpen) return

    this.settingsMenuElem.classList.remove('fade-out')
    this.settingsMenuElem.classList.add('is-visible')

    if(this.settingsMenuOnCloseScrollBottom !== -1) {
      const percentage = (this.settingsMenuElem.scrollHeight) / this.settingsMenuOnCloseScrollHeight
      this.settingsMenuElem.scrollTop = (
        (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - 
        (this.settingsMenuOnCloseScrollBottom * percentage)
      )
    }

    this.settingsMenuBtn.setAttribute('aria-expanded', true)

    if(this.videoPlayerElem) {
      this.videoPlayerElem.classList.add('ytp-ambilight-settings-shown')
    }

    off(this.settingsMenuBtn, 'click', this.onSettingsBtnClickedListener)
    setTimeout(() => {
      on(body, 'click', this.onCloseSettings, undefined, (listener) => this.onCloseSettingsListener = listener)
    }, 100)
  }

  onCloseSettings = (e) => {
    if (this.settingsMenuElem === e.target || this.settingsMenuElem.contains(e.target))
      return

    this.settingsMenuOnCloseScrollBottom = (!this.settingsMenuElem.scrollTop) 
      ? -1 : 
      (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - this.settingsMenuElem.scrollTop
    this.settingsMenuOnCloseScrollHeight = (this.settingsMenuElem.scrollHeight)

    on(this.settingsMenuElem, 'animationend', this.onSettingsFadeOutEnd, undefined, (listener) => this.onSettingsFadeOutEndListener = listener)
    this.settingsMenuElem.classList.add('fade-out')

    this.settingsMenuBtn.setAttribute('aria-expanded', false)

    if(this.videoPlayerElem) {
      this.videoPlayerElem.classList.remove('ytp-ambilight-settings-shown')
    }

    off(body, 'click', this.onCloseSettingsListener)
    this.onCloseSettingsListener = undefined
    setTimeout(() => {
      on(this.settingsMenuBtn, 'click', this.onSettingsBtnClicked, undefined, (listener) => this.onSettingsBtnClickedListener = listener)
    }, 100)
  }

  onSettingsFadeOutEnd = () => {
    this.settingsMenuElem.classList.remove('fade-out', 'is-visible')
    off(this.settingsMenuElem, 'animationend', this.onSettingsFadeOutEndListener)
  }

  setSettingKey(name, key) {
    const setting = this.settings.find(setting => setting.name === name) || {}
    setting.key = key
    this.saveStorageEntry(`${setting.name}-key`, key)
  }

  getSettingKey(name) {
    return this.getStorageEntry(`${name}-key`)
  }

  setSetting(name, value) {
    this[name] = value

    if (name === 'blur')
      value = Math.round((value - 30) * 10) / 10 // Prevent rounding error
    if (name === 'bloom')
      value = Math.round((value - 7) * 10) / 10 // Prevent rounding error

    const setting = this.settings.find(setting => setting.name === name) || {}
    setting.value = value

    this.saveStorageEntry(name, value)
  }

  getSetting(name) {
    let value = this.getStorageEntry(name)
    const setting = this.settings.find(setting => setting.name === name) || {}
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value = (value === 'true')
    } else if (setting.type === 'list') {
      value = parseFloat(value)
      if (name === 'blur')
        value = Math.round((value + 30) * 10) / 10 // Prevent rounding error
      if (name === 'bloom')
        value = Math.round((value + 7) * 10) / 10 // Prevent rounding error
    }

    return value
  }

  getStorageEntry(name) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${name}`)
    } catch (ex) {
      console.warn('Ambient light for YouTube™ | getSetting', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
    return value
  }

  saveStorageEntry(name, value) {
    if (this.saveStorageEntryTimeout[name])
      clearTimeout(this.saveStorageEntryTimeout[name])

    this.saveStorageEntryTimeout[name] = setTimeout(() => {
      try {
        localStorage.setItem(`ambilight-${name}`, value)
      } catch (ex) {
        console.warn('Ambient light for YouTube™ | saveStorageEntry', ex)
        //AmbilightSentry.captureExceptionWithDetails(ex)
      }
      this.saveStorageEntryTimeout[name] = null
    }, 500)
  }

  removeStorageEntry(name) {
    try {
      localStorage.removeItem(`ambilight-${name}`)
    } catch (ex) {
      console.warn('Ambient light for YouTube™ | removeStorageEntry', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }
}

let errorEvents = []
const pushErrorEvent = (type, details = {}) => {
  const time = Math.round(performance.now()) / 1000

  if(errorEvents.length) {
    const last = errorEvents.slice(-1)[0]
    const {
      count: lastCount,
      time: lastTime,
      endTime: lastEndTime,
      type: lastType,
      ...lastDetails
    } = last

    if(
      lastType === type && 
      JSON.stringify(lastDetails) === JSON.stringify(details)
    ) {
      last.count = last.count ? last.count + 1 : 2
      last.endTime = time
      return
    }
  }

  let event = {
    type,
    time,
    ...details,
  }
  event.time = time
  errorEvents.push(event)
}

class AmbilightError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'AmbilightError'
    this.details = details
  }
}

on(window, 'beforeunload', (e) => {
  if(!errorEvents.length) return
  
  pushErrorEvent('tab beforeunload')
}, false)

on(window, 'pagehide', (e) => {
  if(!errorEvents.length) return
  
  pushErrorEvent('tab pagehide')
}, false)

on(document, 'visibilitychange', () => {
  if(document.visibilityState !== 'hidden') return
  if(!errorEvents.length) return
    
  pushErrorEvent('tab visibilitychange hidden')

  const lastEvent = errorEvents[errorEvents.length - 1]
  const lastTime = lastEvent.lastTime || lastEvent.time
  const firstTime = errorEvents[0].time
  if(lastTime - firstTime < 10) {
    return // Give the site 10 seconds to load the watch page or move the video element
  }

  AmbilightSentry.captureExceptionWithDetails(
    new AmbilightError('Closed or hid the webpage tab with pending errors events', errorEvents)
  )
  errorEvents = []
}, false)

const ambilightDetectDetachedVideo = (ytdAppElem) => {
  const observer = new MutationObserver(wrapErrorHandler(function detectDetachedVideo(mutationsList, observer) {
    if (!isWatchPageUrl()) return

    const isDetached = (!ambilight.videoElem || !ambilight.ytdWatchFlexyElem.contains(ambilight.videoElem))
    if (!isDetached) {
      if(errorEvents.length) {
        errorEvents = []
      }
      return
    }

    const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
    if (!videoElem) {
      const details = {
        documentContainsAmbilightVideoElem: document.contains(ambilight.videoElem),
        'ambilight.videoElem': getNodeTreeString(ambilight.videoElem),
        tree: getSelectorTreeString('video,#player-container')
      }
      pushErrorEvent('detectDetachedVideo | video detached and no new video', details)
      return
    }

    ambilight.initVideoElem(videoElem)
    ambilight.start()

    if(errorEvents.length) {
      errorEvents = []
    }
  }, true))

  observer.observe(document, {
    attributes: false,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: true,
    subtree: true
  })
}

const tryInitAmbilight = (ytdAppElem) => {
  if (!isWatchPageUrl()) return

  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if (!videoElem) {
    const ytPlayerManagerVideoElem = ytdAppElem.querySelector('yt-player-manager video.html5-main-video')
    if(ytPlayerManagerVideoElem) {
      // console.warn('Ambient light for YouTube™ | Waiting for the video to transition from the player-api')
      // console.log(playerApiElem.cloneNode(true))
      pushErrorEvent('tryInit | video in yt-player-manager')
      return false
    }
    const ytdMiniplayerVideoElem = ytdAppElem.querySelector('ytd-miniplayer video.html5-main-video')
    if(ytdMiniplayerVideoElem) {
      // console.warn('Ambient light for YouTube™ | Waiting for the video to transition from the miniplayer')
      pushErrorEvent('tryInitAmbilight | video in ytd-miniplayer')
      return false
    }
    const playerApiElem = document.querySelector('#player-api video.html5-main-video')
    if(playerApiElem) {
      pushErrorEvent('tryInitAmbilight | video in #player-api')
      return false
    }
    // console.warn('Ambient light for YouTube™ | Waiting for the video to be created in ytd-app')
    pushErrorEvent('tryInitAmbilight | no video in ytd-app ytd-watch-flexy', {
      tree: getSelectorTreeString('video,#player-container')
    })
    return false
  }

  window.ambilight = new Ambilight(ytdAppElem, videoElem)

  errorEvents = []
  ambilightDetectDetachedVideo(ytdAppElem)
  ambilightDetectPageTransitions(ytdAppElem)
  if(!window.ambilight.isOnVideoPage) {
    ambilightDetectWatchPageVideo(ytdAppElem);
  }
  return true
}

const isWatchPageUrl = () => (location.pathname === '/watch')

const getWatchPageViewObserver = (() => {
  let observer;
  return (ytdAppElem) => {
    if(!observer) {
      observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => 
        ambilightStartIfWatchPageHasVideo(ytdAppElem)
      ))
    }
    return observer;
  }
})();
const ambilightDetectWatchPageVideo = (ytdAppElem) => {
  getWatchPageViewObserver(ytdAppElem).observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}
const ambilightStartIfWatchPageHasVideo = (ytdAppElem) => {
  if (!isWatchPageUrl() || window.ambilight.isOnVideoPage) {
    getWatchPageViewObserver().disconnect()
    return
  }

  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if(!videoElem) return

  getWatchPageViewObserver().disconnect()
  window.ambilight.isOnVideoPage = true
  window.ambilight.start()
}

const ambilightDetectPageTransitions = (ytdAppElem) => {
  const navigationManager = document.querySelector('yt-navigation-manager')
  on(navigationManager, 'yt-navigate-finish', () => {
    getWatchPageViewObserver(ytdAppElem).disconnect()
    if(isWatchPageUrl()) {
      ambilightStartIfWatchPageHasVideo(ytdAppElem)
      if(!window.ambilight.isOnVideoPage) {
        ambilightDetectWatchPageVideo(ytdAppElem)
      }
    } else {
      if(window.ambilight.isOnVideoPage) {
        window.ambilight.isOnVideoPage = false
        window.ambilight.hide()
      }
    }
  }, undefined, undefined, true);
}

const loadAmbilight = () => {
  // Validate YouTube desktop web app
  const ytdAppElem = $.s('ytd-app')
  if(!ytdAppElem) {
    const appElems = [...$.sa('body > *')]
      .filter(elem => elem.tagName.endsWith('-APP') && elem.tagName !== 'YTVP-APP')
    if(appElems.length) {
      const selectorTree = getSelectorTreeString(appElems.map(elem => elem.tagName).join(','))
      throw new AmbilightError('Found one or more *-app elements but cannot find desktop app element: ytd-app', selectorTree)
    }
    return
  }

  if (tryInitAmbilight(ytdAppElem)) return
  // Not on the watch page yet

  // Listen to DOM changes
  const observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => {
    if (window.ambilight) {
      observer.disconnect()
      return
    }

    try {
      if (tryInitAmbilight(ytdAppElem)) {
        // Initialized
        observer.disconnect()
      }
    } catch (ex) {
      // Disconnect to prevent infinite loops
      observer.disconnect()
      throw ex
    }
  }, true))
  observer.observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}

const onLoad = () => requestIdleCallback(function onLoad() {
  if(window.ambilight) return
    
  loadAmbilight()
}, { timeout: 5000 })

try {
  if(document.readyState === 'complete') {
    onLoad()
  } else {
    window.addEventListener('load', onLoad)
  }
} catch (ex) {
  AmbilightSentry.captureExceptionWithDetails(ex)
}
