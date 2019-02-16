//// Generic

$ = {
  create: (tag) => { return document.createElement(tag) },
  s: (selector) => { return document.querySelector(selector) },
  sa: (selector) => { return document.querySelectorAll(selector) },
  param: (name, url) => {
    url = url ? url : window.location.href
    name = name.replace(/[\[\]]/g, "\\$&")
    const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)")
    const results = regex.exec(url)
    if (!results) return null
    if (!results[2]) return ''
    return decodeURIComponent(results[2].replace(/\+/g, " "))
  }
}

HTMLElement.prototype.attr = function (name, value) {
  if (typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
HTMLElement.prototype.append = function (elem) {
  if (typeof elem === 'string')
    elem = document.createTextNode(elem)
  this.appendChild(elem)
  return this
}
HTMLElement.prototype.appendTo = function (elem) {
  elem.append(this)
  return this
}
HTMLElement.prototype.prependChild = HTMLElement.prototype.prepend
HTMLElement.prototype.prepend = function (elem) {
  this.prependChild(elem)
  return this
}
HTMLElement.prototype.prependTo = function (elem) {
  elem.prepend(this)
  return this
}
HTMLElement.prototype.class = function (className) {
  const existingClasses = this.className.split(' ')
  if (existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function (className) {
  const classList = this.className.split(' ')
  const pos = classList.indexOf(className)
  if (pos !== -1) {
    classList.splice(pos, 1)
    this.className = classList.join(' ')
  }
  return this
}
HTMLElement.prototype.text = function (text) {
  this.innerText = text
  return this
}
addEventListenerPrototype = function (eventNames, callback) {
  var list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.addEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype

removeEventListenerPrototype = function (eventNames, callback) {
  var list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.removeEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.off = removeEventListenerPrototype
Window.prototype.off = removeEventListenerPrototype

HTMLElement.prototype.offset = function () {
  return this.getBoundingClientRect()
}

function flatten(arrays, TypedArray) {
  var arr = new TypedArray(arrays.reduce((n, a) => n + a.length, 0));
  var i = 0;
  arrays.forEach(a => { arr.set(a, i); i += a.length; });
  return arr;
}

body = document.body

raf = (webkitRequestAnimationFrame || requestAnimationFrame)

//// Ambilight

class Ambilight {
  constructor(videoPlayer) {
    this.showDisplayFrameRate = false
    this.showVideoFrameRate = false

    this.setFeedbackLink()

    this.playerOffset = {}
    this.srcVideoOffset = {}

    this.isHidden = true
    this.isOnVideoPage = true
    this.showedHighQualityCompareWarning = false

    this.p = null;
    this.a = null;
    this.isFullscreen = false
    this.isFillingFullscreen = false
    this.isVR = false

    this.videoFrameCount = 0
    this.skippedFrames = 0
    this.videoFrameRate = 0
    this.videoFrameRateMeasureStartTime = 0
    this.videoFrameRateMeasureStartFrame = 0


    this.settings = [
      {
        name: 'spread',
        label: '<span style="display: inline-block; padding: 5px 0">Spread<br/><span style="line-height: 12px; font-size: 10px;">(More GPU usage)</span></span>',
        type: 'list',
        default: 20,
        min: 0,
        max: 200,
        step: .1
      },
      {
        name: 'blur',
        label: '<span style="display: inline-block; padding: 5px 0">Blur<br/><span style="line-height: 12px; font-size: 10px;">(More GPU memory)</span></span>',
        type: 'list',
        default: 50,
        min: 0,
        max: 100
      },
      {
        name: 'bloom',
        label: 'Fade out start',
        type: 'list',
        default: 15,
        min: -50,
        max: 100
      },
      {
        name: 'fadeOutEasing',
        label: '<span style="display: inline-block; padding: 5px 0">Fade out curve<br/><span style="line-height: 12px; font-size: 10px;">(Tip: Turn blur all the way down)</span></span>',
        type: 'list',
        default: 60,
        min: 1,
        max: 100,
        step: 1
      },
      {
        name: 'edge',
        label: '<span style="display: inline-block; padding: 5px 0">Edge size<br/><span style="line-height: 12px; font-size: 10px;">(Lower GPU usage. Tip: Turn blur down)</span></span>',
        type: 'list',
        default: 20,
        min: 2,
        max: 50,
        step: .1
      },
      {
        name: 'highQuality',
        label: '<span style="display: inline-block; padding: 5px 0">High Precision<br/><span style="line-height: 12px; font-size: 10px;">(More CPU usage)</span></span>',
        type: 'checkbox',
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
        name: 'videoScale',
        label: 'Video scale',
        type: 'list',
        default: 100,
        min: 25,
        max: 100,
        step: 0.1
      },
      {
        name: 'enabled',
        label: 'Enabled (A)',
        type: 'checkbox',
        default: false
      },
      {
        name: 'enableInFullscreen',
        label: '<span style="display: inline-block; padding: 5px 0">Enable in fullscreen<br/><span style="line-height: 12px; font-size: 10px;">(When in fullscreen mode)</span></span>',
        type: 'checkbox',
        default: true
      },
      {
        name: 'immersive',
        label: 'Immersive (Z)',
        type: 'checkbox',
        default: false
      },
    ]

    this.enabled = this.getSetting('enabled')
    this.spread = this.getSetting('spread')
    this.blur = this.getSetting('blur')
    this.bloom = this.getSetting('bloom')
    this.fadeOutEasing = this.getSetting('fadeOutEasing')
    this.edge = this.getSetting('edge')
    this.innerStrength = 2

    this.contrast = this.getSetting('contrast')
    this.brightness = this.getSetting('brightness')
    this.saturation = this.getSetting('saturation')
    // this.sepia = this.getSetting('sepia')
    // if(this.sepia === null) this.sepia = 0

    this.videoScale = this.getSetting('videoScale')

    this.highQuality = this.getSetting('highQuality', true)
    this.immersive = this.getSetting('immersive', true)
    this.enableInFullscreen = this.getSetting('enableInFullscreen', true)


    this.settings.forEach(setting => {
      setting.value = this[setting.name]
    })

    this.videoPlayer = videoPlayer

    this.allContainer = document.createElement("div")
    this.allContainer.class('ambilight')
    body.prepend(this.allContainer)

    this.ambilightContainer = document.createElement("div")
    this.ambilightContainer.class('ambilight__container')
    this.allContainer.prepend(this.ambilightContainer)

    this.canvasList = document.createElement("div")
    this.canvasList.class('ambilight__canvas-list')
    this.ambilightContainer.prepend(this.canvasList)

    const bufferElem = document.createElement('canvas')
    const bufferCtx = bufferElem.getContext("2d")
    this.buffer = {
      elem: bufferElem,
      ctx: bufferCtx
    }

    const compareBufferElem = new OffscreenCanvas(1, 1)
    const compareBufferCtx = bufferElem.getContext("2d")
    this.compareBuffer = {
      elem: compareBufferElem,
      ctx: compareBufferCtx
    }

    this.shadow = $.create('div')
    this.shadow.class('ambilight__shadow')
    this.ambilightContainer.appendChild(this.shadow)

    this.recreateCanvasses()

    $.sa('.ytp-size-button, .ytp-miniplayer-button').forEach(btn =>
      btn.on('click', () => raf(() =>
        setTimeout(() => this.updateSizes(), 0)
      ))
    )

    window.addEventListener('resize', () => {
      this.updateSizes()
      setTimeout(() =>
        raf(() =>
          setTimeout(() => this.updateSizes(), 200)
        ),
        200)
    });

    document.addEventListener('keydown', (e) => {
      if (document.activeElement) {
        const el = document.activeElement
        const tag = el.tagName
        const inputs = ['INPUT', 'SELECT', 'TEXTAREA'];
        if (inputs.indexOf(tag) !== -1 || el.getAttribute('contenteditable') === 'true')
          return
      }
      if (e.keyCode === 70 || e.keyCode === 84)
        setTimeout(() => this.updateSizes(), 0)
      if (e.keyCode === 90) // z
        this.toggleImmersiveMode()
      if (e.keyCode === 65) // a
        this.toggleEnabled()
    })

    this.videoPlayer.on('playing', () => {
      this.start()
    })
      .on('seeked', () => {
        this.resetVideoFrameCounter()
        this.scheduleNextFrame()
      })
      .on('ended', () => {
        this.clear()
      })
      .on('emptied', () => {
        this.clear()
      })

    // document.addEventListener('visibilitychange', () => {
    //   if(document.visibilityState === 'visible')
    //     this.updateSettings()
    // })

    this.initSettings()
    this.initScrollPosition()
    this.initImmersiveMode()

    this.start()
  }

  setFeedbackLink() {
    const version = document.body.getAttribute('data-ambilight-version') || '';
    const os = document.body.getAttribute('data-ambilight-os') || '';
    this.feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}`
  }

  // updateSettings() {
  //   console.log('update settings')
  // }

  recreateCanvasses() {
    const spreadLevels = Math.max(2, Math.round((this.spread / this.edge)) + this.innerStrength + 1)

    if (!this.players) {
      this.players = []
    }

    this.players = this.players.filter((player, i) => {
      if (i >= spreadLevels) {
        player.elem.remove();
        return false
      }
      return true
    })

    for (let i = this.players.length; i < spreadLevels; i++) {
      const canvas = $.create('canvas')
      canvas.class('ambilight__canvas')

      const ctx = canvas.getContext('2d')
      //ctx.imageSmoothingEnabled = false

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
    //Ignore minimization after scrolling down
    if ($.s('.html5-video-player').classList.contains('ytp-player-minimized')) {
      return true
    }
    this.videoPlayer.style.setProperty('--video-transform', `scale(${(this.videoScale / 100)})`);

    this.playerOffset = this.videoPlayer.offset()
    if (this.playerOffset.top === undefined || this.videoPlayer.videoWidth === 0) return false //Not ready

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
        h: Math.round(this.srcVideoOffset.height / scale)
      }
    }

    this.isVR = !!$.s('.ytp-webgl-spherical')

    this.isFullscreen = !!$.s('.ytp-fullscreen')
    this.isFillingFullscreen = (
      this.isFullscreen &&
      Math.abs(this.playerOffset.width - window.innerWidth) < 10 &&
      Math.abs(this.playerOffset.height - window.innerHeight) < 10
    )

    this.ambilightContainer.style.left = (this.playerOffset.left + window.scrollX) + 'px'
    this.ambilightContainer.style.top = (this.playerOffset.top + window.scrollY - 1) + 'px'
    this.ambilightContainer.style.width = this.playerOffset.width + 'px'
    this.ambilightContainer.style.height = (this.playerOffset.height) + 'px'

    this.ambilightContainer.style.webkitFilter = `
      blur(${this.playerOffset.height * (this.blur * .002)}px)
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
      player.ctx = player.elem.getContext('2d')
      //player.ctx.imageSmoothingEnabled = false
    })


    //console.log('scaled video to ' + this.p.w + ' x ' + this.p.h + ' (x' + scale + ')')
    this.buffer.elem.width = this.p.w
    this.buffer.elem.height = this.p.h
    this.buffer.ctx = this.buffer.elem.getContext('2d')
    //this.buffer.ctx.imageSmoothingEnabled = false

    this.compareBuffer.elem.width = this.srcVideoOffset.width
    this.compareBuffer.elem.height = this.srcVideoOffset.height
    this.compareBuffer.ctx = this.compareBuffer.elem.getContext('2d')
    this.compareBuffer.ctx.imageSmoothingEnabled = false

    this.resizeCanvasses()

    this.resetVideoFrameCounter()

    return true;
  }

  resizeCanvasses() {
    const playerSize = {
      w: this.playerOffset.width,
      h: this.playerOffset.height
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

    this.shadow.style.transform = `scale(${lastScale.x + 0.01}, ${lastScale.y + 0.01})`

    //Shadow gradient 
    const getGradient = (size, edge, keyframes, fadeOutFrom, darkest) => {
      const points = [
        0,
        ...keyframes.map(e => Math.round(edge - (edge * e.p) - (edge * fadeOutFrom * (1 - e.p)))),
        Math.round(edge - (edge * fadeOutFrom)),
        Math.round(edge + size + (edge * fadeOutFrom)),
        ...keyframes.reverse().map(e => Math.round(edge + size + (edge * e.p) + (edge * fadeOutFrom * (1 - e.p)))),
        Math.round(edge + size + edge)
      ]

      return `
        rgba(0,0,0,${darkest}) ${points[0]}px, 
        ${
        keyframes.map((e, i) => `
            rgba(0,0,0,${e.o}) ${points[0 + keyframes.length - i]}px
          `).join(', ')
        }, 
        rgba(0,0,0,0) ${points[1 + keyframes.length]}px, 
        rgba(0,0,0,0) ${points[2 + keyframes.length]}px, 
        ${
        keyframes.reverse().map((e, i) => `
            rgba(0,0,0,${e.o}) ${points[2 + (keyframes.length * 2) - i]}px
          `).join(', ')
        }, 
        rgba(0,0,0,${darkest}) ${points[3 + (keyframes.length * 2)]}px
      `
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
    const verticalGradient = getGradient(video.h, edge.h, keyframes, fadeOutFrom, darkest)
    const horizontalGradient = getGradient(video.w, edge.w, keyframes, fadeOutFrom, darkest)

    this.shadow.style.background = `
      linear-gradient(to bottom, ${verticalGradient}),
      linear-gradient(to right, ${horizontalGradient})
    `
  }

  checkVideoSize() {
    //Resized
    if (this.previousWidth !== this.videoPlayer.clientWidth) {
      this.previousWidth = this.videoPlayer.clientWidth
      return this.updateSizes()
    }

    //Auto quality moved up or down
    if (this.srcVideoOffset.width !== this.videoPlayer.videoWidth
      || this.srcVideoOffset.height !== this.videoPlayer.videoHeight) {
      return this.updateSizes()
    }

    return true
  }

  nextFrame() {
    ambilight.scheduled = false
    if (ambilight.checkVideoSize())
      ambilight.drawAmbilight()

    if (ambilight.scheduled || !ambilight.enabled || ambilight.videoPlayer.paused) return
    ambilight.scheduleNextFrame()
  }

  scheduleNextFrame() {
    if (this.scheduled || !this.enabled || !this.isOnVideoPage) return

    raf(this.nextFrame)
    this.scheduled = true
  }

  isNewFrame(oldImage, newImage) {
    if (!oldImage || oldImage.length !== newImage.length) {
      oldImage = null
      newImage = null
      return true
    }

    for (let i = 0; i < oldImage.length; i++) {
      for (let xi = 0; xi < oldImage[i].length; xi++) {
        if (oldImage[i][xi] !== newImage[i][xi]) {
          oldImage = null
          newImage = null
          i = null
          xi = null
          return true;
        }
      }
    }

    oldImage = null
    newImage = null
    return false;
  }

  detectVideoFrameRate() {
    if (this.videoFrameRateStartTime === undefined) {
      this.videoFrameRateStartTime = 0
      this.videoFrameRateStartFrame = 0
    }

    var frameCount = this.videoPlayer.webkitDecodedFrameCount + this.videoPlayer.webkitDroppedFrameCount
    if (this.videoFrameCount !== frameCount) {
      var videoFrameRateFrame = frameCount
      var videoFrameRateTime = performance.now()
      if (this.videoFrameRateStartTime + 1000 < videoFrameRateTime) {
        if (this.videoFrameRateStartFrame !== 0) {
          this.videoFrameRate = (videoFrameRateFrame - this.videoFrameRateStartFrame) / ((videoFrameRateTime - this.videoFrameRateStartTime) / 1000)
          if (this.showVideoFrameRate)
            console.log(`Video: ${this.videoFrameRate} FPS`)
        }
        this.videoFrameRateStartFrame = videoFrameRateFrame
        this.videoFrameRateStartTime = videoFrameRateTime
      }
    }
  }

  detectDisplayFrameRate() {
    var displayFrameRateTime = performance.now()
    if (this.displayFrameRateStartTime < displayFrameRateTime - 1000) {
      this.displayFrameRate = this.displayFrameRateFrame / ((displayFrameRateTime - this.displayFrameRateStartTime) / 1000)
      if (this.showDisplayFrameRate)
        console.log(`Display: ${this.displayFrameRate} FPS`)
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

    this.detectVideoFrameRate()
    this.detectDisplayFrameRate()

    var newFrameCount = this.videoPlayer.webkitDecodedFrameCount + this.videoPlayer.webkitDroppedFrameCount
    if (this.videoFrameCount == newFrameCount) {
      this.skippedFrames = 0
      if (!this.highQuality) return
    } else if (this.videoFrameCount < newFrameCount && this.videoFrameCount > 120 && this.videoFrameCount - newFrameCount < - 2) {
      this.skippedFrames++
    }
    if (this.videoFrameCount == newFrameCount - 1) {
      this.skippedFrames = 0
    }
    if (this.skippedFrames > 20) {
      console.warn(`YouTube Ambilight: Skipped ${newFrameCount - this.videoFrameCount - 1} frames\n(Your GPU might not be fast enough)`)
    }

    //performance.mark('start-drawing');
    this.compareBuffer.ctx.drawImage(this.videoPlayer, 0, 0, this.compareBuffer.elem.width, this.compareBuffer.elem.height)

    if (
      this.highQuality &&
      this.videoFrameCount === newFrameCount
    ) {
      if (!this.videoFrameRate || !this.displayFrameRate || this.videoFrameRate < (this.displayFrameRate)) {
        //performance.mark('comparing-compare-start');
        let newImage = []

        let partSize = Math.ceil(this.compareBuffer.elem.height / 3)
        let isNewFrame = false

        try {
          for (let i = partSize; i < this.compareBuffer.elem.height; i += partSize) {
            newImage.push(this.compareBuffer.ctx.getImageData(0, i, this.compareBuffer.elem.width, 1).data);
          }
          isNewFrame = this.isNewFrame(this.oldImage, newImage)
          //performance.mark('comparing-compare-end');
        } catch (ex) {
          if (!this.showedHighQualityCompareWarning) {
            console.warn('Failed to retrieve video data. ', ex)
            this.showedHighQualityCompareWarning = true
          }
        }

        if (!isNewFrame) {
          newImage = null
          this.videoFrameCount++
          return
        }

        //performance.measure('comparing-compare', 'comparing-compare-start', 'comparing-compare-end');

        this.oldImage = newImage
        newImage = null
      }
    }

    this.videoFrameCount = newFrameCount

    this.buffer.ctx.drawImage(this.compareBuffer.elem, 0, 0, this.p.w, this.p.h)
    //performance.mark('end-drawing');
    //performance.measure('drawing', 'start-drawing', 'end-drawing');

    this.players.forEach((player) => {
      player.ctx.drawImage(this.buffer.elem, 0, 0)
    })
  }

  enable() {
    if (this.enabled) return

    this.setSetting('enabled', true)
    $.s(`#setting-enabled`).attr('aria-checked', true)

    this.start()
  }

  disable() {
    if (!this.enabled) return

    this.setSetting('enabled', false)
    $.s(`#setting-enabled`).attr('aria-checked', false)

    this.hide()
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

    this.scheduleNextFrame()
  }


  hide() {
    if (this.isHidden) return
    this.isHidden = true
    this.ambilightContainer.style.opacity = '0'
    setTimeout(() => {
      this.clear()
    }, 500)
  }

  show() {
    this.isHidden = false
    this.ambilightContainer.style.opacity = '1'
  }


  initScrollPosition() {
    window.on('scroll', () => {
      this.checkScrollPosition()
    })
    this.checkScrollPosition()
  }

  checkScrollPosition() {
    if (this.changedTopTimeout)
      clearTimeout(this.changedTopTimeout)
    if (window.scrollY > 0)
      this.changedTopTimeout = setTimeout(() => body.class('not-at-top').removeClass('at-top'), 100)
    else
      this.changedTopTimeout = setTimeout(() => body.class('at-top').removeClass('not-at-top'), 100)
  }


  initImmersiveMode() {
    if (this.immersive)
      body.class('immersive-mode')
  }

  toggleImmersiveMode() {
    body.classList.toggle('immersive-mode')
    var enabled = body.classList.contains('immersive-mode')
    $.s(`#setting-immersive`).attr('aria-checked', enabled ? 'true' : 'false')
    this.setSetting('immersive', enabled)
    window.dispatchEvent(new Event('resize'))
  }


  initSettings() {
    var button = $.create('button')
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
                  <div id="setting-${setting.name}" class="ytp-menuitem" role="menuitemcheckbox" aria-checked="${setting.value ? 'true' : 'false'}" tabindex="0">
                    <div class="ytp-menuitem-label">${setting.label}</div>
                    <div class="ytp-menuitem-content">
                      <div class="ytp-menuitem-toggle-checkbox"></div>
                    </div>
                  </div>
                `
        } else if (setting.type === 'list') {
          return `
                  <div class="ytp-menuitem" aria-haspopup="false" role="menuitemrange" tabindex="0">
                    <div class="ytp-menuitem-label">${setting.label}</div>
                    <div id="setting-${setting.name}-value" class="ytp-menuitem-content">${setting.value}%</div>
                  </div>
                  <div class="ytp-menuitem-range" rowspan="2" title="Double click to reset">
                    <input id="setting-${setting.name}" type="range" min="${setting.min}" max="${setting.max}" colspan="2" value="${setting.value}" step="${setting.step || 1}" />
                  </div>
                `
        }
      }).join('')
      }
        </div>
      </div>`;

    this.settingsMenu.prependTo($.s('.html5-video-player'))

    this.settings.forEach(setting => {
      const input = $.s(`#setting-${setting.name}`)
      if (setting.type === 'list') {
        const displayedValue = $.s(`#setting-${setting.name}-value`)
        input.on('change mousemove dblclick', (e) => {
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

          if (setting.name === 'spread' || setting.name === 'edge' || setting.name === 'fadeOutEasing') {
            this.recreateCanvasses()
          }
          this.updateSizes()
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
            setting.name === 'enableInFullscreen'
          ) {
            this.setSetting(setting.name, setting.value)
            $.s(`#setting-${setting.name}`).attr('aria-checked', setting.value)
          }
        })
      }
    });
  }

  openSettingsPopup() {
    var isOpen = this.settingsMenu.classList.contains('is-visible')
    if (isOpen) return

    this.settingsMenu.class('is-visible')
    $.s('.ytp-ambilight-settings-button').attr('aria-expanded', true)

    this.closeSettingsListener = (e) => {
      if (this.settingsMenu === e.target || this.settingsMenu.contains(e.target))
        return;

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

    if (!this.setSettingTimeout)
      this.setSettingTimeout = {}

    if (this.setSettingTimeout[key])
      clearTimeout(this.setSettingTimeout[key])

    this.setSettingTimeout[key] = setTimeout(() => {
      localStorage.setItem(`ambilight-${key}`, value)
      this.setSettingTimeout[key] = null
    }, 500)
  }

  getSetting(key) {
    let value = localStorage.getItem(`ambilight-${key}`)
    const setting = this.settings.find(setting => setting.name === key)
    if (value === null) {
      value = setting.default
    } else if (setting.type === 'checkbox') {
      value = (value === 'true')
    }
    return value
  }
}


checkOnVideoPage = () => {
  const isOnVideoPage = (window.location.href.indexOf('watch?') != -1)
  if (window.ambilight) {
    window.ambilight.isOnVideoPage = isOnVideoPage
    if (isOnVideoPage) {
      window.ambilight.start()
    }
  } else if (isOnVideoPage) {
    const videoPlayer = $.s("#player-container video")
    if (!$.s('ytd-masthead') || !videoPlayer) return //Not ready
    window.ambilight = new Ambilight(videoPlayer)
  }
}

setInterval(() => checkOnVideoPage(), 1000)


initAmbilight = () => {
  try {
    //Force YouTube dark theme
    var app = $.s('ytd-app')
    if (!app || !app.onDarkThemeAction_) return
    app.onDarkThemeAction_()

    checkOnVideoPage()

    clearInterval(tryInitAmbilight)
    //console.log('Initialized ambilight')
  } catch (e) {
    console.error('YouTube Ambilight: Initialization error', e)
  }
}

raf(() => {
  tryInitAmbilight = setInterval(() => initAmbilight(), 100)
})