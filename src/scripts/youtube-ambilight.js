import { $, body, waitForDomElement, raf, ctxOptions } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'

class Ambilight {
  constructor(videoPlayer) {
    this.showDisplayFrameRate = true
    this.showVideoFrameRate = true

    this.horizontalBarsClipPX = 0

    this.setFeedbackLink()

    this.playerOffset = {}
    this.srcVideoOffset = {}

    this.isHidden = true
    this.isOnVideoPage = true
    this.showedHighQualityCompareWarning = false

    this.p = null
    this.a = null
    this.isFullscreen = false
    this.isFillingFullscreen = false
    this.isVR = false

    this.videoFrameCount = 0
    this.skippedFrames = 0
    this.displayFrameRate = 0
    this.videoFrameRate = 0
    this.videoFrameRateMeasureStartTime = 0
    this.videoFrameRateMeasureStartFrame = 0
    this.ambilightFrameCount = 0
    this.ambilightFrameRate = 0
    this.previousFrameTime = 0
    this.syncInfo = []

    this.masthead = $.s('#masthead-container')

    this.settings = [
      {
        type: 'section',
        label: 'Ambilight',
        name: 'sectionAmbilightCollapsed',
        default: false
      },
      {
        name: 'blur',
        label: '<span style="display: inline-block; padding: 5px 0">Blur<br/><span class="ytap-menuitem-description">(More GPU memory)</span></span>',
        type: 'list',
        default: 50,
        min: 0,
        max: 100
      },
      {
        name: 'spread',
        label: '<span style="display: inline-block; padding: 5px 0">Spread<br/><span class="ytap-menuitem-description">(More GPU usage)</span></span>',
        type: 'list',
        default: 20,
        min: 0,
        max: 200,
        step: .1
      },
      {
        name: 'edge',
        label: '<span style="display: inline-block; padding: 5px 0">Edge size<br/><span class="ytap-menuitem-description">(Lower GPU usage. Tip: Turn blur down)</span></span>',
        type: 'list',
        default: 20,
        min: 2,
        max: 50,
        step: .1
      },
      {
        name: 'bloom',
        label: 'Fade out start',
        type: 'list',
        default: 15,
        min: -50,
        max: 100,
        step: .1
      },
      {
        name: 'fadeOutEasing',
        label: '<span style="display: inline-block; padding: 5px 0">Fade out curve<br/><span class="ytap-menuitem-description">(Tip: Turn blur all the way down)</span></span>',
        type: 'list',
        default: 60,
        min: 1,
        max: 100,
        step: 1
      },
      {
        type: 'section',
        label: 'Ambilight image adjustment',
        name: 'sectionAmbilightImageAdjustmentCollapsed',
        default: false
      },
      // {
      //   name: 'sepia',
      //   label: 'Sepia',
      //   type: 'list',
      //   value: this.sepia,
      //   min: 0,
      //   max: 100
      // },
      {
        name: 'brightness',
        label: 'Brightness',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        name: 'contrast',
        label: 'Contrast',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        name: 'saturation',
        label: 'Saturation',
        type: 'list',
        default: 100,
        min: 0,
        max: 200
      },
      {
        type: 'section',
        label: 'Video resizing',
        name: 'sectionVideoResizingCollapsed',
        default: false
      },
      {
        new: true,
        name: 'detectHorizontalBarSizeEnabled',
        label: 'Auto-detect black bars',
        type: 'checkbox',
        default: false
      },
      {
        new: true,
        name: 'detectColoredHorizontalBarSizeEnabled',
        label: 'Also auto-detect colored bars',
        type: 'checkbox',
        default: false
      },
      {
        new: true,
        name: 'horizontalBarsClipPercentage',
        label: 'Remove horizontal black bars',
        type: 'list',
        default: 0,
        min: 0,
        max: 49,
        step: 0.1,
        snapPoints: [8.7, 12.3, 13.5]
      },
      {
        name: 'horizontalBarsClipPercentageReset',
        label: 'Reset black bars next video',
        type: 'checkbox',
        default: false
      },
      {
        name: 'videoScale',
        label: 'Scale',
        type: 'list',
        default: 100,
        min: 25,
        max: 100,
        step: 0.1
      },
      {
        type: 'section',
        label: 'Directions',
        name: 'sectionDirectionsCollapsed',
        default: false
      },
      {
        new: true,
        name: 'directionTopEnabled',
        label: 'Top',
        type: 'checkbox',
        default: true
      },
      {
        new: true,
        name: 'directionRightEnabled',
        label: 'Right',
        type: 'checkbox',
        default: true
      },
      {
        new: true,
        name: 'directionBottomEnabled',
        label: 'Bottom',
        type: 'checkbox',
        default: true
      },
      {
        new: true,
        name: 'directionLeftEnabled',
        label: 'Left',
        type: 'checkbox',
        default: true
      },
      {
        type: 'section',
        label: 'Other page content',
        name: 'sectionOtherPageContentCollapsed',
        default: false
      },
      {
        new: true,
        name: 'surroundingContentShadowSize',
        label: 'Shadow size',
        type: 'list',
        default: 16,
        min: 0,
        max: 100
      },
      {
        new: true,
        name: 'surroundingContentShadowOpacity',
        label: 'Shadow opacity',
        type: 'list',
        default: 67,
        min: 0,
        max: 100
      },
      {
        name: 'immersive',
        label: 'Hide (immersive mode) [Z]',
        type: 'checkbox',
        default: false
      },
      {
        type: 'section',
        label: 'Ambilight quality & performance',
        name: 'sectionAmbilightQualityPerformanceCollapsed',
        default: false
      },
      {
        new: true,
        name: 'debandingStrength',
        label: 'Debanding (dithering) <a title="More information about Dithering" href="https://www.lifewire.com/what-is-dithering-4686105" target="_blank" style="padding: 0 5px;">?</a>',
        type: 'list',
        default: 0,
        min: 0,
        max: 100
      },
      {
        name: 'highQuality',
        label: '<span style="display: inline-block; padding: 5px 0">Prevent frame drops <a title="Compares a small part of each video frame with the previous frame instead of relying on the webkitDecodedFrames value. Since this value can sometimes lag behind the visible video frames on high refreshrate monitors." href="#" onclick="return false" style="padding: 0 5px;">?</a><br/><span class="ytap-menuitem-description">(More CPU usage)</span></span>',
        type: 'checkbox',
        default: false
      },
      {
        experimental: true,
        name: 'videoOverlayEnabled',
        label: '<span style="display: inline-block; padding: 5px 0">Sync video exactly <a title="Delays the video frames according to the ambilight frametimes. This makes sure that that the ambilight is never out of sync with the video, but it can introduce stuttering and/or skipped frames. \"Prevent frame drops\" is auto-enabled to minimize this issue." href="#" onclick="return false" style="padding: 0 5px;">?</a><br/><span class="ytap-menuitem-description">(Stuttering video? Try "Prevent frame drops")</span></span>',
        type: 'checkbox',
        default: false
      },
      {
        experimental: true,
        name: 'videoOverlaySyncThreshold',
        label: '<span style="display: inline-block; padding: 5px 0">Sync video: auto-disable threshold<br/><span class="ytap-menuitem-description">(Auto-disable when dropping % of frames)</span></span>',
        type: 'list',
        default: 5,
        min: 1,
        max: 100,
        step: 1
      },
      {
        experimental: true,
        name: 'frameBlending',
        label: '<span style="display: inline-block; padding: 5px 0">Smooth motion (frame blending) <a title="More information about Frame blending" href="https://nl.linkedin.com/learning/premiere-pro-guru-speed-changes/frame-sampling-vs-frame-blending" target="_blank" style="padding: 0 5px;">?</a><br/><span class="ytap-menuitem-description">(More GPU usage. Works also for "Sync video")</span></span>',
        type: 'checkbox',
        default: false
      },
      {
        experimental: true,
        name: 'frameBlendingSmoothness',
        label: 'Smooth motion strength',
        type: 'list',
        default: 80,
        min: 0,
        max: 100,
        step: 1
      },
      {
        type: 'section',
        label: 'General',
        name: 'sectionGeneralCollapsed',
        default: false
      },
      {
        new: true,
        name: 'showFPS',
        label: 'Show framerate',
        type: 'checkbox',
        default: false
      },
      {
        new: true,
        name: 'resetThemeToLightOnDisable',
        label: 'Dark theme on video page only',
        type: 'checkbox',
        default: false
      },
      {
        name: 'enableInFullscreen',
        label: '<span style="display: inline-block; padding: 5px 0">Enable in fullscreen<br/><span class="ytap-menuitem-description">(When in fullscreen mode)</span></span>',
        type: 'checkbox',
        default: true
      },
      {
        name: 'enabled',
        label: 'Enabled [A]',
        type: 'checkbox',
        default: true
      }
    ]


    //Sections
    this.sectionAmbilightCollapsed = this.getSetting('sectionAmbilightCollapsed')
    this.sectionAmbilightImageAdjustmentCollapsed = this.getSetting('sectionAmbilightImageAdjustmentCollapsed')
    this.sectionVideoResizingCollapsed = this.getSetting('sectionVideoResizingCollapsed')
    this.sectionOtherPageContentCollapsed = this.getSetting('sectionOtherPageContentCollapsed')
    this.sectionAmbilightQualityPerformanceCollapsed = this.getSetting('sectionAmbilightQualityPerformanceCollapsed')
    this.sectionGeneralCollapsed = this.getSetting('sectionGeneralCollapsed')

    //Settings
    this.enabled = this.getSetting('enabled')
    $.s('html').attr('data-ambilight-enabled', this.enabled)
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
    // this.sepia = this.getSetting('sepia')
    // if(this.sepia === null) this.sepia = 0

    this.videoScale = this.getSetting('videoScale')
    this.detectHorizontalBarSizeEnabled = this.getSetting('detectHorizontalBarSizeEnabled')
    this.detectColoredHorizontalBarSizeEnabled = this.getSetting('detectColoredHorizontalBarSizeEnabled')
    this.horizontalBarsClipPercentage = this.getSetting('horizontalBarsClipPercentage')
    this.horizontalBarsClipPercentageReset = this.getSetting('horizontalBarsClipPercentageReset')

    this.directionTopEnabled = this.getSetting('directionTopEnabled')
    this.directionRightEnabled = this.getSetting('directionRightEnabled')
    this.directionBottomEnabled = this.getSetting('directionBottomEnabled')
    this.directionLeftEnabled = this.getSetting('directionLeftEnabled')

    this.highQuality = this.getSetting('highQuality')
    this.frameBlending = this.getSetting('frameBlending')
    this.frameBlendingSmoothness = this.getSetting('frameBlendingSmoothness')
    this.immersive = this.getSetting('immersive')
    this.enableInFullscreen = this.getSetting('enableInFullscreen')
    this.resetThemeToLightOnDisable = this.getSetting('resetThemeToLightOnDisable')
    this.showFPS = this.getSetting('showFPS')

    this.surroundingContentShadowSize = this.getSetting('surroundingContentShadowSize')
    this.surroundingContentShadowOpacity = this.getSetting('surroundingContentShadowOpacity')
    this.debandingStrength = this.getSetting('debandingStrength')

    this.settings.forEach(setting => {
      setting.value = this[setting.name]
    })

    this.style = document.createElement('style')
    this.style.appendChild(document.createTextNode(''))
    document.head.appendChild(this.style)
    this.updateStyles()

    this.setupVideoPlayer(videoPlayer)

    this.allContainer = document.createElement("div")
    this.allContainer.class('ambilight')
    body.prepend(this.allContainer)

    this.ambilightContainer = document.createElement("div")
    this.ambilightContainer.class('ambilight__container')
    this.allContainer.prepend(this.ambilightContainer)

    this.clipContainer = document.createElement("div")
    this.clipContainer.class('ambilight__clip-container')
    this.ambilightContainer.prepend(this.clipContainer)

    this.playerContainer = document.createElement("div")
    this.playerContainer.class('ambilight__player-container')
    this.clipContainer.prepend(this.playerContainer)

    this.canvasList = document.createElement("div")
    this.canvasList.class('ambilight__canvas-list')
    this.playerContainer.prepend(this.canvasList)

    const compareBufferElem = document.createElement("canvas")
    this.compareBuffer = {
      elem: compareBufferElem,
      ctx: compareBufferElem.getContext('2d', ctxOptions)
    }

    const drawBuffer2Elem = document.createElement("canvas")
    this.drawBuffer2 = {
      elem: drawBuffer2Elem,
      ctx: drawBuffer2Elem.getContext('2d', ctxOptions)
    }

    const drawBufferElem = document.createElement("canvas")
    this.drawBuffer = {
      elem: drawBufferElem,
      ctx: drawBufferElem.getContext('2d', ctxOptions)
    }

    const bufferElem = document.createElement("canvas")
    this.buffer = {
      elem: bufferElem,
      ctx: bufferElem.getContext('2d', ctxOptions)
    }

    const shadowElem = document.createElement('canvas')
    shadowElem.class('ambilight__shadow')
    shadowElem.width = 1920
    shadowElem.height = 1080
    this.playerContainer.appendChild(shadowElem)
    const shadowCtx = shadowElem.getContext('2d', ctxOptions)
    this.shadow = {
      elem: shadowElem,
      ctx: shadowCtx
    }

    this.recreateCanvasses()
    this.initFPSContainer()

    window.addEventListener('resize', () => {
      if (!this.isOnVideoPage) return
      this.checkVideoSize()
      setTimeout(() =>
        raf(() =>
          setTimeout(() => this.checkVideoSize(), 200)
        ),
        200)
    })

    document.addEventListener('keydown', (e) => {
      if (!this.isOnVideoPage) return
      if (document.activeElement) {
        const el = document.activeElement
        const tag = el.tagName
        const inputs = ['INPUT', 'SELECT', 'TEXTAREA']
        if (inputs.indexOf(tag) !== -1 || el.getAttribute('contenteditable') === 'true')
          return
      }
      if (e.keyCode === 70 || e.keyCode === 84)
        setTimeout(() => this.checkVideoSize(), 0)
      if (e.keyCode === 90) // z
        this.toggleImmersiveMode()
      if (e.keyCode === 65) // a
        this.toggleEnabled()
    })

    this.initSettings()
    this.initScrollPosition()
    this.initImmersiveMode()

    setTimeout(() => {
      if (this.enabled)
        this.enable(true)
    }, 0)
  }

