import { $, html, body, waitForDomElement, raf, ctxOptions, Canvas, SafeOffscreenCanvas, safeRequestIdleCallback } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'
import detectHorizontalBarSize from './horizontal-bar-detection'
import { getGPUBenchmarkScore } from './benchmark'

class Ambilight {
  static isClassic = false
  VIEW_DETACHED = 'VIEW_DETACHED'
  VIEW_SMALL = 'VIEW_SMALL'
  VIEW_THEATER = 'VIEW_THEATER'
  VIEW_FULLSCREEN = 'VIEW_FULLSCREEN'
  VIEW_POPUP = 'VIEW_POPUP'

  horizontalBarsClipPX = 0
  lastCheckVideoSizeTime = 0

  projectorOffset = {}
  srcVideoOffset = {}

  isHidden = true
  isOnVideoPage = true
  showedCompareWarning = false

  p = null
  a = null
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
  frameDuration = 1
  syncInfo = []

  enableMozillaBug1606251Workaround = false
  enableChromiumBug1123708Workaround = false
  enableChromiumBug1092080Workaround = false

  calculateGPUBenchmarkScore = async () => {
    try {
      const score = await getGPUBenchmarkScore()
      console.log('awaited score:', score)
      
      let scoreElem = document.querySelector('#info-text-score')
      if(!scoreElem) {
        const infoElem = document.querySelector('#info-text')
        if(infoElem) {
          scoreElem = document.createElement('span')
          scoreElem.id = 'info-text-score';
          scoreElem.style.color = '#fff'
          infoElem.appendChild(scoreElem);
        } else {
          console.log('no elem but score:', score)
          return
        }
      }
      
      scoreElem.textContent = ` - GPU Score: ${Math.round(score * 1000) / 1000}`
    } catch(error) {
      console.error(error)
    }
  }

  constructor(videoElem) {
    this.videoHasRequestVideoFrameCallback = !!videoElem.requestVideoFrameCallback
    this.detectChromiumBug1142112Workaround()
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

    this.initScrollPosition()
    this.initImmersiveMode()

    this.initListeners()
    this.initGetImageDataAllowed()

    setTimeout(() => {
      if (this.enabled)
        this.enable(true)
    }, 0)
    // setTimeout(() => {
    //   this.calculateGPUBenchmarkScoreInfinite()
    // }, 1)
  }

  calculateGPUBenchmarkScoreInfinite = async () => {
      await this.calculateGPUBenchmarkScore()
      this.calculateGPUBenchmarkScoreInfinite()
  }

  initVideoElem(videoElem) {
    this.applyChromiumBug1142112Workaround(videoElem)
    this.videoElem = videoElem
  }

  // FireFox workaround: Force to rerender the outer blur of the canvasses
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1606251
  detectMozillaBug1606251Workaround() {
    if(this.videoElem.mozPaintedFrames) {
      const match = navigator.userAgent.match(/Firefox\/(?<version>(\.|[0-9])+)/)
      if(match && match.groups.version) {
        const version = parseFloat(match.groups.version)
        if(version && version < 74) {
          this.enableMozillaBug1606251Workaround = resetThemeToLightIfSettingIsTrue
        }
      }
    }
  }

  // Chromium workaround: YouTube drops the video quality because the video is dropping frames 
  // when requestVideoFrameCallback is used and the video is offscreen 
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1142112
  detectChromiumBug1142112Workaround() {
    if(!this.videoHasRequestVideoFrameCallback) return

    const match = navigator.userAgent.match(/Chrome\/(?<version>(\.|[0-9])+)/)
    if(match && match.groups.version) {
      this.enableChromiumBug1142112Workaround = true
    }
  }

  
  applyChromiumBug1142112Workaround(videoElem) {
    if(!this.enableChromiumBug1142112Workaround) return;

    if(this.videoObserver && this.videoElem) {
      this.videoObserver.unobserve(this.videoElem)
    }

    this.videoIsHidden = false
    if(!this.videoObserver) {
      this.videoObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach(entry => {
            this.videoIsHidden = (entry.intersectionRatio === 0)
            this.videoVisibilityChangeTime = performance.now()
            this.videoElem.getVideoPlaybackQuality() // Correct dropped frames
            // if(!this.videoIsHidden) {
            //   safeRequestIdleCallback(() => {
            //     this.clear() // Might fix frozen, delayed and flickering canvas bug
            //   })
            // }
          })
        },
        {
          threshold: 0.0001 // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      )
    }
    this.videoObserver.observe(videoElem)
    
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
  }

  // Chromium workaround: Force to render the blur originating from the canvasses past the browser window
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1123708
  detectChromiumBug1123708Workaround() {
    const match = navigator.userAgent.match(/Chrome\/(?<version>(\.|[0-9])+)/)
    if(match && match.groups.version) {
      const version = parseFloat(match.groups.version)
      if(version && version >= 85) {
        this.enableChromiumBug1123708Workaround = true
      }
    }
  }

  // Chromium workaround: drawImage randomly disables antialiasing in the videoOverlay and/or projectors
  // Additional 0.05ms performance impact per clearRect()
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1092080
  detectChromiumBug1092080Workaround() {
    const match = navigator.userAgent.match(/Chrome\/(?<version>(\.|[0-9])+)/)
    if(match && match.groups.version) {
      const version = parseFloat(match.groups.version)
      if(version && version >= 82) {
        this.enableChromiumBug1092080Workaround = true
      }
    }
  }

  initStyles () {
    this.styleElem = document.createElement('style')
    this.styleElem.appendChild(document.createTextNode(''))
    document.head.appendChild(this.styleElem)
  }

  initListeners() {
    this.videoElem
      .on('playing', () => {
        // console.error('playing')
        //safeRequestIdleCallback(() => {
        this.clear() // Prevent old video frame from being drawn
        this.start()
        //})
      })
      .on('canplay', () => {
        // console.error('canplay')
        this.initGetImageDataAllowed()
        this.resetSettingsIfNeeded()
        if(!this.videoElem.paused) return;

        // this.clear()
        this.clear() // Prevent old video frame from being drawn
        this.scheduleNextFrame()
        // raf(() => this.scheduleNextFrame())
        // raf(() => setTimeout(() => this.scheduleNextFrame(), 100)) //Sometimes the first frame was not rendered yet
      })
      // .on('seeked', () => {
      //   console.error('seeked')
      //   if(!this.videoElem.paused) return;
      //   this.scheduleNextFrame()
      // })
      .on('error', (ex) => {
        console.error('Video error:', ex)
        this.resetSettingsIfNeeded()
        this.clear()
      })
      .on('ended', () => {
        // console.error('ended')
        // Next event: emptied
      })
      .on('emptied', () => {
        // console.error('emptied')
        this.resetSettingsIfNeeded()
        this.clear()
        this.ambilightVideoDroppedFrameCount = 0
      })

    $.sa('.ytp-size-button, .ytp-miniplayer-button').forEach(btn =>
      btn.on('click', () => raf(() => setTimeout(() => {
        this.checkVideoSize()
        if(Ambilight.isClassic || this.detectVideoFillScaleEnabled) {
          setTimeout(() => this.checkVideoSize(), 500) 
        }
      }, 1)))
    )

    window.on('resize', () => {
      if (!this.isOnVideoPage) return
      this.checkVideoSize()
      setTimeout(
        () => raf(() => setTimeout(
          () => this.checkVideoSize(), 
          200
        )),
        200
      )
    })

    document.on('keydown', (e) => {
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
      if (e.keyCode === 70 || e.keyCode === 84) { // f || t
        raf(() => this.checkVideoSize()) // Wait for drawn resized video element
      } else if (e.keyCode === 90) // z
        this.toggleImmersiveMode()
      else if (e.keyCode === 65) // a
        this.toggleEnabled()
      else if (e.keyCode === 66) // b
        $.s(`#setting-detectHorizontalBarSizeEnabled`).click()
      else if (e.keyCode === 87) // w
        $.s(`#setting-detectVideoFillScaleEnabled`).click()
    })
  }

  initGetImageDataAllowed() {
    this.getImageDataAllowed = (!window.chrome || (this.videoElem.src && this.videoElem.src.indexOf('youtube.com') !== -1))

    const settings = [
      $.s(`#setting-detectHorizontalBarSizeEnabled`),
      $.s(`#setting-detectColoredHorizontalBarSizeEnabled`),
      $.s(`#setting-detectHorizontalBarSizeOffsetPercentage`)
    ].filter(setting => setting)
    if(this.getImageDataAllowed) {
      settings.forEach(setting => setting.style.display = '')
    } else {
      settings.forEach(setting => setting.style.display = 'none')
    }
  }