  initFPSContainer() {
    if (!this.showDisplayFrameRate && !this.showVideoFrameRate) return
    if (this.videoSyncedContainer && this.videoSyncedContainer.isConnected) return

    this.FPSContainer = document.createElement("div")
    this.FPSContainer.class('ambilight__fps-container')

    this.videoSyncedContainer = document.createElement("div")
    this.videoSyncedContainer.class('ambilight__video-synced')
    this.FPSContainer.prepend(this.videoSyncedContainer)

    this.displayFPSContainer = document.createElement("div")
    this.displayFPSContainer.class('ambilight__display-fps')
    this.FPSContainer.prepend(this.displayFPSContainer)

    this.ambilightFPSContainer = document.createElement("div")
    this.ambilightFPSContainer.class('ambilight__ambilight-fps')
    this.FPSContainer.prepend(this.ambilightFPSContainer)

    this.skippedFramesContainer = document.createElement("div")
    this.skippedFramesContainer.class('ambilight__skipped-frames')
    this.FPSContainer.prepend(this.skippedFramesContainer)

    this.videoFPSContainer = document.createElement("div")
    this.videoFPSContainer.class('ambilight__video-fps')
    this.FPSContainer.prepend(this.videoFPSContainer)

    $.s('#player-container').prepend(this.FPSContainer)
  }

  initVideoOverlay() {
    const videoOverlayElem = document.createElement('canvas')
    videoOverlayElem.class('ambilight__video-overlay')
    this.videoOverlay = {
      elem: videoOverlayElem,
      ctx: videoOverlayElem.getContext('2d', ctxOptions),
      isHiddenChangeTimestamp: 0
    }
  }

  initFrameBlending() {
    //this.previousBuffer
    const previousBufferElem = document.createElement("canvas")
    this.previousBuffer = {
      elem: previousBufferElem,
      ctx: previousBufferElem.getContext('2d', ctxOptions)
    }

    //this.playerBuffer
    const playerBufferElem = document.createElement("canvas")
    this.playerBuffer = {
      elem: playerBufferElem,
      ctx: playerBufferElem.getContext('2d', ctxOptions)
    }
  }

  initVideoOverlayWithFrameBlending() {
    //this.videoOverlayBuffer
    const videoOverlayBufferElem = document.createElement("canvas")
    this.videoOverlayBuffer = {
      elem: videoOverlayBufferElem,
      ctx: videoOverlayBufferElem.getContext('2d', ctxOptions)
    }

    //this.previousVideoOverlayBuffer
    const previousVideoOverlayBufferElem = document.createElement("canvas")
    this.previousVideoOverlayBuffer = {
      elem: previousVideoOverlayBufferElem,
      ctx: previousVideoOverlayBufferElem.getContext('2d', ctxOptions)
    }
  }

  setupVideoPlayer(videoPlayer) {
    this.videoPlayer = videoPlayer

    $.sa('.ytp-size-button, .ytp-miniplayer-button').forEach(btn =>
      btn.on('click', () => raf(() =>
        setTimeout(() => this.scheduleNextFrame(), 0)
      ))
    )

    this.videoPlayer.on('playing', () => {
      this.start()
      this.resetHorizontalBarsIfNeeded()
    })
      .on('seeked', () => {
        this.resetVideoFrameCounter()
        this.scheduleNextFrame()
      })
      .on('ended', () => {
        this.resetHorizontalBarsIfNeeded()
        this.clear()
      })
      .on('emptied', () => {
        this.resetHorizontalBarsIfNeeded()
        this.clear()
      })
  }

  resetHorizontalBarsIfNeeded() {
    const videoPath = location.search
    if (!this.prevVideoPath || videoPath !== this.prevVideoPath) {
      if (this.horizontalBarsClipPercentageReset) {
        this.setHorizontalBars(0)
      }
    }
    this.prevVideoPath = videoPath
  }

  setHorizontalBars(percentage) {
    this.horizontalBarsClipPercentage = percentage
    this.sizesInvalidated = true
    this.canvassesInvalidated = true
    setTimeout(() => {
      this.setSetting('horizontalBarsClipPercentage', percentage)
      $.s('#setting-horizontalBarsClipPercentage').value = percentage
      $.s(`#setting-horizontalBarsClipPercentage-value`).innerHTML = `${percentage}%`
    }, 1)
  }

  setFeedbackLink() {
    const version = $.s('html').getAttribute('data-ambilight-version') || ''
    const os = $.s('html').getAttribute('data-ambilight-os') || ''
    this.feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}`
  }

  recreateCanvasses() {
    const spreadLevels = Math.max(2, Math.round((this.spread / this.edge)) + this.innerStrength + 1)

    if (!this.players) {
      this.players = []
    }

    this.players = this.players.filter((player, i) => {
      if (i >= spreadLevels) {
        player.elem.remove()
        return false
      }
      return true
    })

    for (let i = this.players.length; i < spreadLevels; i++) {
      const canvas = $.create('canvas')
      canvas.class('ambilight__canvas')

      const ctx = canvas.getContext('2d', ctxOptions)
      this.canvasList.prepend(canvas)

      this.players.push({
        elem: canvas,
        ctx: ctx
      })
    }
  }

  resetVideoFrameCounter() {
    this.videoFrameCount = 0
  }

  clear() {
    this.players.forEach((player) => {
      player.ctx.fillStyle = '#000'
      player.ctx.fillRect(0, 0, player.elem.width, player.elem.height)
    })
  }

  updateSizes() {
    try {
      this.isVR = !!$.s('.ytp-webgl-spherical')
      this.isFullscreen = !!$.s('.ytp-fullscreen')
      const noClipOrScale = (this.horizontalBarsClipPercentage == 0 && this.videoScale == 100)
      this.isFillingFullscreen = (
        this.isFullscreen &&
        Math.abs(this.playerOffset.width - window.innerWidth) < 10 &&
        Math.abs(this.playerOffset.height - window.innerHeight) < 10 &&
        noClipOrScale
      )

      if (this.isFullscreen) {
        if (this.enableInFullscreen) {
          body.removeClass('ambilight-disable-in-fullscreen')
        } else {
          body.class('ambilight-disable-in-fullscreen')
        }
      }

      const videoPlayerContainer = this.videoPlayer.parentNode
      const html5VideoPlayer = $.s('.html5-video-player')

      const notVisible = (
        !this.enabled ||
        this.isVR ||
        !videoPlayerContainer ||
        !html5VideoPlayer ||
        html5VideoPlayer.classList.contains('ytp-player-minimized') ||
        (this.isFullscreen && !this.enableInFullscreen)
      )
      if (notVisible || noClipOrScale) {
        this.videoPlayer.style.marginTop = ''
        if (videoPlayerContainer) {
          videoPlayerContainer.style.setProperty('transform', ``)
          videoPlayerContainer.style.overflow = ''
          videoPlayerContainer.style.marginTop = ''
          videoPlayerContainer.style.height = ''
        }
      }
      if (notVisible) {
        this.hide()
        return true
      }

      const horizontalBarsClip = this.horizontalBarsClipPercentage / 100
      if (!noClipOrScale) {
        this.horizontalBarsClipPX = Math.round(horizontalBarsClip * this.videoPlayer.offsetHeight)
        const top = Math.max(0, parseInt(this.videoPlayer.style.top))
        this.videoPlayer.style.marginTop = `${-this.horizontalBarsClipPX - top}px`
        videoPlayerContainer.style.marginTop = `${this.horizontalBarsClipPX + top}px`
        videoPlayerContainer.style.height = `${this.videoPlayer.offsetHeight * (1 - (horizontalBarsClip * 2))}px`
        videoPlayerContainer.style.setProperty('transform', `scale(${(this.videoScale / 100)})`)
        videoPlayerContainer.style.overflow = 'hidden'
      }

      this.playerOffset = this.videoPlayer.offset()
      if (
        this.playerOffset.top === undefined ||
        !this.playerOffset.width ||
        !this.playerOffset.height ||
        !this.videoPlayer.videoWidth ||
        !this.videoPlayer.videoHeight
      ) return false //Not ready

      this.srcVideoOffset = {
        top: this.playerOffset.top + window.scrollY,
        width: this.videoPlayer.videoWidth,
        height: this.videoPlayer.videoHeight
      }

      const minSize = 512
      const scaleX = Math.min(this.srcVideoOffset.width / minSize, 4)
      const scaleY = Math.min(this.srcVideoOffset.height / minSize, 4)
      const scale = Math.min(scaleX, scaleY)
      // A size of more than 256 is required to enable GPU acceleration in Chrome
      if (scale < 1) {
        this.p = {
          w: minSize,
          h: minSize
        }
      } else {
        this.p = {
          w: Math.round(this.srcVideoOffset.width / scale),
          h: Math.round((this.srcVideoOffset.height * (1 - (horizontalBarsClip * 2))) / scale)
        }
      }

      this.horizontalBarsScaledClipPX = Math.round(horizontalBarsClip * this.playerOffset.height)
      this.playerContainer.style.left = (this.playerOffset.left + window.scrollX) + 'px'
      this.playerContainer.style.top = (this.playerOffset.top + window.scrollY - 1 + this.horizontalBarsScaledClipPX) + 'px'
      this.playerContainer.style.width = this.playerOffset.width + 'px'
      this.playerContainer.style.height = (this.playerOffset.height - (this.horizontalBarsScaledClipPX * 2)) + 'px'

      this.ambilightContainer.style.webkitFilter = `
        blur(${this.playerOffset.height * (this.blur * .0025)}px)
        ${(this.contrast !== 100) ? `contrast(${this.contrast}%)` : ''}
        ${(this.brightness !== 100) ? `brightness(${this.brightness}%)` : ''}
        ${(this.saturation !== 100) ? `saturate(${this.saturation}%)` : ''}
      `
      // this.allContainer.style.webkitFilter = `
      //   ${(this.contrast !== 100) ? `contrast(${this.contrast}%)` : ''}
      //   ${(this.brightness !== 100) ? `brightness(${(parseInt(this.brightness) + 3)}%)` : ''}
      //   ${(this.saturation !== 100) ? `saturate(${this.saturation}%)` : ''}
      //   ${/*(this.sepia !== 0) ? `sepia(${this.sepia}%)` : ''*/ ''}
      // `

      this.players.forEach((player) => {
        if (player.elem.width !== this.p.w)
          player.elem.width = this.p.w
        if (player.elem.height !== this.p.h)
          player.elem.height = this.p.h
        player.ctx = player.elem.getContext('2d', ctxOptions)
      })