  initAmbilightElems() {
    this.elem = document.createElement('div')
    this.elem.class('ambilight')
    body.prepend(this.elem)

    this.videoShadowElem = document.createElement('div')
    this.videoShadowElem.class('ambilight__video-shadow')
    this.elem.prepend(this.videoShadowElem)

    this.filterElem = document.createElement('div')
    this.filterElem.class('ambilight__filter')
    this.elem.prepend(this.filterElem)

    if (this.enableChromiumBug1123708Workaround) {
      this.chromiumBug1123708WorkaroundElem = document.createElement('canvas')
      this.chromiumBug1123708WorkaroundElem.width = 1
      this.chromiumBug1123708WorkaroundElem.height = 1
      this.chromiumBug1123708WorkaroundElem.class('ambilight__chromium-bug-1123708-workaround')
      this.filterElem.prepend(this.chromiumBug1123708WorkaroundElem)
    }
  
    this.clipElem = document.createElement('div')
    this.clipElem.class('ambilight__clip')
    this.filterElem.prepend(this.clipElem)

    this.projectorsElem = document.createElement('div')
    this.projectorsElem.class('ambilight__projectors')
    this.clipElem.prepend(this.projectorsElem)

    this.projectorListElem = document.createElement('div')
    this.projectorListElem.class('ambilight__projector-list')
    this.projectorsElem.prepend(this.projectorListElem)

    const shadowElem = new Canvas(1920, 1080)
    shadowElem.class('ambilight__shadow')
    this.projectorsElem.appendChild(shadowElem)
    const shadowCtx = shadowElem.getContext('2d', { ...ctxOptions, alpha: true })
    this.shadow = {
      elem: shadowElem,
      ctx: shadowCtx
    }

    // Warning: Using Canvas elements in this div instead of OffScreenCanvas
    // while waiting for a fix for this issue:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1015729
    //this.buffersElem = document.createElement('div')
    //this.buffersElem.class('ambilight__buffers')
    //this.elem.prepend(this.buffersElem)
  }