      this.buffer.elem.width = this.p.w
      this.buffer.elem.height = this.p.h
      this.buffer.ctx = this.buffer.elem.getContext('2d', ctxOptions)
      //this.buffer.ctx.globalAlpha = .5

      if (this.frameBlending && !this.previousBuffer) {
        this.initFrameBlending()
      }
      if (this.videoOverlayEnabled && !this.videoOverlay) {
        this.initVideoOverlay()
      }
      if (this.videoOverlayEnabled && this.frameBlending && !this.previousVideoOverlayBuffer) {
        this.initVideoOverlayWithFrameBlending()
      }

      if (this.frameBlending) {
        this.previousBuffer.elem.width = this.p.w
        this.previousBuffer.elem.height = this.p.h
        this.previousBuffer.ctx = this.previousBuffer.elem.getContext('2d', ctxOptions)

        this.playerBuffer.elem.width = this.p.w
        this.playerBuffer.elem.height = this.p.h
        this.playerBuffer.ctx = this.playerBuffer.elem.getContext('2d', ctxOptions)
      }

      if (this.videoOverlayEnabled && !this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.appendTo($.s('.html5-video-container'))
      } else if (!this.videoOverlayEnabled && this.videoOverlay && this.videoOverlay.elem.parentNode) {
        this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
      }
      if (this.videoOverlayEnabled) {
        this.videoOverlay.elem.setAttribute('style', this.videoPlayer.getAttribute('style'))
        this.videoOverlay.elem.width = this.srcVideoOffset.width
        this.videoOverlay.elem.height = this.srcVideoOffset.height
        this.videoOverlay.ctx = this.videoOverlay.elem.getContext('2d', ctxOptions)

        if (this.frameBlending) {
          this.videoOverlayBuffer.elem.width = this.srcVideoOffset.width
          this.videoOverlayBuffer.elem.height = this.srcVideoOffset.height
          this.videoOverlayBuffer.ctx = this.videoOverlayBuffer.elem.getContext('2d', ctxOptions)

          this.previousVideoOverlayBuffer.elem.width = this.srcVideoOffset.width
          this.previousVideoOverlayBuffer.elem.height = this.srcVideoOffset.height
          this.previousVideoOverlayBuffer.ctx = this.previousVideoOverlayBuffer.elem.getContext('2d', ctxOptions)
        }
      }

      this.compareBuffer.elem.width = this.srcVideoOffset.width
      this.compareBuffer.elem.height = this.srcVideoOffset.height
      this.compareBuffer.ctx = this.compareBuffer.elem.getContext('2d', ctxOptions)

      this.drawBuffer2.elem.width = this.srcVideoOffset.width
      this.drawBuffer2.elem.height = this.srcVideoOffset.height
      this.drawBuffer2.ctx = this.drawBuffer2.elem.getContext('2d', ctxOptions)

      this.drawBuffer.elem.width = this.srcVideoOffset.width
      this.drawBuffer.elem.height = this.srcVideoOffset.height
      this.drawBuffer.ctx = this.drawBuffer.elem.getContext('2d', ctxOptions)
      this.drawBufferBarsClipPx = Math.round(this.drawBuffer.elem.height * horizontalBarsClip)


      this.resizeCanvasses()

      this.resetVideoFrameCounter()
      this.initFPSContainer()

      this.sizesInvalidated = false
      return true
    } catch (ex) {
      console.error('YouTube Ambilight | Resize | UpdateSizes:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
      throw ex
    }
  }

  updateStyles() {
    const shadowSize = this.surroundingContentShadowSize / 5
    const shadowOpacity = this.surroundingContentShadowOpacity / 100
    const baseurl = $.s('html').getAttribute('data-ambilight-baseurl') || ''
    const debandingStrength = parseInt(this.debandingStrength)

    this.style.childNodes[0].data = `
      html[data-ambilight-enabled="true"] ytd-app[is-watch-page] #top > #container > *,
      html[data-ambilight-enabled="true"]  ytd-app[is-watch-page] #primary-inner > *:not(#player),
      html[data-ambilight-enabled="true"]  ytd-app[is-watch-page] #secondary {
        ${shadowSize ? `filter: drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity})) drop-shadow(0 0 ${shadowSize}px rgba(0,0,0,${shadowOpacity})) !important;` : ''}
      }

      ${debandingStrength ? `
        .ambilight::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          left: 0;
          top: 0;
          background: url('${baseurl}images/noise-${(debandingStrength > 75) ? 3 : (debandingStrength > 50) ? 2 : 1}.png');
          opacity: ${debandingStrength / ((debandingStrength > 75) ? 100 : (debandingStrength > 50) ? 75 : 50)};
        }
      ` : ''}
    `
  }

  resizeCanvasses() {
    const playerSize = {
      w: this.playerOffset.width,
      h: this.playerOffset.height - (this.horizontalBarsScaledClipPX * 2)
    }
    const ratio = (playerSize.w > playerSize.h) ?
      {
        x: 1,
        y: (playerSize.w / playerSize.h)
      } : {
        x: (playerSize.h / playerSize.w),
        y: 1
      }
    const lastScale = {
      x: 1,
      y: 1
    }

    const scaleStep = this.edge / 100

    this.players.forEach((player, i) => {
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
      player.elem.style.transform = `scale(${scaleX}, ${scaleY})`
    })

    this.shadow.elem.style.transform = `scale(${lastScale.x + 0.01}, ${lastScale.y + 0.01})`
    this.shadow.ctx.clearRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)

    //Shadow gradient 
    const drawGradient = (size, edge, keyframes, fadeOutFrom, darkest, horizontal) => {
      const points = [
        0,
        ...keyframes.map(e => Math.max(0, edge - (edge * e.p) - (edge * fadeOutFrom * (1 - e.p)))),
        edge - (edge * fadeOutFrom),
        edge + size + (edge * fadeOutFrom),
        ...keyframes.reverse().map(e => Math.min(edge + size + edge, edge + size + (edge * e.p) + (edge * fadeOutFrom * (1 - e.p)))),
        edge + size + edge
      ]

      const pointMax = (points[points.length - 1])
      const gradient = this.shadow.ctx.createLinearGradient(
        0,
        0,
        horizontal ? this.shadow.elem.width : 0,
        !horizontal ? this.shadow.elem.height : 0
      )

      gradient.addColorStop(Math.min(1, points[0] / pointMax), `rgba(0,0,0,${darkest})`)
      keyframes.forEach((e, i) => {
        gradient.addColorStop(Math.min(1, points[0 + keyframes.length - i] / pointMax), `rgba(0,0,0,${e.o})`)
      })
      gradient.addColorStop(Math.min(1, points[1 + keyframes.length] / pointMax), `rgba(0,0,0,0)`)
      gradient.addColorStop(Math.min(1, points[2 + keyframes.length] / pointMax), `rgba(0,0,0,0)`)
      keyframes.reverse().forEach((e, i) => {
        gradient.addColorStop(Math.min(1, points[2 + (keyframes.length * 2) - i] / pointMax), `rgba(0,0,0,${e.o})`)
      })
      gradient.addColorStop(Math.min(1, points[3 + (keyframes.length * 2)] / pointMax), `rgba(0,0,0,${darkest})`)

      this.shadow.ctx.fillStyle = gradient
      this.shadow.ctx.fillRect(0, 0, this.shadow.elem.width, this.shadow.elem.height)
    }

    const edge = {
      w: ((playerSize.w * lastScale.x) - playerSize.w) / 2 / lastScale.x,
      h: ((playerSize.h * lastScale.y) - playerSize.h) / 2 / lastScale.y
    }
    const video = {
      w: (playerSize.w / lastScale.x),
      h: (playerSize.h / lastScale.y)
    }

    const plotKeyframes = (length, powerOf, darkest) => {
      const keyframes = []
      for (let i = 1; i < length; i++) {
        keyframes.push({
          p: (i / length),
          o: Math.pow(i / length, powerOf) * darkest
        })
      }
      return keyframes
    }
    const darkest = 1
    const easing = (16 / (this.fadeOutEasing * .64))
    const keyframes = plotKeyframes(64, easing, darkest)

    const fadeOutFrom = this.bloom / 100
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

  checkVideoSize() {
    if (this.canvassesInvalidated) {
      this.canvassesInvalidated = false
      this.recreateCanvasses()
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
    if (this.srcVideoOffset.width !== this.videoPlayer.videoWidth
      || this.srcVideoOffset.height !== this.videoPlayer.videoHeight) {
      return this.updateSizes()
    }

    if (this.videoOverlayEnabled && this.videoPlayer.getAttribute('style') !== this.videoOverlay.elem.getAttribute('style')) {
      return this.updateSizes()
    }

    const playerContainerRect = this.playerContainer.getBoundingClientRect()
    const videoPlayerRec = this.videoPlayer.getBoundingClientRect()
    if (
      playerContainerRect.width !== videoPlayerRec.width ||
      playerContainerRect.x !== videoPlayerRec.x
    ) {
      return this.updateSizes()
    }

    return true
  }

  nextFrame = () => {
    if (!this.scheduled) return
    this.scheduled = false

    try {
      if (!this.checkVideoSize()) {
        this.videoFrameCount = 0
        return
      } else if (!this.p) {
        //If was detected hidden by checkVideoSize => updateSizes this.p won't be initialized yet
        return
      }

      this.drawAmbilight()

      setTimeout(() => {
        this.detectVideoFrameRate()
        this.detectDisplayFrameRate()
        this.detectAmbilightFrameRate()
        this.detectVideoSynced()
      }, 1)


      if (this.videoPlayer.paused) {
        return
      }

      this.scheduleNextFrame()
    } catch (ex) {
      console.error('YouTube Ambilight | NextFrame:', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
  }

  scheduleNextFrame() {
    if (this.scheduled || !this.enabled || !this.isOnVideoPage) {
      return
    }

    this.scheduled = true
    raf(this.nextFrame)
  }

  isNewFrame(oldLines, newLines) {
    if (!oldLines || oldLines.length !== newLines.length) {
      oldLines = null
      newLines = null
      return true
    }

    for (let i = 0; i < oldLines.length; i++) {
      for (let xi = 0; xi < oldLines[i].length; xi++) {
        if (oldLines[i][xi] !== newLines[i][xi]) {
          oldLines = null
          newLines = null
          i = null
          xi = null
          return true
        }
      }
    }

    oldLines = null
    newLines = null
    return false
  }

  hideFPS() {
    this.videoFPSContainer.innerHTML = ''
    this.displayFPSContainer.innerHTML = ''
    this.ambilightFPSContainer.innerHTML = ''
    this.skippedFramesContainer.innerHTML = ''
    this.videoSyncedContainer.innerHTML = ''
  }

  detectVideoSynced() {
    if (!this.showFPS || !this.videoOverlay) return
    if (this.videoSyncedContainer.innerHTML) {
      if (!this.videoOverlayEnabled) {
        this.videoSyncedContainer.innerHTML = ''
        return
      }
      if (this.videoOverlay.isHidden !== undefined && this.videoOverlay.isHidden === this.detectVideoSyncedWasHidden)
        return
    }
    if (!this.videoOverlayEnabled) return

    this.videoSyncedContainer.innerHTML = this.videoOverlayEnabled ? `VIDEO SYNCED: ${this.videoOverlay.isHidden ? 'NO' : 'YES'}` : ''
    this.videoSyncedContainer.style.color = this.videoOverlay.isHidden ? '#f33' : '#7f7'
    this.detectVideoSyncedWasHidden = this.videoOverlay.isHidden
  }

  detectVideoFrameRate() {
    if (this.videoFrameRateStartTime === undefined) {
      this.videoFrameRateStartTime = 0
      this.videoFrameRateStartFrame = 0
    }

    const frameCount = this.getVideoFrameCount()
    if (this.videoFrameCount !== frameCount) {
      const videoFrameRateFrame = frameCount
      const videoFrameRateTime = performance.now()
      if (this.videoFrameRateStartTime + 2000 < videoFrameRateTime) {
        if (this.videoFrameRateStartFrame !== 0) {
          this.videoFrameRate = (videoFrameRateFrame - this.videoFrameRateStartFrame) / ((videoFrameRateTime - this.videoFrameRateStartTime) / 1000)
          if (this.showFPS) {
            const frameRateText = (Math.round(Math.min(this.displayFrameRate || this.videoFrameRate, Math.max(0, this.videoFrameRate)) * 100) / 100).toFixed(2)
            this.videoFPSContainer.innerHTML = `VIDEO: ${frameRateText}`
          } else if (this.videoFPSContainer.innerHTML !== '') {
            this.videoFPSContainer.innerHTML = ''
          }
        }
        this.videoFrameRateStartFrame = videoFrameRateFrame
        this.videoFrameRateStartTime = videoFrameRateTime
      }
    }
  }

  detectDisplayFrameRate() {
    const displayFrameRateTime = performance.now()
    if (this.displayFrameRateStartTime < displayFrameRateTime - 2000) {
      this.displayFrameRate = this.displayFrameRateFrame / ((displayFrameRateTime - this.displayFrameRateStartTime) / 1000)
      if (this.showFPS) {
        const frameRateText = (Math.round(Math.max(0, this.displayFrameRate) * 100) / 100).toFixed(2)
        this.displayFPSContainer.innerHTML = `DISPLAY: ${frameRateText}`
        this.displayFPSContainer.style.color = (this.displayFrameRate < this.videoFrameRate) ? '#f33' : (this.displayFrameRate < this.videoFrameRate + 5) ? '#ff0' : '#7f7'
      } else if (this.displayFPSContainer.innerHTML !== '') {
        this.displayFPSContainer.innerHTML = ''
      }
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
      this.ambilightFrameRateStartFrame = 0
    }

    const frameCount = this.ambilightFrameCount
    const ambilightFrameRateFrame = frameCount
    const ambilightFrameRateTime = performance.now()
    if (this.ambilightFrameRateStartTime + 2000 < ambilightFrameRateTime) {
      if (this.ambilightFrameRateStartFrame !== 0) {
        this.ambilightFrameRate = (ambilightFrameRateFrame - this.ambilightFrameRateStartFrame) / ((ambilightFrameRateTime - this.ambilightFrameRateStartTime) / 1000)
        if (this.showFPS) {
          const frameRateText = (Math.round(Math.min(this.displayFrameRate || this.ambilightFrameRate, Math.max(0, this.ambilightFrameRate)) * 100) / 100).toFixed(2)
          this.ambilightFPSContainer.innerHTML = `AMBILIGHT: ${frameRateText}`
          this.ambilightFPSContainer.style.color = (this.ambilightFrameRate < this.videoFrameRate - 0.5) ? '#f33' : '#7f7'

          this.skippedFramesContainer.innerHTML = `DROPPED FRAMES: ${this.skippedFrames}`
          this.skippedFramesContainer.style.color = (this.skippedFrames > 0) ? '#f33' : '#7f7'
        } else if (this.ambilightFPSContainer.innerHTML !== '') {
          this.ambilightFPSContainer.innerHTML = ''
          this.skippedFramesContainer.innerHTML = ''
        }
      }
      this.ambilightFrameRateStartFrame = ambilightFrameRateFrame
      this.ambilightFrameRateStartTime = ambilightFrameRateTime
    }
  }

  getVideoFrameCount() {
    if (!this.videoPlayer) return 0;
    return this.videoPlayer.mozPaintedFrames || // Firefox
      (this.videoPlayer.webkitDecodedFrameCount + this.videoPlayer.webkitDroppedFrameCount) // Chrome
  }

  drawAmbilight() {
    if (!this.enabled) return

    if (
      this.isVR ||
      this.isFillingFullscreen ||
      (!this.enableInFullscreen && this.isFullscreen)
    ) {
      this.hide()
      return
    }

    if (this.isHidden) {
      this.show()
    }

    //performance.mark('start-drawing')

    let newVideoFrameCount = this.getVideoFrameCount()
    this.compareBuffer.ctx.drawImage(this.videoPlayer, 0, 0, this.compareBuffer.elem.width, this.compareBuffer.elem.height)
    let compareBufferHasNewFrame = (this.videoFrameCount < newVideoFrameCount)
    let skippedFrames = (this.videoFrameCount > 120 && this.videoFrameCount < newVideoFrameCount - 1)

    if (this.highQuality) {
      if (!this.videoFrameRate || !this.displayFrameRate || this.videoFrameRate < this.displayFrameRate) {
        //performance.mark('comparing-compare-start')
        let lines = []
        let partSize = Math.ceil(this.compareBuffer.elem.height / 3)

        try {
          for (let i = partSize; i < this.compareBuffer.elem.height; i += partSize) {
            lines.push(this.compareBuffer.ctx.getImageData(0, i, this.compareBuffer.elem.width, 1).data)
          }
        } catch (ex) {
          if (!this.showedHighQualityCompareWarning) {
            console.warn('Failed to retrieve video data. ', ex)
            AmbilightSentry.captureExceptionWithDetails(ex)
            this.showedHighQualityCompareWarning = true
          }
        }

        if (!compareBufferHasNewFrame) {
          const isConfirmedNewFrame = this.isNewFrame(this.oldLines, lines)
          if (isConfirmedNewFrame) {
            newVideoFrameCount++
            compareBufferHasNewFrame = true
          }
        }
        //performance.mark('comparing-compare-end')

        if (compareBufferHasNewFrame) {
          this.oldLines = lines
        }

        //performance.measure('comparing-compare', 'comparing-compare-start', 'comparing-compare-end')
      }
    }

    if (compareBufferHasNewFrame) {
      if(this.detectHorizontalBarSizeEnabled) {
        const lines = []
        let partSize = Math.ceil(this.compareBuffer.elem.width / 6)
        for (let i = partSize; i < this.compareBuffer.elem.width; i += partSize) {
          lines.push(this.compareBuffer.ctx.getImageData(i, 0, 1, this.compareBuffer.elem.height).data)
        }
        this.detectHorizontalBarSize(lines)
      }

      this.drawBuffer2.ctx.drawImage(this.compareBuffer.elem, 0, 0, this.drawBuffer.elem.width, this.drawBuffer.elem.height)
      this.drawBuffer2HasNewFrame = true
    }

    let drawBufferHasNewFrame = false
    if (this.drawBuffer2HasNewFrame) {
      this.drawBuffer.ctx.drawImage(this.drawBuffer2.elem, 0, 0, this.drawBuffer.elem.width, this.drawBuffer.elem.height)
      this.drawBuffer2HasNewFrame = false
      drawBufferHasNewFrame = true
    }



    if (skippedFrames) {
      //console.warn('SKIPPED <--')
      this.skippedFrames += newVideoFrameCount - (this.videoFrameCount + 1)
    }

    if (newVideoFrameCount > this.videoFrameCount) {
      this.videoFrameCount = newVideoFrameCount
    }

    //console.log(this.videoPlayer.currentTime, this.videoPlayer.getCurrentTime(), this.videoPlayer.webkitDecodedFrameCount, this.videoPlayer.webkitDroppedFrameCount, this.videoPlayer.webkitVideoDecodedByteCount, this.videoPlayer.webkitAudioDecodedByteCount)
    if (this.frameBlending && !this.videoPlayer.paused) {
      const drawTime = performance.now()
      if (drawBufferHasNewFrame) {
        this.previousFrameTime = this.previousDrawTime

        if (this.videoOverlayEnabled) {
          this.previousVideoOverlayBuffer.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
          this.videoOverlayBuffer.ctx.drawImage(this.drawBuffer.elem, 0, 0)
        }
        this.previousBuffer.ctx.drawImage(this.buffer.elem, 0, 0)
        this.buffer.ctx.drawImage(this.drawBuffer.elem,
          0,
          this.drawBufferBarsClipPx,
          this.drawBuffer.elem.width,
          this.drawBuffer.elem.height - (this.drawBufferBarsClipPx * 2),
          0, 0, this.p.w, this.p.h)

        this.ambilightFrameCount++
      }
      const frameDuration = (drawTime - this.previousFrameTime)
      const alpha = (this.ambilightFrameRate < this.videoFrameRate * 1.33) ? 1 : Math.min(1, (frameDuration) / (1000 / (this.videoFrameRate / (this.frameBlendingSmoothness / 100) || 1)))
      if (this.videoOverlayEnabled) {
        this.videoOverlay.ctx.globalAlpha = 1
        this.videoOverlay.ctx.drawImage(this.previousVideoOverlayBuffer.elem, 0, 0)
        this.videoOverlay.ctx.globalAlpha = alpha
        this.videoOverlay.ctx.drawImage(this.videoOverlayBuffer.elem, 0, 0)
        this.videoOverlay.ctx.globalAlpha = 1

        this.checkIfNeedToHideVideoOverlay()
      }

      this.playerBuffer.ctx.globalAlpha = 1
      this.playerBuffer.ctx.drawImage(this.previousBuffer.elem, 0, 0)
      this.playerBuffer.ctx.globalAlpha = alpha
      this.playerBuffer.ctx.drawImage(this.buffer.elem, 0, 0)
      this.playerBuffer.ctx.globalAlpha = 1
      this.players.forEach((player) => {
        player.ctx.drawImage(this.playerBuffer.elem, 0, 0)
      })
      this.previousDrawTime = drawTime
    } else {
      if (!drawBufferHasNewFrame) return

      if (this.videoOverlayEnabled) {
        this.videoOverlay.ctx.drawImage(this.drawBuffer.elem, 0, 0)
        this.checkIfNeedToHideVideoOverlay()
      }

      this.buffer.ctx.drawImage(this.drawBuffer.elem,
        0,
        this.drawBufferBarsClipPx,
        this.drawBuffer.elem.width,
        this.drawBuffer.elem.height - (this.drawBufferBarsClipPx * 2), 0, 0, this.p.w, this.p.h)

      this.players.forEach((player) => {
        player.ctx.drawImage(this.buffer.elem, 0, 0)
      })

      this.ambilightFrameCount++
    }
  }

  detectHorizontalBarSize(imageVLines) {
    let sizes = []
    const colorIndex = (4* 4)
    let color = this.detectColoredHorizontalBarSizeEnabled ?
      [imageVLines[0][colorIndex], imageVLines[0][colorIndex + 1], imageVLines[0][colorIndex + 2]] :
      [2,2,2]
    const maxColorDeviation = 8
    
    for(const line of imageVLines) {
      for (let i = 0; i < line.length; i += 4) {
        if(
          Math.abs(line[i] - color[0]) <= maxColorDeviation && 
          Math.abs(line[i+1] - color[1]) <= maxColorDeviation && 
          Math.abs(line[i+2] - color[2]) <= maxColorDeviation
        ) continue;
        const size = i ? (i / 4) : 0
        sizes.push(size)
        break;
      }
      for (let i = line.length - 1; i >= 0; i -= 4) {
        if(
          Math.abs(line[i-3] - color[0]) <= maxColorDeviation && 
          Math.abs(line[i-2] - color[1]) <= maxColorDeviation && 
          Math.abs(line[i-1] - color[2]) <= maxColorDeviation
        ) continue;
        const j = (line.length - 1) - i;
        const size = j ? (j / 4) : 0
        sizes.push(size)
        break;
      }
    }

    if(!sizes.length) {
      return
    }

    const averageSize = (sizes.reduce((a, b) => a + b, 0) / sizes.length)
    sizes = sizes.sort((a, b) => {
      const aGap = Math.abs(averageSize - a)
      const bGap = Math.abs(averageSize - b)
      return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
    }).splice(0, 6)
    const maxDeviation = Math.abs(Math.min(...sizes) - Math.max(...sizes))
    const height = (imageVLines[0].length / 4)
    const allowed = height * 0.005
    const valid = (maxDeviation <= allowed)
    
    let size = 0;
    if(!valid) {
      let lowestSize = Math.min(...sizes)
      let lowestPercentage = Math.round((lowestSize / height) * 10000) / 100
      if(lowestPercentage >= this.horizontalBarsClipPercentage) {
        return
      }

      size = lowestSize
    } else {
      size = Math.max(...sizes)// (sizes.reduce((a, b) => a + b, 0) / sizes.length)
    }

    
    const correction = height * 0.001
    const threshold = height * 0.02
    size = (size > threshold) ? size + correction : 0
    
    let percentage = Math.round((size / height) * 10000) / 100
    percentage = Math.min(percentage, 49) === 49 ? 0 : percentage

    if(Math.abs(this.horizontalBarsClipPercentage - percentage) < 1 && this.horizontalBarsClipPercentage > percentage) {
      return
    }

    this.setHorizontalBars(percentage)
  }

  checkIfNeedToHideVideoOverlay() {
    var ambilightFramesAdded = this.ambilightFrameCount - this.prevAmbilightFrameCountForShouldHideDetection
    var videoFramesAdded = this.videoFrameCount - this.prevVideoFrameCountForShouldHideDetection
    var canChange = (performance.now() - this.videoOverlay.isHiddenChangeTimestamp) > 2000
    var outSyncCount = this.syncInfo.filter(value => !value).length
    var outSyncMaxFrames = this.syncInfo.length * (this.videoOverlaySyncThreshold / 100)
    if (outSyncCount > outSyncMaxFrames) {
      if (!this.videoOverlay.isHidden) {
        this.videoOverlay.elem.class('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = true
        this.videoOverlay.isHiddenChangeTimestamp = performance.now()
      }
    } else if (outSyncCount == 0 && canChange) {
      if (this.videoOverlay.isHidden) {
        this.videoOverlay.elem.removeClass('ambilight__video-overlay--hide')
        this.videoOverlay.isHidden = false
        this.videoOverlay.isHiddenChangeTimestamp = performance.now()
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
    $.s(`#setting-enabled`).attr('aria-checked', true)

    $.s('html').attr('data-ambilight-enabled', true)

    if (!initial) {
      const toLight = !$.s('html').attr('dark')
      this.resetThemeToLightOnDisable = toLight
      this.setSetting('resetThemeToLightOnDisable', toLight)
      $.s(`#setting-resetThemeToLightOnDisable`).attr('aria-checked', toLight)
    }

    this.resetHorizontalBarsIfNeeded()
    this.checkVideoSize()
    this.start()
  }

  disable() {
    if (!this.enabled) return

    this.setSetting('enabled', false)
    $.s(`#setting-enabled`).attr('aria-checked', false)
    $.s('html').attr('data-ambilight-enabled', false)

    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }

    this.videoPlayer.style.marginTop = ''
    const videoPlayerContainer = this.videoPlayer.parentNode
    videoPlayerContainer.style.overflow = ''
    videoPlayerContainer.style.marginTop = ''
    videoPlayerContainer.style.height = ''

    this.checkVideoSize()
    this.hide()
  }

  static setDarkTheme(value) {
    try {
      if (Ambilight.setDarkThemeBusy) return
      if ($.s('html').attr('dark')) {
        if (value) return
      } else {
        if (!value) return
      }
      if (value && !$.s('ytd-app').hasAttribute('is-watch-page')) return
      Ambilight.setDarkThemeBusy = true

      const toggle = (renderer) => {
        renderer = renderer || $.s('ytd-toggle-theme-compact-link-renderer')
        if (value) {
          renderer.handleSignalActionToggleDarkThemeOn()
        } else {
          renderer.handleSignalActionToggleDarkThemeOff()
        }
        Ambilight.setDarkThemeBusy = false
      }

      const renderer = $.s('ytd-toggle-theme-compact-link-renderer')
      if (renderer) {
        toggle(renderer)
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
                const renderer = $.s('ytd-toggle-theme-compact-link-renderer')
                return (renderer && renderer.handleSignalActionToggleDarkThemeOn)
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
    this.showedHighQualityCompareWarning = false

    if (!$.s('html').attr('dark')) {
      Ambilight.setDarkTheme(true)
    }

    this.scheduleNextFrame()
  }


  hide() {
    if (this.isHidden) return
    this.isHidden = true
    this.ambilightContainer.style.opacity = 0.0000001; //Avoid memory leak https://codepen.io/wesselkroos/pen/MWWorLW
    if (this.videoOverlay && this.videoOverlay.elem.parentNode) {
      this.videoOverlay.elem.parentNode.removeChild(this.videoOverlay.elem)
    }
    setTimeout(() => {
      this.clear()
      this.hideFPS()
    }, 500)
    if (this.resetThemeToLightOnDisable) {
      this.resetThemeToLightOnDisable = undefined
      Ambilight.setDarkTheme(false)
    }
  }

  show() {
    this.isHidden = false
    this.ambilightContainer.style.opacity = 1
    Ambilight.setDarkTheme(true)
  }


  initScrollPosition() {
    window.on('scroll', () => {
      if (this.changedTopTimeout)
        clearTimeout(this.changedTopTimeout)

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
      this.masthead.class('not-at-top').removeClass('at-top')
      if (this.immersive)
        body.class('not-at-top').removeClass('at-top')
    } else {
      this.masthead.class('at-top').removeClass('not-at-top')
      if (this.immersive)
        body.class('at-top').removeClass('not-at-top')
    }
  }


  initImmersiveMode() {
    if (this.immersive)
      body.class('immersive-mode')
    this.checkScrollPosition()
  }

  toggleImmersiveMode() {
    body.classList.toggle('immersive-mode')
    const enabled = body.classList.contains('immersive-mode')
    $.s(`#setting-immersive`).attr('aria-checked', enabled ? 'true' : 'false')
    this.setSetting('immersive', enabled)
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
  }


  initSettings() {
    const button = $.create('button')
      .class('ytp-button ytp-ambilight-settings-button')
      .attr('title', 'Ambilight settings')
      .attr('aria-owns', 'ytp-id-190')
      .on('click', () => this.openSettingsPopup())

    button.innerHTML = `<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .09,-0.51 l -1.6,-2.76 c -0.09,-0.17 -0.31,-0.24 -0.48,-0.17 l -1.99,.8 c -0.41,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.48,.17 l -1.6,2.76 c -0.10,.17 -0.05,.39 .09,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.09,.51 l 1.6,2.76 c .09,.17 .31,.24 .48,.17 l 1.99,-0.8 c .41,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .48,-0.17 l 1.6,-2.76 c .09,-0.17 .05,-0.39 -0.09,-0.51 l -1.68,-1.32 0,0 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 l 0,0 z" fill="#fff"></path>
    </svg>`
    button.prependTo($.s('.ytp-right-controls'))


    this.settingsMenu = $.create('div')
      .class('ytp-popup ytp-settings-menu ytp-ambilight-settings-menu')
      .attr('id', 'ytp-id-190')
    this.settingsMenu.innerHTML = `
      <div class="ytp-panel">
        <div class="ytp-panel-menu" role="menu">
          <a class="ytpa-feedback-link" rowspan="2" href="${this.feedbackFormLink}" target="_blank">
            <span class="ytpa-feedback-link__text">Give feedback or rate YouTube Ambilight</span>
          </a>
          ${
      this.settings.map(setting => {
        if (setting.type === 'checkbox') {
          return `
                  <div id="setting-${setting.name}" 
                  class="ytp-menuitem${setting.new ? ' ytap-menuitem--new' : ''}${setting.experimental ? ' ytap-menuitem--experimental' : ''}" 
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
                  <div class="ytp-menuitem${setting.new ? ' ytap-menuitem--new' : ''}${setting.experimental ? ' ytap-menuitem--experimental' : ''}" aria-haspopup="false" role="menuitemrange" tabindex="0">
                    <div class="ytp-menuitem-label">${setting.label}</div>
                    <div id="setting-${setting.name}-value" class="ytp-menuitem-content">${setting.value}%</div>
                  </div>
                  <div 
                  class="ytp-menuitem-range ${setting.snapPoints ? 'ytp-menuitem-range--has-snap-points' : ''}" 
                  rowspan="2" 
                  title="Double click to reset">
                    <input id="setting-${setting.name}" type="range" min="${setting.min}" max="${setting.max}" colspan="2" value="${setting.value}" step="${setting.step || 1}" />
                  </div>
                  ${!setting.snapPoints ? '' : `
                    <datalist class="setting-range-datalist" id="snap-points-${setting.name}">
                      ${setting.snapPoints.map((point, i) => `
                        <option 
                          class="setting-range-datalist__label ${(point < setting.snapPoints[i - 1] + 2) ? 'setting-range-datalist__label--flip' : ''}" 
                          value="${point}" 
                          label="${Math.floor(point)}" 
                          title="Snap to ${point}" 
                          style="left: ${(point + (-setting.min)) * (100 / (setting.max - setting.min))}%">
                      `)}
                    </datalist>
                  `}
                `
        } else if (setting.type === 'section') {
          return `
                  <div class="ytap-section${setting.value ? ' is-collapsed' : ''}" data-name="${setting.name}">
                    <div class="ytap-section__cell">
                      <div class="ytap-section__label">${setting.label}</div>
                    </div>
                    <div class="ytap-section__cell">
                      <div class="ytap-section__fill">-</div>
                    </div>
                  </div>
                `
        }
      }).join('')
      }
        </div>
      </div>`
    this.settingsMenu.querySelectorAll('.setting-range-datalist__label').forEach(label => {
      label.on('click', (e) => {
        const value = e.target.value
        const name = e.target.parentNode.id.replace('snap-points-', '')
        const input = document.querySelector(`#setting-${name}`)
        input.value = value
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })
    })
    this.settingsMenu.querySelectorAll('.ytap-section').forEach(section => {
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
    this.settingsMenu.prependTo($.s('.html5-video-player'))

    this.settings.forEach(setting => {
      const input = $.s(`#setting-${setting.name}`)
      if (setting.type === 'list') {
        const displayedValue = $.s(`#setting-${setting.name}-value`)
        input.on('change mousemove dblclick', (e) => {
          if(e.type === 'mousemove' && e.buttons === 0) return

          let value = input.value
          if (e.type === 'dblclick') {
            value = this.settings.find(s => s.name === setting.name).default
          } else if (input.value === input.attr('data-previous-value')) {
            return
          }
          input.value = value
          input.attr('data-previous-value', value)
          displayedValue.innerHTML = `${value}%`
          this.setSetting(setting.name, value)

          if (
            setting.name === 'surroundingContentShadowSize' ||
            setting.name === 'surroundingContentShadowOpacity' ||
            setting.name === 'debandingStrength'
          ) {
            this[setting.name] = value
            this.updateStyles()
            return
          }
          if (
            setting.name === 'spread' || 
            setting.name === 'edge' || 
            setting.name === 'fadeOutEasing'
          ) {
            this.canvassesInvalidated = true
          }
          if(setting.name === 'horizontalBarsClipPercentage' && this.detectHorizontalBarSizeEnabled) {
            $.s(`#setting-detectHorizontalBarSizeEnabled`).click()
          }

          this.sizesInvalidated = true
          this.scheduleNextFrame()
        })
      } else if (setting.type === 'checkbox') {
        input.on('click', () => {
          if (setting.type === 'checkbox') {
            setting.value = !setting.value
          }

          if (setting.name === 'immersive') {
            this.toggleImmersiveMode()
          }
          if (setting.name === 'enabled') {
            if (setting.value)
              this.enable()
            else
              this.disable()
          }
          if (
            setting.name === 'highQuality' ||
            setting.name === 'videoOverlayEnabled' ||
            setting.name === 'frameBlending' ||
            setting.name === 'enableInFullscreen' ||
            setting.name === 'showFPS' ||
            setting.name === 'resetThemeToLightOnDisable' ||
            setting.name === 'horizontalBarsClipPercentageReset' ||
            setting.name === 'detectHorizontalBarSizeEnabled' ||
            setting.name === 'detectColoredHorizontalBarSizeEnabled' ||
            setting.name === 'directionTopEnabled' ||
            setting.name === 'directionRightEnabled' ||
            setting.name === 'directionBottomEnabled' ||
            setting.name === 'directionLeftEnabled'
          ) {
            this[setting.name] = setting.value
            this.setSetting(setting.name, setting.value)
            $.s(`#setting-${setting.name}`).attr('aria-checked', setting.value)
          }

          if (setting.name === 'videoOverlayEnabled' && setting.value && !this.highQuality) {
            $.s(`#setting-highQuality`).click()
          }

          if (setting.name === 'showFPS' && !setting.value) {
            this.hideFPS()
          }

          this.updateSizes()
        })
      }
    })
  }

  openSettingsPopup() {
    const isOpen = this.settingsMenu.classList.contains('is-visible')
    if (isOpen) return

    this.settingsMenu.class('is-visible')
    $.s('.ytp-ambilight-settings-button').attr('aria-expanded', true)

    this.closeSettingsListener = (e) => {
      if (this.settingsMenu === e.target || this.settingsMenu.contains(e.target))
        return

      setTimeout(() => {
        this.settingsMenu.removeClass('is-visible')
        $.s('.ytp-ambilight-settings-button').attr('aria-expanded', false)
      }, 1)
      body.off('mouseup', this.closeSettingsListener)
    }
    body.on('mouseup', this.closeSettingsListener)
  }

  setSetting(key, value) {
    this[key] = value

    if (key === 'blur')
      value -= 30
    if (key === 'bloom')
      value -= 7

    if (!this.setSettingTimeout)
      this.setSettingTimeout = {}

    if (this.setSettingTimeout[key])
      clearTimeout(this.setSettingTimeout[key])

    this.setSettingTimeout[key] = setTimeout(() => {
      try {
        localStorage.setItem(`ambilight-${key}`, value)
      } catch (ex) {
        console.error('YouTube Ambilight | setSetting', ex)
        AmbilightSentry.captureExceptionWithDetails(ex)
      }
      this.setSettingTimeout[key] = null
    }, 500)
  }

  getSetting(key) {
    let value = null
    try {
      value = localStorage.getItem(`ambilight-${key}`)
    } catch (ex) {
      console.error('YouTube Ambilight | getSetting', ex)
      AmbilightSentry.captureExceptionWithDetails(ex)
    }
    const setting = this.settings.find(setting => setting.name === key)
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox' || setting.type === 'section') {
      value = (value === 'true')
    } else {
      if (key === 'blur')
        value = parseInt(value) + 30
      if (key === 'bloom')
        value = parseInt(value) + 7
    }

    return value
  }
}
Ambilight.setDarkThemeBusy = false

const resetThemeToLightIfSettingIsTrue = () => {
  const key = 'resetThemeToLightOnDisable'
  try {
    const value = (localStorage.getItem(`ambilight-${key}`) === 'true')
    if (!value) return
  } catch (ex) {
    console.error('YouTube Ambilight | resetThemeToLightIfSettingIsTrue', ex)
    AmbilightSentry.captureExceptionWithDetails(ex)
    return
  }

  Ambilight.setDarkTheme(false)
}

const ambilightDetectDetachedVideo = () => {
  const container = $.s('.html5-video-container')
  const ytpApp = $.s('ytd-app')

  const observer = new MutationObserver((mutationsList, observer) => {
    if (!ytpApp.hasAttribute('is-watch-page')) return

    const videoPlayer = container.querySelector('video')
    if (!videoPlayer) return

    const isDetached = ambilight.videoPlayer !== videoPlayer
    if (!isDetached) return

    //console.log('Detected detached video.\nOld:\n', ambilight.videoPlayer, '\nNew:\n', videoPlayer)
    ambilight.setupVideoPlayer(videoPlayer)
  })

  observer.observe(container, {
    attributes: true,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: false,
    subtree: true
  })
}

const tryInitAmbilight = (ytpApp) => {
  if (!ytpApp.hasAttribute('is-watch-page')) return

  const videoPlayer = $.s("ytd-watch-flexy video")
  if (!videoPlayer) return false

  window.ambilight = new Ambilight(videoPlayer)
  ambilightDetectDetachedVideo()
  return true
}

const ambilightDetectPageTransition = (ytpApp) => {
  const observer = new MutationObserver((mutationsList, observer) => {
    if (!window.ambilight) return

    if (ytpApp.hasAttribute('is-watch-page')) {
      window.ambilight.isOnVideoPage = true
      window.ambilight.start()
    } else {
      window.ambilight.isOnVideoPage = false
      if (ambilight.resetThemeToLightOnDisable) {
        Ambilight.setDarkTheme(false)
      }
    }
  })
  observer.observe(ytpApp, {
    attributes: true,
    attributeFilter: ['is-watch-page']
  })
}

const ambilightDetectVideoPage = (ytpApp) => {
  if (tryInitAmbilight(ytpApp)) return

  if (!ytpApp.hasAttribute('is-watch-page')) {
    resetThemeToLightIfSettingIsTrue()
  }

  const observer = new MutationObserver((mutationsList, observer) => {
    if (window.ambilight) {
      observer.disconnect()
      return
    }

    tryInitAmbilight(ytpApp)
  })
  observer.observe(ytpApp, {
    childList: true,
    subtree: true
  })
}

try {
  const ytpApp = $.s('ytd-app')
  if (ytpApp) {
    ambilightDetectPageTransition(ytpApp)
    ambilightDetectVideoPage(ytpApp)
  }
} catch (ex) {
  console.error('YouTube Ambilight | Initialization', ex)
  AmbilightSentry.captureExceptionWithDetails(ex)
}