  initBuffers() {
    this.buffersWrapperElem = document.createElement('div')
    this.buffersWrapperElem.classList.add('ambilight__buffers-wrapper')

    const videoSnapshotBufferElem = new Canvas(1, 1)
    this.buffersWrapperElem.appendChild(videoSnapshotBufferElem)
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

    const projectorsBufferElem = new Canvas(1, 1)
    this.buffersWrapperElem.appendChild(projectorsBufferElem)
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
        label: '<span style="display: inline-block; padding: 5px 0">Synchronization <a title="How much energy will be spent on sychronising the ambilight effect with the video.\n\nPower Saver: Lowest CPU & GPU usage.\nMight result in ambilight with dropped and delayed frames.\n\nBalanced: Medium CPU & GPU usage.\nMight still result in ambilight with delayed frames on higher than 1080p videos.\n\nHigh Performance: Highest CPU & GPU usage.\nMight still result in delayed frames on high refreshrate monitors (120hz and higher) and higher than 1080p videos.\n\nPerfect (!Experimental): Lowest CPU & GPU usage.\nIt is perfect, but in an experimental fase because it\'s based on a new browser technique." href="#" onclick="return false" style="padding: 0 5px;">?</a>',
        type: 'list',
        default: 50,
        min: 0,
        max: 100,
        step: 50,
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
        label: '<span style="display: inline-block; padding: 5px 0">Sync video with ambilight <a title="Delays the video frames according to the ambilight frametimes. This makes sure that that the ambilight is never out of sync with the video, but it can introduce stuttering and/or dropped frames." href="#" onclick="return false" style="padding: 0 5px;">?</a></span>',
        type: 'checkbox',
        default: false,
        advanced: true
      },
      {
        experimental: true,
        name: 'videoOverlaySyncThreshold',
        label: '<span style="display: inline-block; padding: 5px 0">Sync video disable threshold<br/><span class="ytpa-menuitem-description">(Disable when dropping % of frames)</span></span>',
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
        label: '<span style="display: inline-block; padding: 5px 0">Smooth motion (frame blending) <a title="Click for more information about Frame blending" href="https://nl.linkedin.com/learning/premiere-pro-guru-speed-changes/frame-sampling-vs-frame-blending" target="_blank" style="padding: 0 5px;">?</a><br/><span class="ytpa-menuitem-description">(More GPU usage. Works with "Sync video")</span></span>',
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
        label: 'Page content',
        name: 'sectionOtherPageContentCollapsed',
        default: false
      },
      {
        name: 'surroundingContentShadowSize',
        label: 'Shadow size<br/><span class="ytpa-menuitem-description">(Can cause scroll stuttering)</span>',
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
        name: 'immersive',
        label: 'Hide when scrolled to top [Z]',
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
        label: 'Remove black bars [B]<br/><span class="ytpa-menuitem-description">(More CPU usage)</span>',
        type: 'checkbox',
        default: false
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
        snapPoints: [8.7, 12.3, 13.5],
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
        label: 'Fill video to screen width [W]',
        type: 'checkbox',
        default: false
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
        label: 'Ambilight',
        name: 'sectionAmbilightCollapsed',
        default: false
      },
      {
        name: 'blur',
        label: `
          <span style="display: inline-block; padding: 5px 0">Blur<br/>
          <span class="ytpa-menuitem-description">(More GPU memory)</span></span>`,
        type: 'list',
        default: 50,
        min: 0,
        max: 100,
        step: .1
      },
      {
        name: 'spread',
        label: `
          <span style="display: inline-block; padding: 5px 0">Spread<br/>
          <span class="ytpa-menuitem-description">(More GPU usage)</span></span>`,
        type: 'list',
        default: 20,
        min: 0,
        max: 200,
        step: .1
      },
      {
        name: 'edge',
        label: `
          <span style="display: inline-block; padding: 5px 0">Edge size<br/>
          <span class="ytpa-menuitem-description">(Less GPU usage. Tip: Turn blur down)</span></span>`,
        type: 'list',
        default: 17,
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
        label: `
          <span style="display: inline-block; padding: 5px 0">Fade out curve<br/>
          <span class="ytpa-menuitem-description">(Tip: Turn blur all the way down)</span></span>`,
        type: 'list',
        default: 35,
        min: 1,
        max: 100,
        step: 1,
        advanced: true
      },
      {
        name: 'debandingStrength',
        label: `
          Debanding (noise) 
          <a 
            title="Click for more information about Dithering" 
            href="https://www.lifewire.com/what-is-dithering-4686105" 
            target="_blank" 
            style="padding: 0 5px;">?</a>`,
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
        name: 'resetThemeToLightOnDisable',
        label: 'Switch to light theme when turned off',
        type: 'checkbox',
        default: false,
        advanced: false
      },
      {
        name: 'enableInFullscreen',
        label: `
          <span style="display: inline-block; padding: 5px 0">
            Enable in fullscreen<br/>
            <span class="ytpa-menuitem-description">(When in fullscreen mode)</span>
          </span>`,
        type: 'checkbox',
        default: true,
        advanced: true
      },
      {
        name: 'enabled',
        label: 'Enabled [A]',
        type: 'checkbox',
        default: true
      },
    ]

    this.settings = this.settings.map(setting => {
      if(this.videoHasRequestVideoFrameCallback) {
        if(setting.name === 'frameSync') {
          setting.max = 150
          setting.default = 150
          // setting.advanced = true
        }
        // if(setting.name === 'frameSync') {
        //   return undefined
        // }
        if(setting.name === 'sectionAmbilightQualityPerformanceCollapsed') {
          // setting.advanced = true
        }
      }
      return setting
    }).filter(setting => setting)

    this.getAllSettings()
    this.initSettingsMenu()
  }

  getAllSettings() {
    this.enabled = this.getSetting('enabled')
    html.attr('data-ambilight-enabled', this.enabled)

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

    this.spread = this.getSetting('spread')
    this.blur = this.getSetting('blur')
    this.bloom = this.getSetting('bloom')
    this.fadeOutEasing = this.getSetting('fadeOutEasing')
    this.edge = this.getSetting('edge')
    this.innerStrength = 2
    this.videoOverlayEnabled = this.getSetting('videoOverlayEnabled')
    this.videoOverlaySyncThreshold = this.getSetting('videoOverlaySyncThreshold')

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
      console.warn('YouTube Ambilight | getSetting', ex)
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
      this.removeSetting('highQuality')
    } else {
      this.frameSync = this.getSetting('frameSync')
    }

    this.framerateLimit = this.getSetting('framerateLimit')
    this.frameBlending = this.getSetting('frameBlending')
    this.frameBlendingSmoothness = this.getSetting('frameBlendingSmoothness')
    this.immersive = this.getSetting('immersive')
    this.hideScrollbar = this.getSetting('hideScrollbar')
    html.attr('data-ambilight-hide-scrollbar', this.hideScrollbar)
    this.enableInFullscreen = this.getSetting('enableInFullscreen')
    this.resetThemeToLightOnDisable = this.getSetting('resetThemeToLightOnDisable')
    this.showFPS = this.getSetting('showFPS')

    this.surroundingContentShadowSize = this.getSetting('surroundingContentShadowSize')
    this.surroundingContentShadowOpacity = this.getSetting('surroundingContentShadowOpacity')
    this.debandingStrength = this.getSetting('debandingStrength')

    this.videoShadowSize = this.getSetting('videoShadowSize')
    this.videoShadowOpacity = this.getSetting('videoShadowOpacity')

    this.settings.forEach(setting => {
      setting.value = this[setting.name]
    })
  }

  initFPSListElem() {
    if (this.videoSyncedElem && this.videoSyncedElem.isConnected) return

    this.FPSListElem = document.createElement('div')
    this.FPSListElem.class('ambilight__fps-list')

    this.displayFPSElem = document.createElement('div')
    this.displayFPSElem.class('ambilight__display-fps')
    this.FPSListElem.prepend(this.displayFPSElem)

    this.ambilightDroppedFramesElem = document.createElement('div')
    this.ambilightDroppedFramesElem.class('ambilight__ambilight-dropped-frames')
    this.FPSListElem.prepend(this.ambilightDroppedFramesElem)

    this.ambilightFPSElem = document.createElement('div')
    this.ambilightFPSElem.class('ambilight__ambilight-fps')
    this.FPSListElem.prepend(this.ambilightFPSElem)

    this.videoSyncedElem = document.createElement('div')
    this.videoSyncedElem.class('ambilight__video-synced')
    this.FPSListElem.prepend(this.videoSyncedElem)

    this.videoDroppedFramesElem = document.createElement('div')
    this.videoDroppedFramesElem.class('ambilight__video-dropped-frames')
    this.FPSListElem.prepend(this.videoDroppedFramesElem)

    this.videoFPSElem = document.createElement('div')
    this.videoFPSElem.class('ambilight__video-fps')
    this.FPSListElem.prepend(this.videoFPSElem)

    const playerContainerElem = (Ambilight.isClassic) ? $.s('#player-api') : $.s('#player-container')
    playerContainerElem.prepend(this.FPSListElem)
  }

  initVideoOverlay() {
    const videoOverlayElem = new Canvas(1, 1)
    videoOverlayElem.class('ambilight__video-overlay')
    this.videoOverlay = {
      elem: videoOverlayElem,
      ctx: videoOverlayElem.getContext('2d', ctxOptions),
      isHiddenChangeTimestamp: 0
    }
  }

  initFrameBlending() {
    //this.previousProjectorBuffer
    const previousProjectorsBufferElem = new Canvas(1, 1) 
    //this.buffersElem.appendChild(previousProjectorsBufferElem)
    this.buffersWrapperElem.appendChild(previousProjectorsBufferElem)
    this.previousProjectorBuffer = {
      elem: previousProjectorsBufferElem,
      ctx: previousProjectorsBufferElem.getContext('2d', ctxOptions)
    }

    //this.blendedProjectorBuffer
    const blendedProjectorsBufferElem = new Canvas(1, 1) 
    //this.buffersElem.appendChild(blendedProjectorsBufferElem)
    this.buffersWrapperElem.appendChild(blendedProjectorsBufferElem)
    this.blendedProjectorBuffer = {
      elem: blendedProjectorsBufferElem,
      ctx: blendedProjectorsBufferElem.getContext('2d', ctxOptions)
    }
  }

  initVideoOverlayWithFrameBlending() {
    //this.videoOverlayBuffer
    const videoOverlayBufferElem = new Canvas(1, 1) 
    //this.buffersElem.appendChild(videoOverlayBufferElem)
    this.buffersWrapperElem.appendChild(videoOverlayBufferElem)
    this.videoOverlayBuffer = {
      elem: videoOverlayBufferElem,
      ctx: videoOverlayBufferElem.getContext('2d', ctxOptions)
    }

    //this.previousVideoOverlayBuffer
    const previousVideoOverlayBufferElem = new Canvas(1, 1) 
    //this.buffersElem.appendChild(previousVideoOverlayBufferElem)
    this.buffersWrapperElem.appendChild(previousVideoOverlayBufferElem)
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
    this.horizontalBarsClipPercentage = percentage
    this.updateSizes()
    this.scheduleNextFrame()
    setTimeout(() => {
      this.setSetting('horizontalBarsClipPercentage', percentage)
      const rangeInput = $.s('#setting-horizontalBarsClipPercentage-range')
      if(rangeInput) {
        rangeInput.value = percentage
        $.s(`#setting-horizontalBarsClipPercentage-value`).textContent = `${percentage}%`
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
      projectorElem.class('ambilight__projector')

      const projectorCtx = projectorElem.getContext('2d', ctxOptions)
      this.projectorListElem.prepend(projectorElem)

      this.projectors.push({
        elem: projectorElem,
        ctx: projectorCtx
      })
    }
  }

  clear() {
    ambilightSetVideoInfo()

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
    canvasses.forEach(({ ctx, elem }) => {
      // ctx.clearRect(0, 0, elem.width, elem.height)
      elem.width = 1;
    })

    

    this.buffersCleared = true
    this.sizesInvalidated = true
    this.checkIfNeedToHideVideoOverlay()
    this.scheduleNextFrame()
  }

  // Todo: Fix the case when clicking the theater toggle button and the video is not completely resized
  // This causes the video to get a 150% scale which is incorrect once the video is resized causing the video to cut off at the bottom
  detectVideoFillScale() {
    let videoScale = 100
    if(this.videoElem.offsetWidth && this.videoElem.offsetHeight) {
      const videoContainer = this.videoElem.closest('.html5-video-player')
      if(videoContainer) {
        const videoScaleY = (100 - (this.horizontalBarsClipPercentage * 2)) / 100
        const videoWidth = this.videoElem.offsetWidth
        const videoHeight = this.videoElem.offsetHeight * videoScaleY
        const containerWidth = videoContainer.offsetWidth
        const containerHeight = videoContainer.offsetHeight
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

    this.setSetting('videoScale', videoScale)
    if($.s('#setting-videoScale')) {
      $.s('#setting-videoScale-range').value = videoScale
      $.s(`#setting-videoScale-value`).textContent = `${videoScale}%`
    }
  }

  updateSizes() {
    try {
      if(this.detectVideoFillScaleEnabled){
        this.detectVideoFillScale()
      }

      const playerElem = $.s('.html5-video-player')
      const flexyElem = $.s('ytd-watch-flexy')
      const pageElem = $.s('#page')
      this.isVR = !!$.s('.ytp-webgl-spherical')

      if(playerElem) {
        const prevView = this.view
        if(playerElem.classList.contains('ytp-fullscreen'))
          this.view = this.VIEW_FULLSCREEN
        else if(
          (flexyElem && flexyElem.attr('theater') !== null) ||
          (pageElem && pageElem.classList.contains('watch-stage-mode'))
        )
          this.view = this.VIEW_THEATER
        else if(playerElem.classList.contains('ytp-player-minimized'))
          this.view = this.VIEW_POPUP
        else
          this.view = this.VIEW_SMALL
      } else {
        this.view = this.VIEW_DETACHED
      }

      // Todo: Set the settings for the specific view
      // if(prevView !== this.view) {
      //   console.log('VIEW CHANGED: ', this.view)
      //   this.getAllSettings()
      // }

      this.isFullscreen = (this.view == this.VIEW_FULLSCREEN)
      const noClipOrScale = (this.horizontalBarsClipPercentage == 0 && this.videoScale == 100)
      this.isFillingFullscreen = (
        this.isFullscreen &&
        Math.abs(this.projectorOffset.width - window.innerWidth) < 10 &&
        Math.abs(this.projectorOffset.height - window.innerHeight) < 10 &&
        noClipOrScale
      )

      const videoElemParentElem = this.videoElem.parentNode

      const notVisible = (
        !this.enabled ||
        this.isVR ||
        !videoElemParentElem ||
        !playerElem ||
        playerElem.classList.contains('ytp-player-minimized') ||
        (this.isFullscreen && !this.enableInFullscreen)
      )
      if (notVisible || noClipOrScale) {
        if (videoElemParentElem) {
          videoElemParentElem.style.transform = ''
          videoElemParentElem.style.overflow = ''
          videoElemParentElem.style.height = ''
          videoElemParentElem.style.marginBottom = ''
          videoElemParentElem.style.setProperty('--video-transform', '')
        }
      }
      if (notVisible) {
        this.hide()
        return true
      }
      
      if(this.isFullscreen) {
        if(this.elem.parentElement !== playerElem) {
          playerElem.prepend(this.elem)
        }
      } else {
        if(this.elem.parentElement !== body) {
          body.prepend(this.elem)
        }
      }

      const horizontalBarsClip = this.horizontalBarsClipPercentage / 100
      if (!noClipOrScale) {
        const top = Math.max(0, parseInt(this.videoElem.style.top))
        videoElemParentElem.style.height = `${this.videoElem.offsetHeight}px`
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

      this.projectorOffset = this.videoElem.offset()
      if (
        this.projectorOffset.top === undefined ||
        !this.projectorOffset.width ||
        !this.projectorOffset.height ||
        !this.videoElem.videoWidth ||
        !this.videoElem.videoHeight
      ) return false //Not ready

      const scrollTop = (this.isFullscreen ? (Ambilight.isClassic ? 0 : $.s('ytd-app').scrollTop) : window.scrollY)
      this.projectorOffset = {
        left: this.projectorOffset.left,
        top: this.projectorOffset.top + scrollTop,
        width: this.projectorOffset.width,
        height: this.projectorOffset.height
      }

      this.srcVideoOffset = {
        top: this.projectorOffset.top,
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

      const unscaledWidth = Math.round(this.projectorOffset.width / (this.videoScale / 100))
      const unscaledHeight = Math.round(this.projectorOffset.height / (this.videoScale / 100))
      const unscaledLeft = Math.round(
        (this.projectorOffset.left + window.scrollX) - 
        ((unscaledWidth - this.projectorOffset.width) / 2)
      )
      const unscaledTop = Math.round(
        this.projectorOffset.top - 
        ((unscaledHeight - this.projectorOffset.height) / 2)
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
        ${(this.blur != 0) ? `blur(${Math.round(this.projectorOffset.height) * (this.blur * .0025)}px)` : ''}
        ${(this.contrast != 100) ? `contrast(${this.contrast}%)` : ''}
        ${(this.brightness != 100) ? `brightness(${this.brightness}%)` : ''}
        ${(this.saturation != 100) ? `saturate(${this.saturation}%)` : ''}
      `.trim()

      this.projectors.forEach((projector) => {
        if (projector.elem.width !== this.p.w)
          projector.elem.width = this.p.w
        if (projector.elem.height !== this.p.h)
          projector.elem.height = this.p.h
      })

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

      if (this.videoOverlayEnabled && this.videoOverlay && !this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.appendTo($.s('.html5-video-container'))
      } else if (!this.videoOverlayEnabled && this.videoOverlay && this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
      }
      if (this.videoOverlayEnabled && this.videoOverlay) {
        this.videoOverlay.elem.setAttribute('style', this.videoElem.getAttribute('style'))
        this.videoOverlay.elem.width = this.srcVideoOffset.width
        this.videoOverlay.elem.height = this.srcVideoOffset.height

        if (this.frameBlending) {
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
    } catch (ex) {
      console.error('YouTube Ambilight | Resize | UpdateSizes:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
      throw new Error('catched')
    }
  }

  updateStyles() {
    const shadowSize = this.surroundingContentShadowSize / 5
    const shadowOpacity = this.surroundingContentShadowOpacity / 100
    const baseurl = html.getAttribute('data-ambilight-baseurl') || ''
    const debandingStrength = parseFloat(this.debandingStrength)
    const videoShadowSize = parseFloat(this.videoShadowSize, 10) / 2 + Math.pow(this.videoShadowSize / 5, 1.77) // Chrome limit: 250px | Firefox limit: 100px
    const videoShadowOpacity = this.videoShadowOpacity / 100
    
    const noiseImageIndex = (debandingStrength > 75) ? 3 : (debandingStrength > 50) ? 2 : 1
    const noiseOpacity =  debandingStrength / ((debandingStrength > 75) ? 100 : (debandingStrength > 50) ? 75 : 50)
    
    
    document.body.style.setProperty('--ambilight-video-shadow-background', 
      (videoShadowOpacity) ? `rgba(0,0,0,${videoShadowOpacity})` : '')
    document.body.style.setProperty('--ambilight-video-shadow-box-shadow', 
      (videoShadowSize && videoShadowOpacity)
        ? `
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px,
          rgba(0,0,0,${videoShadowOpacity}) 0 0 ${videoShadowSize}px
        `
        : '')

    document.body.style.setProperty('--ambilight-filter-shadow', 
      (shadowSize && shadowOpacity) 
      ? (
        (shadowOpacity > .5) 
        ? `
          drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity}))
          drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity}))
        `
        : `drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity * 2}))`
      )
      : '')
    document.body.style.setProperty('--ambilight-filter-shadow-inverted', 
      (shadowSize && shadowOpacity) 
      ? (
        (shadowOpacity > .5) 
        ? `
          drop-shadow(0 0 ${shadowSize}px rgba(255,255,255,${shadowOpacity})) 
          drop-shadow(0 0 ${shadowSize}px rgba(255,255,255,${shadowOpacity}))
        `
        : `drop-shadow(0 0 ${shadowSize}px rgba(255,255,255,${shadowOpacity * 2}))`
      )
      : '')

    document.body.style.setProperty('--ambilight-after-content', 
      debandingStrength ? `''` : '')
    document.body.style.setProperty('--ambilight-after-background', 
      debandingStrength ? `url('${baseurl}images/noise-${noiseImageIndex}.png')` : '')
    document.body.style.setProperty('--ambilight-after-opacity', 
      debandingStrength ? noiseOpacity : '')

    document.body.style.setProperty('--ambilight-html5-video-player-overflow', 
      (this.videoScale > 100) ?  'visible' : '')
  }

  resizeCanvasses() {
    const projectorSize = {
      w: this.projectorOffset.width,
      h: this.projectorOffset.height * this.horizontalBarsClipScaleY
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

    this.projectors.forEach((projector, i) => {
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
    })

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
      keyframes.forEach((e, i) => {
        gradientStops.push([Math.min(1, points[0 + keyframes.length - i] / pointMax), `rgba(0,0,0,${e.o})`])
      })
      gradientStops.push([Math.min(1, points[1 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
      gradientStops.push([Math.min(1, points[2 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
      keyframes.reverse().forEach((e, i) => {
        gradientStops.push([Math.min(1, points[2 + (keyframes.length * 2) - i] / pointMax), `rgba(0,0,0,${e.o})`])
      })
      gradientStops.push([Math.min(1, points[3 + (keyframes.length * 2)] / pointMax), `rgba(0,0,0,${darkest})`])

      gradientStops = gradientStops.map(args => [(Math.round(args[0] * 10000)/ 10000), args[1]])
      gradientStops.forEach(args => gradient.addColorStop(...args))
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
      const projectorsElemRect = this.projectorsElem.getBoundingClientRect()
      const videoElemRec = this.videoElem.getBoundingClientRect()
      const expectedProjectsElemRectY = videoElemRec.y + (videoElemRec.height * (this.horizontalBarsClipPercentage/100))
      if (
        Math.abs(projectorsElemRect.width - videoElemRec.width) > 1 ||
        Math.abs(projectorsElemRect.x - videoElemRec.x) > 1 ||
        Math.abs(projectorsElemRect.y - expectedProjectsElemRectY) > 2
      ) {
        return this.updateSizes()
      }
    }

    return true
  }

  scheduleNextFrame() {
    try {
      if (
        !this.enabled || 
        !this.isOnVideoPage ||
        this.scheduledNextFrame
      ) return

      this.scheduleRequestVideoFrame()
      this.scheduledNextFrame = true
      raf(this.onNextFrame)
    } catch (ex) {
      if(ex.message === 'catched') return
      console.error('YouTube Ambilight | ScheduleNextFrame:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }

  onNextFrame = () => {
    try {
      if (!this.scheduledNextFrame) return
      this.scheduledNextFrame = false

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
    } catch (ex) {
      if(ex.message === 'catched') return
      console.error('YouTube Ambilight | OnNextFrame:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
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

  nextFrame = () => {
    try {
      let delayedCheckVideoSizeAndPosition = false
      if (!this.p) {
        if(!this.checkVideoSize()) {
          //If was detected hidden by checkVideoSize => updateSizes this.p won't be initialized yet
          return
        }
      } else if(this.sizesInvalidated) {
        this.checkVideoSize(false)
      } else {
        delayedCheckVideoSizeAndPosition = true
      }
      
      try {
        this.drawAmbilight()
      } catch (ex) {
        if(ex.name == 'NS_ERROR_NOT_AVAILABLE') {
          if(!this.catchedNS_ERROR_NOT_AVAILABLE) {
            this.catchedNS_ERROR_NOT_AVAILABLE = true
            console.error('YouTube Ambilight | NextFrame:', ex)
            AmbilightSentry.captureExceptionWithDetails(ex)
          }
        } else if(ex.name == 'NS_ERROR_OUT_OF_MEMORY') {
          if(!this.catchedNS_ERROR_OUT_OF_MEMORY) {
            this.catchedNS_ERROR_OUT_OF_MEMORY = true
            console.error('YouTube Ambilight | NextFrame:', ex)
            AmbilightSentry.captureExceptionWithDetails(ex)
          }
        } else {
          throw ex
        }
      }


      if (this.videoOverlayEnabled) {
        this.checkIfNeedToHideVideoOverlay()
      }

      if(
        this.videoElem.paused || 
        this.videoElem.seeking ||
        this.videoElem.readyState === 0 || 
        this.videoElem.readyState === 1
      ) {
        return;
      }

      this.scheduleNextFrame()

      if (
        delayedCheckVideoSizeAndPosition &&
        (performance.now() - this.lastCheckVideoSizeTime) > 2000
      ) {
        this.checkVideoSize(true)
        this.lastCheckVideoSizeTime = performance.now()
      } else if((performance.now() - this.lastUpdateStatsTime) > 2000) {
        this.updateStats()
        this.lastUpdateStatsTime = performance.now()
      }
    } catch (ex) {
      if(ex.message === 'catched') return
      console.error('YouTube Ambilight | NextFrame:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
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
    if (!this.showFPS || this.isHidden) return;

    // Video FPS
    this.videoFPSElem.textContent = `VIDEO: ${this.videoFrameRate.toFixed(2)}`

    // Video dropped frames
    const videoDroppedFrameCount = this.getVideoDroppedFrameCount()
    this.videoDroppedFramesElem.textContent = `VIDEO DROPPED: ${videoDroppedFrameCount}`
    this.videoDroppedFramesElem.style.color = (videoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

    // Video synced
    if (this.videoOverlayEnabled) {
      this.videoSyncedElem.textContent = `VIDEO SYNCED: ${this.videoOverlay.isHidden ? 'NO' : 'YES'}`
      this.videoSyncedElem.style.color = this.videoOverlay.isHidden ? '#f55' : '#7f7'
      this.detectVideoSyncedWasHidden = this.videoOverlay.isHidden
    } else {
      this.videoSyncedElem.textContent = ''
    }

    // Ambilight FPS
    this.ambilightFPSElem.textContent = `AMBILIGHT: ${this.ambilightFrameRate.toFixed(2)}`
    this.ambilightFPSElem.style.color = (this.ambilightFrameRate < this.videoFrameRate * .9)
      ? '#f55'
      : (this.ambilightFrameRate < this.videoFrameRate - 0.01) ? '#ff3' : '#7f7'

    // Ambilight dropped frames
    this.ambilightDroppedFramesElem.textContent = `AMBILIGHT DROPPED: ${this.ambilightVideoDroppedFrameCount}`
    this.ambilightDroppedFramesElem.style.color = (this.ambilightVideoDroppedFrameCount > 0) ? '#ff3' : '#7f7'
    
    // Display FPS
    this.displayFPSElem.textContent = `DISPLAY: ${this.displayFrameRate.toFixed(2)}`
    this.displayFPSElem.style.color = (this.displayFrameRate < this.videoFrameRate - 1)
      ? '#f55'
      : (this.displayFrameRate < this.videoFrameRate - 0.01) ? '#ff3' : '#7f7'
  }

  drawAmbilight() {
    if (
      !this.enabled ||
      !this.isOnVideoPage ||
      this.videoElem.readyState === 0 || 
      this.videoElem.readyState === 1
    ) return

    if (
      this.isVR ||
      (this.isFillingFullscreen && !this.detectHorizontalBarSizeEnabled && !this.frameBlending && !this.videoOverlayEnabled) ||
      (!this.enableInFullscreen && this.isFullscreen)
    ) {
      this.hide()
      return
    }

    const drawTime = performance.now()
    if (this.isHidden) {
      this.show()
    }

    //performance.mark('start-drawing')
    let newVideoFrameCount = this.getVideoFrameCount()

    let updateVideoSnapshot = this.buffersCleared
    if(!updateVideoSnapshot) {
      if (this.frameSync == 150) { // PERFECT
        if(this.videoIsHidden) {
          updateVideoSnapshot = this.buffersCleared || (this.videoFrameCount < (newVideoFrameCount + (this.videoElem.webkitDroppedFrameCount || 0)))
        } else {
          updateVideoSnapshot = this.buffersCleared || this.videoFrameCallbackReceived
          this.videoFrameCallbackReceived = false
        }
      } else if(this.frameSync == 0) { // PERFORMANCE
        updateVideoSnapshot = this.buffersCleared || (this.videoFrameCount < newVideoFrameCount)
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
      
    // Execute getImageData on a separate buffer for performance:
    // 1. We don't interrupt the video to ambilight canvas flow (144hz instead of 85hz)
    // 2. We don't keep getting penalized after horizontal bar detection is disabled  (144hz instead of 45hz)
    let getImageDataBuffer = undefined

    let hasNewFrame = this.buffersCleared
    if(this.frameSync == 150) { // PERFECT
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if(this.frameSync == 0) { // PERFORMANCE
      hasNewFrame = hasNewFrame || updateVideoSnapshot
    } else if (this.frameSync == 50 || this.frameBlending) { // BALANCED
      hasNewFrame = hasNewFrame || (this.videoFrameCount < newVideoFrameCount)
      if (this.getImageDataAllowed && this.videoFrameRate && this.displayFrameRate && this.displayFrameRate > this.videoFrameRate) {
        if(!hasNewFrame || this.framerateLimit > this.videoFrameRate - 1) {
          //performance.mark('comparing-compare-start')

          if(!getImageDataBuffer) {
            getImageDataBuffer = this.videoSnapshotGetImageDataBuffer
            getImageDataBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem, 0, 0)
          }

          let lines = []
          let partSize = Math.ceil(getImageDataBuffer.elem.height / 3)
          try {
            for (let i = partSize; i < getImageDataBuffer.elem.height; i += partSize) {
              lines.push(getImageDataBuffer.ctx.getImageData(0, i, getImageDataBuffer.elem.width, 1).data)
            }
          } catch (ex) {
            if (!this.showedCompareWarning) {
              this.showedCompareWarning = true
              console.warn('Failed to retrieve video data. ', ex)
              AmbilightSentry.captureExceptionWithDetails(ex)
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
            this.oldLines = lines
          }
        }
      }
    } else if (this.frameSync == 100) { // HIGH PRECISION
      hasNewFrame = true
    }
    
    const droppedFrames = (this.videoFrameCount > 120 && this.videoFrameCount < newVideoFrameCount - 1)
    if (droppedFrames && !this.videoElem.seeking) {
      this.ambilightVideoDroppedFrameCount += newVideoFrameCount - (this.videoFrameCount + 1)
    }
    if (newVideoFrameCount > this.videoFrameCount || newVideoFrameCount < this.videoFrameCount - 60) {
      this.videoFrameCount = newVideoFrameCount
    }

    if (this.frameBlending && this.frameBlendingSmoothness) {
      if (!this.previousProjectorBuffer) {
        this.initFrameBlending()
      }
      if (this.videoOverlayEnabled && !this.previousVideoOverlayBuffer) {
        this.initVideoOverlayWithFrameBlending()
      }

      if (hasNewFrame || this.buffersCleared) {
        if (this.videoOverlayEnabled) {
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

      if (this.videoOverlayEnabled && this.videoOverlay) {
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
    } else {
      if (!hasNewFrame) return

      if (this.videoOverlayEnabled && this.videoOverlay) {
        if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
          this.videoOverlay.ctx.clearRect(0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
        }
        this.videoOverlay.ctx.drawImage(this.videoElem, 
          0, 0, this.videoOverlay.elem.width, this.videoOverlay.elem.height)
      }

      // Prevent adjusted videoSnapshotBufferBarsClipPx from leaking previous frame into the frame
      this.projectorBuffer.ctx.clearRect(0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)
      this.projectorBuffer.ctx.drawImage(this.videoSnapshotBuffer.elem,
        0,
        this.videoSnapshotBufferBarsClipPx,
        this.videoSnapshotBuffer.elem.width,
        this.videoSnapshotBuffer.elem.height - (this.videoSnapshotBufferBarsClipPx * 2), 
        0, 0, this.projectorBuffer.elem.width, this.projectorBuffer.elem.height)

      // if(this.enableChromiumBug1092080Workaround) { // && this.displayFrameRate >= this.ambilightFrameRate) {
      //   for(const projector of this.projectors) {
      //     projector.ctx.clearRect(0, 0, projector.elem.width, projector.elem.height)
      //   }
      // }
      for(const projector of this.projectors) {
        projector.ctx.drawImage(this.projectorBuffer.elem, 0, 0)
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
      this.getImageDataAllowed &&
      hasNewFrame
    ) {
      // Don't interrupt rendering
      try {
        this.detectHorizontalBarSize()
      } catch (ex) {
        if (!this.showedCompareWarning) {
          this.showedCompareWarning = true
          console.warn('Failed to retrieve video data. ', ex)
          AmbilightSentry.captureExceptionWithDetails(ex)
        }
      }
    }
  }

  detectHorizontalBarSize = () => {
    detectHorizontalBarSize(
      this.videoSnapshotBuffer,
      this.detectColoredHorizontalBarSizeEnabled,
      this.detectHorizontalBarSizeOffsetPercentage,
      this.horizontalBarsClipPercentage,
      (percentage) => {
        if(percentage !== undefined)
          this.setHorizontalBars(percentage)
      }
    )
  }

  // Check for dropped frames as well
  checkIfNeedToHideVideoOverlay() {
    if(!this.videoOverlay) return
    var ambilightFramesAdded = this.ambilightFrameCount - this.prevAmbilightFrameCountForShouldHideDetection
    var videoFramesAdded = this.videoFrameCount - this.prevVideoFrameCountForShouldHideDetection
    var canChange = (performance.now() - this.videoOverlay.isHiddenChangeTimestamp) > 2000
    var outSyncCount = this.syncInfo.filter(value => !value).length
    var outSyncMaxFrames = this.syncInfo.length * (this.videoOverlaySyncThreshold / 100)

    if (this.videoElem.paused || this.videoElem.seeking || (outSyncCount > outSyncMaxFrames && this.videoOverlaySyncThreshold !== 100)) {
      if (!this.videoOverlay.isHidden) {
        this.videoOverlay.elem.class('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = true
        this.videoOverlay.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    } else if (canChange || this.videoOverlaySyncThreshold == 100) {
      if (this.videoOverlay.isHidden) {
        this.videoOverlay.elem.removeClass('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = false
        this.videoOverlay.isHiddenChangeTimestamp = performance.now()
        this.updateStats()
      }
    }

    this.syncInfo.push(!(ambilightFramesAdded < videoFramesAdded))
    var syncInfoBufferLength = Math.min(120, Math.max(48, this.videoFrameRate * 2))
    if (this.syncInfo.length > syncInfoBufferLength) {
      this.syncInfo.splice(0, 1)
    }
    this.prevAmbilightFrameCountForShouldHideDetection = this.ambilightFrameCount
    this.prevVideoFrameCountForShouldHideDetection = this.videoFrameCount
  }

  enable(initial = false) {
    if (this.enabled && !initial) return

    this.setSetting('enabled', true)
    const enabledInput = $.s(`#setting-enabled`)
    if(enabledInput) enabledInput.attr('aria-checked', true)

    html.attr('data-ambilight-enabled', true)

    if (!initial) {
      const toLight = !html.attr('dark')
      this.resetThemeToLightOnDisable = toLight
      this.setSetting('resetThemeToLightOnDisable', toLight)
      const resetInput = $.s(`#setting-resetThemeToLightOnDisable`)
      if(resetInput) resetInput.attr('aria-checked', toLight)
    }

    this.resetSettingsIfNeeded()
    this.checkVideoSize()
    this.start()
  }

  disable() {
    if (!this.enabled) return

    this.setSetting('enabled', false)
    const enabledInput = $.s(`#setting-enabled`)
    if(enabledInput) enabledInput.attr('aria-checked', false)
    html.attr('data-ambilight-enabled', false)

    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }

    this.videoElem.style.marginTop = ''
    const videoElemParentElem = this.videoElem.parentNode
    if (videoElemParentElem) {
      videoElemParentElem.style.overflow = ''
      videoElemParentElem.style.marginTop = ''
      videoElemParentElem.style.height = ''
      videoElemParentElem.style.marginBottom = ''
    }

    this.checkVideoSize()
    this.hide()
  }

  static setDarkTheme(value) {
    try {
      if (Ambilight.isClassic) return
      if (Ambilight.setDarkThemeBusy) return
      if (html.attr('dark')) {
        if (value) return
      } else {
        if (!value) return
      }
      if (value && !$.s('ytd-app').hasAttribute('is-watch-page')) return
      Ambilight.setDarkThemeBusy = true

      const toggle = (rendererElem) => {
        rendererElem = rendererElem || $.s('ytd-toggle-theme-compact-link-renderer')
        if (value) {
          rendererElem.handleSignalActionToggleDarkThemeOn()
        } else {
          rendererElem.handleSignalActionToggleDarkThemeOff()
        }
        Ambilight.setDarkThemeBusy = false
      }

      const rendererElem = $.s('ytd-toggle-theme-compact-link-renderer')
      if (rendererElem) {
        toggle(rendererElem)
      } else {
        const findBtn = () => $.s('#avatar-btn') || // When logged in
          $.s('.ytd-masthead#buttons ytd-topbar-menu-button-renderer:last-of-type') // When not logged in

        $.s('ytd-popup-container').style.opacity = 0
        waitForDomElement(
          findBtn,
          'ytd-masthead',
          () => {
            waitForDomElement(
              () => {
                const rendererElem = $.s('ytd-toggle-theme-compact-link-renderer')
                return (rendererElem && rendererElem.handleSignalActionToggleDarkThemeOn)
              },
              'ytd-popup-container',
              () => {
                findBtn().click()
                toggle()
                setTimeout(() => {
                  $.s('ytd-popup-container').style.opacity = ''
                  previousActiveElement.focus()
                }, 1)
              })
            let previousActiveElement = document.activeElement
            findBtn().click()
          }
        )
      }
    } catch (ex) {
      console.error('Error while setting dark mode', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
      Ambilight.setDarkThemeBusy = false
    }
  }

  toggleEnabled() {
    if (this.enabled)
      this.disable()
    else
      this.enable()
  }

  start() {
    if (!this.isOnVideoPage || !this.enabled) return

    this.videoFrameRateMeasureStartFrame = 0
    this.videoFrameRateMeasureStartTime = 0
    this.showedCompareWarning = false
    this.requestVideoFrameCallbackId = undefined
    this.nextFrameTime = undefined

    // Prevent incorrect stats from showing
    this.lastUpdateStatsTime = performance.now() + 2000

    if (!html.attr('dark')) {
      Ambilight.setDarkTheme(true)
    }
    
    this.checkVideoSize(true)
    this.scheduleNextFrame()
  }

  scheduleRequestVideoFrame = () => {
    if (
      this.videoFrameCallbackReceived ||
      this.requestVideoFrameCallbackId ||
      this.frameSync != 150 ||
      !this.enabled ||
      // this.videoElem.paused ||
      this.videoIsHidden // Partial solution for https://bugs.chromium.org/p/chromium/issues/detail?id=1142112#c9
    ) return

    this.requestVideoFrameCallbackId = this.videoElem.requestVideoFrameCallback(this.receiveVideoFrame)
  }

  receiveVideoFrame = () => {
    this.requestVideoFrameCallbackId = undefined
    this.videoFrameCallbackReceived = true
  }

  hide() {
    if (this.isHidden) return
    this.isHidden = true

    this.elem.style.opacity = 0.0000001; //Avoid memory leak https://codepen.io/wesselkroos/pen/MWWorLW
    if (this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    const videoElemParentElem = this.videoElem.parentElement
    if(videoElemParentElem) {
      videoElemParentElem.style.transform = ''
      videoElemParentElem.style.overflow = ''
      videoElemParentElem.style.height = ''
      videoElemParentElem.style.marginBottom = ''
      videoElemParentElem.style.setProperty('--video-transform', '')
    }

    setTimeout(() => {
      this.clear()
      this.hideStats()
    }, 500)

    html.attr('data-ambilight-enabled', false)
    html.attr('data-ambilight-classic', false)
    if(Ambilight.isClassic) {
      html.attr('dark', false)
    }
    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }
  }

  show() {
    this.isHidden = false
    this.elem.style.opacity = 1
    Ambilight.setDarkTheme(true)
    html.attr('data-ambilight-enabled', true)
    html.attr('data-ambilight-classic', Ambilight.isClassic)
    if(Ambilight.isClassic) {
      html.attr('dark', true)
    }
  }


  initScrollPosition() {
    this.mastheadElem = Ambilight.isClassic ? $.s('#yt-masthead-container') : $.s('#masthead-container')

    window.on('scroll', () => {
      if (this.changedTopTimeout) {
        clearTimeout(this.changedTopTimeout)
      } else {
        this.checkScrollPosition()
      }

      this.changedTopTimeout = setTimeout(() => {
        this.checkScrollPosition()
        this.changedTopTimeout = undefined
      }, 100)
    })
    this.checkScrollPosition()
  }

  checkScrollPosition() {
    if (!this.immersive)
      body.removeClass('at-top').removeClass('not-at-top')

    if (window.scrollY > 0) {
      this.mastheadElem.class('not-at-top').removeClass('at-top')
      if (this.immersive)
        body.class('not-at-top').removeClass('at-top')
    } else {
      this.mastheadElem.class('at-top').removeClass('not-at-top')
      if (this.immersive)
        body.class('at-top').removeClass('not-at-top')
    }
  }


  initImmersiveMode() {
    if (this.immersive)
      html.attr('data-ambilight-immersive-mode', true)
  
    this.checkScrollPosition()
  }

  toggleImmersiveMode() {
    const enabled = !this.immersive
    html.attr('data-ambilight-immersive-mode', enabled)
    $.s(`#setting-immersive`).attr('aria-checked', enabled ? 'true' : 'false')
    this.setSetting('immersive', enabled)
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
  }


  initSettingsMenu() {
    this.settingsMenuBtn = document.createElement('button')
      .class('ytp-button ytp-ambilight-settings-button')
      .attr('title', 'Ambilight settings')
      .attr('aria-owns', 'ytp-id-190')
      .on('click', this.onSettingsBtnClicked, (listener) => this.onSettingsBtnClickedListener = listener)

    this.settingsMenuBtn.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`

    this.settingsMenuBtnParent = $.s('.ytp-right-controls, .ytp-chrome-controls > *:last-child')
    this.settingsMenuBtn.prependTo(this.settingsMenuBtnParent)


    this.settingsMenuElem = document.createElement('div')
      .class(`ytp-popup ytp-settings-menu ytpa-ambilight-settings-menu ${
        (this.advancedSettings) ? 'ytpa-ambilight-settings-menu--advanced' : ''
      }`)
      .attr('id', 'ytp-id-190')
    this.settingsMenuElem.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <a class="ytpa-feedback-link" rowspan="2" href="${this.feedbackFormLink}" target="_blank">
            <span class="ytpa-feedback-link__text">Give feedback or rate YouTube Ambilight</span>
          </a>
          ${
      this.settings.map(setting => {
        let classes = 'ytp-menuitem'
        if(setting.advanced) classes += ' ytpa-menuitem--advanced'
        if(setting.new) classes += ' ytpa-menuitem--new'
        if(setting.experimental) classes += ' ytpa-menuitem--experimental'

        if (setting.type === 'checkbox') {
          return `
            <div id="setting-${setting.name}" 
            class="${classes}" 
            role="menuitemcheckbox" 
            aria-checked="${setting.value ? 'true' : 'false'}" 
            tabindex="0">
              <div class="ytp-menuitem-label">${setting.label}</div>
              <div class="ytp-menuitem-content">
                <div class="ytp-menuitem-toggle-checkbox"></div>
              </div>
            </div>
          `
        } else if (setting.type === 'list') {
          return `
            <div id="setting-${setting.name}" class="ytp-menuitem-range-wrapper">
              <div class="${classes}" aria-haspopup="false" role="menuitemrange" tabindex="0">
                <div class="ytp-menuitem-label">${setting.label}</div>
                <div id="setting-${setting.name}-value" class="ytp-menuitem-content">${this.getSettingListDisplayText(setting)}</div>
              </div>
              <div 
              class="ytp-menuitem-range ${setting.snapPoints ? 'ytp-menuitem-range--has-snap-points' : ''}" 
              rowspan="2" 
              title="Double click to reset">
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
                  ${setting.snapPoints.map((point, i) => `
                    <option 
                      class="setting-range-datalist__label ${(point < setting.snapPoints[i - 1] + 2) ? 'setting-range-datalist__label--flip' : ''}" 
                      value="${point}" 
                      label="${Math.floor(point)}" 
                      title="Snap to ${point}" 
                      style="margin-left: ${(point + (-setting.min)) * (100 / (setting.max - setting.min))}%">
                      ${Math.floor(point)}
                    </option>
                  `).join('')}
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
                <div class="ytpa-section__label">${setting.label}</div>
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
    this.settingsMenuElem.querySelectorAll('.setting-range-datalist__label').forEach(label => {
      label.on('click', (e) => {
        const value = e.target.value
        const name = e.target.parentNode.id.replace('snap-points-', '')
        const inputElem = document.querySelector(`#setting-${name}-range`)
        inputElem.value = value
        inputElem.dispatchEvent(new Event('change', { bubbles: true }))
      })
    })
    this.settingsMenuElem.querySelectorAll('.ytpa-section').forEach(section => {
      section.on('click', (e) => {
        const name = section.attr('data-name')
        const settingSection = this.settings.find(setting => setting.type == 'section' && setting.name == name)
        if (!settingSection) return
        settingSection.value = !settingSection.value
        this.setSetting(name, settingSection.value)

        if (settingSection.value) {
          section.class('is-collapsed')
        } else {
          section.removeClass('is-collapsed')
        }
      })
    })
    this.settingsMenuElemParent = $.s('.html5-video-player')
    this.settingsMenuElem.prependTo(this.settingsMenuElemParent)
    try {
      this.settingsMenuElem.scrollTop = this.settingsMenuElem.scrollHeight
      this.settingsMenuOnCloseScrollBottom = (!this.settingsMenuElem.scrollTop) 
        ? -1 
        : (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - this.settingsMenuElem.scrollTop
      this.settingsMenuOnCloseScrollHeight = (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight)
    } catch(ex) {
      console.error('YouTube Ambilight | initSettingsMenuScrollInformation', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }

    this.settings.forEach(setting => {
      if (setting.type === 'list') {
        const inputElem = $.s(`#setting-${setting.name}-range`)
        const displayedValue = $.s(`#setting-${setting.name}-value`)
        inputElem.on('change mousemove dblclick touchmove', (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = parseFloat(inputElem.value)
          if (e.type === 'dblclick') {
            value = this.settings.find(s => s.name === setting.name).default
          } else if (inputElem.value === inputElem.attr('data-previous-value')) {
            return
          }
          inputElem.value = value
          inputElem.attr('data-previous-value', value)
          this.setSetting(setting.name, value)
          displayedValue.textContent = this.getSettingListDisplayText({...setting, value})

          if (
            setting.name === 'surroundingContentShadowSize' ||
            setting.name === 'surroundingContentShadowOpacity' ||
            setting.name === 'debandingStrength' ||
            setting.name === 'videoShadowSize' ||
            setting.name === 'videoShadowOpacity' ||
            setting.name === 'videoScale'
          ) {
            this.updateStyles()
          }

          if (
            setting.name === 'spread' || 
            setting.name === 'edge' || 
            setting.name === 'fadeOutEasing'
          ) {
            this.canvassesInvalidated = true
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

          if(setting.name === 'horizontalBarsClipPercentage' && this.detectHorizontalBarSizeEnabled) {
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

          if(
            setting.name === 'frameSync' ||
            setting.name === 'framerateLimit' ||
            setting.name === 'videoOverlaySyncThreshold' ||
            setting.name === 'frameBlendingSmoothness'
          ) {
            return
          }

          this.sizesInvalidated = true
          this.scheduleNextFrame()
        })
      } else if (setting.type === 'checkbox') {
        const inputElem = $.s(`#setting-${setting.name}`)
        inputElem.on('click', () => {
          if (setting.type === 'checkbox') {
            setting.value = !setting.value
          }

          if (setting.name === 'enabled') {
            if (setting.value)
              this.enable()
            else
              this.disable()
          }
          if (setting.name === 'immersive') {
            this.toggleImmersiveMode()
          }
          if (setting.name === 'hideScrollbar') {
            html.attr('data-ambilight-hide-scrollbar', setting.value)
          }
          if (
            setting.name === 'videoOverlayEnabled' ||
            setting.name === 'frameSync' ||
            setting.name === 'frameBlending' ||
            setting.name === 'enableInFullscreen' ||
            setting.name === 'showFPS' ||
            setting.name === 'resetThemeToLightOnDisable' ||
            setting.name === 'horizontalBarsClipPercentageReset' ||
            setting.name === 'detectHorizontalBarSizeEnabled' ||
            setting.name === 'detectColoredHorizontalBarSizeEnabled' ||
            setting.name === 'detectVideoFillScaleEnabled' ||
            setting.name === 'directionTopEnabled' ||
            setting.name === 'directionRightEnabled' ||
            setting.name === 'directionBottomEnabled' ||
            setting.name === 'directionLeftEnabled' ||
            setting.name === 'advancedSettings' ||
            setting.name === 'hideScrollbar'
          ) {
            this.setSetting(setting.name, setting.value)
            $.s(`#setting-${setting.name}`).attr('aria-checked', setting.value)
          }

          if(setting.name === 'detectHorizontalBarSizeEnabled') {
            if(!setting.value) {
              if(!inputElem.dontResetControlledSetting) {
                const horizontalBarsClipPercentageSetting = this.settings.find(setting => setting.name === 'horizontalBarsClipPercentage')
                const horizontalBarsClipPercentageInputElem = $.s(`#setting-${horizontalBarsClipPercentageSetting.name}-range`)
                horizontalBarsClipPercentageInputElem.value = horizontalBarsClipPercentageSetting.default
                horizontalBarsClipPercentageInputElem.dispatchEvent(new Event('change', { bubbles: true }))
                this.setSetting('horizontalBarsClipPercentage', horizontalBarsClipPercentageSetting.default)
              }
            } else {
              if(this.videoElem.paused) {
                this.start()
              }
            }
            if(inputElem.dontResetControlledSetting) {
              delete inputElem.dontResetControlledSetting
            }
            this.updateControlledSettings()
          }

          if(setting.name === 'detectVideoFillScaleEnabled') {
            if(!setting.value) {
              if(!inputElem.dontResetControlledSetting) {
                const videoScaleSetting = this.settings.find(setting => setting.name === 'videoScale')
                const videoScaleInputElem = $.s(`#setting-${videoScaleSetting.name}-range`)
                videoScaleInputElem.value = videoScaleSetting.default
                videoScaleInputElem.dispatchEvent(new Event('change', { bubbles: true }))
                this.setSetting('videoScale', videoScaleSetting.default)
              }
            }
            if(inputElem.dontResetControlledSetting) {
              delete inputElem.dontResetControlledSetting
            }
            this.updateControlledSettings()
          }

          if(setting.name === 'advancedSettings') {
            if(setting.value) {
              this.settingsMenuElem.class('ytpa-ambilight-settings-menu--advanced')
            } else {
              this.settingsMenuElem.removeClass('ytpa-ambilight-settings-menu--advanced')
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

          this.updateSizes()
          this.scheduleNextFrame()
        })
      }
    })

    this.updateControlledSettings()
  }

  updateControlledSettings() {
    if(!this.detectVideoFillScaleEnabled) {
      $.s(`#setting-videoScale-value`)
        .removeClass('is-controlled-by-setting')
        .attr('title', '')
    } else {
      $.s(`#setting-videoScale-value`)
        .class('is-controlled-by-setting')
        .attr('title', 'Controlled by the "Fill video to screen width" setting.\nManually adjusting this setting will turn off "Fill video to screen width"')
    }

    if(!this.detectHorizontalBarSizeEnabled) {
      $.s(`#setting-horizontalBarsClipPercentage-value`)
        .removeClass('is-controlled-by-setting')
        .attr('title', '')
    } else {
      $.s(`#setting-horizontalBarsClipPercentage-value`)
        .class('is-controlled-by-setting')
        .attr('title', 'Controlled by the "Remove black bars" setting.\nManually adjusting this setting will turn off "Remove black bars"')
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
        return 'Perfect (! Experimental)'
    }
    if(setting.name === 'framerateLimit') {
      return (this.framerateLimit == 0) ? 'max fps' : `${setting.value} fps`
    }
    return `${setting.value}%`
  }

  settingsMenuOnCloseScrollBottom = 0
  settingsMenuOnCloseScrollHeight = 0
  onSettingsBtnClicked = () => {
    const isOpen = this.settingsMenuElem.classList.contains('is-visible')
    if (isOpen) return

    this.settingsMenuElem.removeClass('fade-out').class('is-visible')

    if(this.settingsMenuOnCloseScrollBottom !== -1) {
      const percentage = (this.settingsMenuElem.scrollHeight) / this.settingsMenuOnCloseScrollHeight
      this.settingsMenuElem.scrollTop = (
        (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - 
        (this.settingsMenuOnCloseScrollBottom * percentage)
      )
    }

    this.settingsMenuBtn.attr('aria-expanded', true)

    const playerElem = $.s('.html5-video-player')
    if(playerElem) {
      playerElem.classList.add('ytp-ambilight-settings-shown')
    }

    this.settingsMenuBtn.off('click', this.onSettingsBtnClickedListener)
    setTimeout(() => {
      body.on('click', this.onCloseSettings, (listener) => this.onCloseSettingsListener = listener)
    }, 100)
  }

  onCloseSettings = (e) => {
    if (this.settingsMenuElem === e.target || this.settingsMenuElem.contains(e.target))
      return

    this.settingsMenuOnCloseScrollBottom = (!this.settingsMenuElem.scrollTop) 
      ? -1 : 
      (this.settingsMenuElem.scrollHeight - this.settingsMenuElem.offsetHeight) - this.settingsMenuElem.scrollTop
    this.settingsMenuOnCloseScrollHeight = (this.settingsMenuElem.scrollHeight)

    this.settingsMenuElem.on('animationend', this.onSettingsFadeOutEnd, (listener) => this.onSettingsFadeOutEndListener = listener)
    this.settingsMenuElem.class('fade-out')

    this.settingsMenuBtn.attr('aria-expanded', false)

    const playerElem = $.s('.html5-video-player')
    if(playerElem) {
      playerElem.classList.remove('ytp-ambilight-settings-shown')
    }

    body.off('click', this.onCloseSettingsListener)
    setTimeout(() => {
      this.settingsMenuBtn.on('click', this.onSettingsBtnClicked, (listener) => this.onSettingsBtnClickedListener = listener)
    }, 100)
  }

  onSettingsFadeOutEnd = () => {
    this.settingsMenuElem.removeClass('fade-out').removeClass('is-visible')
    this.settingsMenuElem.off('animationend', this.onSettingsFadeOutEndListener)
  }

  setSetting(key, value) {
    this[key] = value

    if (key === 'blur')
      value = Math.round((value - 30) * 10) / 10 // Prevent rounding error
    if (key === 'bloom')
      value = Math.round((value - 7) * 10) / 10 // Prevent rounding error

    if (!this.setSettingTimeout)
      this.setSettingTimeout = {}

    if (this.setSettingTimeout[key])
      clearTimeout(this.setSettingTimeout[key])

    this.setSettingTimeout[key] = setTimeout(() => {
      try {
        localStorage.setItem(`ambilight-${key}`, value)
      } catch (ex) {
        console.warn('YouTube Ambilight | setSetting', ex)
        //AmbilightSentry.captureExceptionWithDetails(ex)
      }
      this.setSettingTimeout[key] = null
    }, 500)
  }

  getSetting(key) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${key}`)
    } catch (ex) {
      console.warn('YouTube Ambilight | getSetting', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
    const setting = this.settings.find(setting => setting.name === key) || {}
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value = (value === 'true')
    } else if (setting.type === 'list') {
      value = parseFloat(value)
      if (key === 'blur')
        value = Math.round((value + 30) * 10) / 10 // Prevent rounding error
      if (key === 'bloom')
        value = Math.round((value + 7) * 10) / 10 // Prevent rounding error
    }

    return value
  }

  removeSetting(key) {
    try {
      localStorage.removeItem(`ambilight-${key}`)
    } catch (ex) {
      console.warn('YouTube Ambilight | removeSetting', ex)
      //AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }
}

const ambilightSetVideoInfo = () => {
  window.currentVideoInfo = {
    mimeType: {
      available: [],
      current: {
        video: undefined,
        audio: undefined
      }
    }
  }
}
const ambilightDetectVideoInfo = () => {
  try {
    const saveStreamingData = () => {
      try {
        if(!ytplayer.config || !ytplayer.config.args || !ytplayer.config.args.player_response) return

        const videoInfo = window.currentVideoInfo
        const streamingData = (JSON.parse(ytplayer.config.args.player_response).streamingData)
        if(streamingData.formats)
          streamingData.formats.forEach(format => {
            if(!videoInfo.mimeType.available.find(mimeType => mimeType === format.mimeType))
            videoInfo.mimeType.available.push(format.mimeType)
          })
        if(streamingData.adaptiveFormats)
          streamingData.adaptiveFormats.forEach(format => {
            if(!videoInfo.mimeType.available.find(mimeType => mimeType === format.mimeType))
            videoInfo.mimeType.available.push(format.mimeType)
          })
      } catch(ex) { 
        console.warn('YouTube Ambilight | ambilightDetectVideoInfo | saveStreamingData:', ex.message)
      }
    };

    var origOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function() {
      this.addEventListener('load', function() {
        try {
          const querystring = new URLSearchParams(this.responseURL.substr(this.responseURL.indexOf('?') + 1))
          const mime = querystring.get('mime')
          if(!mime) return

          const videoInfo = window.currentVideoInfo

          if(mime.indexOf('video') === 0) {
            if(videoInfo.mimeType.current.video !== mime)
            videoInfo.mimeType.current.video = mime
          } else if(mime.indexOf('audio') === 0) {
            if(videoInfo.mimeType.current.audio !== mime)
            videoInfo.mimeType.current.audio = mime
          }
          saveStreamingData()
        } catch (ex) {
          console.warn('YouTube Ambilight | ambilightDetectVideoInfo | load:', ex.message)
          //AmbilightSentry.captureExceptionWithDetails(ex)
        }
      })
      origOpen.apply(this, arguments)
    }

    saveStreamingData()
  } catch (ex) {
    console.warn('YouTube Ambilight | ambilightDetectVideoInfo:', ex.message)
    //AmbilightSentry.captureExceptionWithDetails(ex)
  }
}
ambilightSetVideoInfo()
ambilightDetectVideoInfo()


const resetThemeToLightIfSettingIsTrue = () => {
  const key = 'resetThemeToLightOnDisable'
  try {
    const value = (localStorage.getItem(`ambilight-${key}`) === 'true')
    if (!value) return
  } catch (ex) {
    console.warn('YouTube Ambilight | resetThemeToLightIfSettingIsTrue', ex)
    //AmbilightSentry.captureExceptionWithDetails(ex)
    return
  }

  Ambilight.setDarkTheme(false)
}


const ambilightDetectDetachedVideo = () => {
  const containerElem = $.s('.html5-video-container')
  const ytpAppElem = $.s('ytd-app')

  const observer = new MutationObserver((mutationsList, observer) => {
    if (!ytpAppElem.hasAttribute('is-watch-page')) return

    const videoElem = containerElem.querySelector('video')
    if (!videoElem) return

    const isDetached = ambilight.videoElem !== videoElem
    if (!isDetached) return

    ambilight.initVideoElem(videoElem)
  })

  observer.observe(containerElem, {
    attributes: true,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: false,
    subtree: true
  })
}

const tryInitClassicAmbilight = () => {
  const classicBodyElem = $.s('body[data-spf-name="watch"]')
  const classicVideoElem = $.s('video.html5-main-video')
  if(!classicBodyElem || !classicVideoElem) return false

  Ambilight.isClassic = true
  window.ambilight = new Ambilight(classicVideoElem)
  return true
}
const tryInitAmbilight = () => {
  if (!$.s('ytd-app[is-watch-page]')) return

  const videoElem = $.s('ytd-watch-flexy video')
  if (!videoElem) return false

  const settingsBtnContainerElem = $.s('.ytp-right-controls, .ytp-chrome-controls > *:last-child')
  if(!settingsBtnContainerElem) {
    if(!window.ambilightSettingsBtnContainerElemUndefinedThrown) {
      window.ambilightSettingsBtnContainerElemUndefinedThrown = true
      const ex = new Error('Tried to initialize ambilight without settingsBtnContainerElem')
      console.warn(ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
    return false
  }

  const playerElem = $.s('.html5-video-player')
  if(!playerElem) {
    if(!window.ambilightPlayerElemUndefinedThrown) {
      window.ambilightPlayerElemUndefinedThrown = true
      const ex = new Error('Tried to initialize ambilight without playerElem')
      console.warn(ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
    return false
  }


  window.ambilight = new Ambilight(videoElem)
  ambilightDetectDetachedVideo()
  return true
}

const ambilightDetectPageTransition = () => {
  const observer = new MutationObserver((mutationsList, observer) => {
    if (!window.ambilight) return

    const ytdAppOrBody = mutationsList[0].target
    const isOnVideoPage = !!(
      ytdAppOrBody.getAttribute('data-spf-name') === 'watch' || // body[data-spf-name="watch"]
      ytdAppOrBody.getAttribute('is-watch-page') === '' // ytd-app[is-watch-page]
    )
    if(window.ambilight.isOnVideoPage === isOnVideoPage) return

    window.ambilight.isOnVideoPage = isOnVideoPage
    if (isOnVideoPage) {
      window.ambilight.start()
    } else {
      window.ambilight.hide()
      if (ambilight.resetThemeToLightOnDisable) {
        Ambilight.setDarkTheme(false)
      }
    }
  })
  var appElem = $.s('ytd-app, body[data-spf-name]')
  if(!appElem) return
  observer.observe(appElem, {
    attributes: true,
    attributeFilter: ['is-watch-page', 'data-spf-name']
  })
}

const ambilightDetectVideoPage = () => {
  if (tryInitAmbilight()) return
  if (tryInitClassicAmbilight()) return

  if ($.s('ytd-app:not([is-watch-page])')) {
    resetThemeToLightIfSettingIsTrue()
  }

  const observer = new MutationObserver((mutationsList, observer) => {
    if (window.ambilight) {
      observer.disconnect()
      return
    }

    tryInitAmbilight()
    tryInitClassicAmbilight()
  })
  var appElem = $.s('ytd-app, body[data-spf-name]')
  if(!appElem) return
  observer.observe(appElem, {
    childList: true,
    subtree: true
  })
}

const onLoad = () => {
  safeRequestIdleCallback(() => {
    try {
      if(!window.ambilight) {
        ambilightDetectPageTransition()
        ambilightDetectVideoPage()
      }
    } catch (ex) {
      console.error('YouTube Ambilight | Initialization', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }, { timeout: 5000 })
};

if(document.readyState === 'complete') {
  onLoad();
} else {
  window.addEventListener('load', onLoad);
}