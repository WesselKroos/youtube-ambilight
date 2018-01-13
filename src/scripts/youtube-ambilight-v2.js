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

HTMLElement.prototype.offset = function () {
  return this.getBoundingClientRect()
}

body = document.body



//// Ambilight

class Ambilight {
  constructor() {
    this.playerOffset = {}
    this.srcVideoOffset = {}

    this.isHidden = true
    this.ambiEnabled = true
    this.sizeInvalidated = true

    this.p = null;
    this.a = null;
    this.isFullscreen = false
    this.videoFrameCount = 0


    this.scaleStep = (1 / 9)
    this.strength = 8
    this.innerStrength = 1
    this.opacityStrength = 3
    this.edgeStrenght = 0.2;

    this.video_player = $.s("#player video")
    this.video_player.style.webkitFilter = 'contrast(115%)'

    this.allContainer = document.createElement("div")
    this.allContainer.class('ambilight')
    body.prepend(this.allContainer)

    this.ambilightContainer = document.createElement("div")
    this.ambilightContainer.class('ambilight__container')
    this.allContainer.prepend(this.ambilightContainer)

    this.canvasList = document.createElement("div")
    this.canvasList.class('ambilight__canvas-list')
    this.canvasList.style.webkitFilter = 'contrast(115%)'
    this.ambilightContainer.prepend(this.canvasList)

    this.ambilightContainers = []
    this.players = []
    const bufferElem = document.createElement("canvas")
    const bufferCtx = bufferElem.getContext("2d")
    bufferCtx.imageSmoothingEnabled = false
    this.buffer = {
      elem: bufferElem,
      ctx: bufferCtx
    }

    let lastScale = {
      x: 1,
      y: 1
    }

    for (let i = 0; i < this.strength; i++) {
      const pos = i - this.innerStrength
      let scaleX = 1
      let scaleY = 1

      if (pos > 0) {
        scaleX = 1 + (this.scaleStep * pos)
        scaleY = 1 + ((this.scaleStep * (16 / 9)) * pos)
      }

      if (pos < 0) {
        scaleX = 1 - (this.scaleStep * -pos)
        scaleY = 1 - ((this.scaleStep * (16 / 9)) * -pos)
        if (scaleX < 0) scaleX = 0
        if (scaleY < 0) scaleY = 0
      }

      const canvasContainer = $.create('div')
      canvasContainer.class('ambilight__canvas-container')
      canvasContainer.style.transform = `scale(${scaleX}, ${scaleY})`

      const canvas = $.create('canvas')
      canvas.class('ambilight__canvas')

      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = false

      canvasContainer.prepend(canvas)
      this.canvasList.prepend(canvasContainer)

      this.players.push({
        elem: canvas,
        ctx: ctx
      })
      this.ambilightContainers.push(canvasContainer)
      lastScale.x = scaleX
      lastScale.y = scaleY
    }

    const shadow = $.create('div')
    shadow.class('ambilight__shadow')
    this.ambilightContainer.appendChild(shadow)

    const shadowFade = $.create('div')
    shadowFade.class('ambilight__shadow-fade')
    shadowFade.style.transform = `scale(${lastScale.x}, ${lastScale.y})`
    const middleColor = '#999999'
    const edgeColor = '#000000'
    shadowFade.style.background = `linear-gradient(to right,  ${edgeColor}  0%, ${middleColor}00 25%, ${middleColor}00 75%, ${edgeColor} 100%),
                                   linear-gradient(to bottom, ${edgeColor}  0%, ${middleColor}   25%, ${middleColor}   75%, ${edgeColor} 100%)`
    shadow.appendChild(shadowFade)

    const shadowCenter = $.create('div')
    shadowCenter.class('ambilight__shadow-center')
    shadowCenter.style.transform = `scale(${1 + this.edgeStrenght}, ${1 + (this.edgeStrenght * (16 / 9))})`
    shadowCenter.style.borderRadius = '10%'
    shadow.appendChild(shadowCenter)


    $.s('.ytp-size-button').on('click', () => setTimeout(this.invalidate.bind(this), 0))
    window.addEventListener('resize', this.invalidate.bind(this))
    this.video_player.on('playing', this.invalidate.bind(this))
      .on('timeupdate', () => {
        if (this.srcVideoOffset.width !== this.video_player.videoWidth
          || this.srcVideoOffset.height !== this.video_player.videoHeight) {
          this.sizeInvalidated = true
        }
      })
      .on('seeked', () => this.resetVideoFrameCounter())

    this.scheduleNextFrame()
  }

  resetVideoFrameCounter() {
    this.videoFrameCount = 0
  }
  invalidate() {
    this.sizeInvalidated = true
  }

  updateSizes() {
    //console.log('resizing')
    this.playerOffset = this.video_player.offset()
    if (this.playerOffset.top === undefined) return false //Not ready

    this.srcVideoOffset = {
      width: this.video_player.videoWidth,
      height: this.video_player.videoHeight
    }

    //console.log(`srcVideoOffset ${this.srcVideoOffset.width} x ${this.srcVideoOffset.height}`)
    const scale = Math.ceil(Math.max(this.srcVideoOffset.height, 360) / 360)
    this.p = {
      w: this.srcVideoOffset.width / scale, //this.srcVideoOffset.width * scale,
      h: this.srcVideoOffset.height / scale //360 //this.srcVideoOffset.height * scale
    }
    //console.log(`p ${this.p.w} x ${this.p.h} | scale ${scale}`)
    //console.log(`${scale} | ${this.p.w} | ${this.p.h}`)


    this.isFullscreen = !!$.s('.ytp-fullscreen')
    //console.log('Fullscreen: ' + this.isFullscreen)

    this.ambilightContainer.style.top = this.playerOffset.top + 'px'
    this.ambilightContainer.style.left = this.playerOffset.left + 'px'
    this.ambilightContainer.style.width = this.playerOffset.width + 'px'
    this.ambilightContainer.style.height = (this.playerOffset.height + window.pageYOffset) + 'px'

    this.ambilightContainer.style.webkitFilter = `blur(${this.playerOffset.height / 13}px)`

    this.players.forEach((player) => {
      player.elem.width = this.p.w
      player.elem.height = this.p.h
      player.ctx = player.elem.getContext('2d')
      this.buffer.elem.width = this.p.w
      this.buffer.elem.height = this.p.h
      this.buffer.ctx = this.buffer.elem.getContext('2d')
    })

    this.sizeInvalidated = false
    this.resetVideoFrameCounter()
    return true;
  }

  scheduleNextFrame() {
    var playerOffset = this.video_player.offset()
    this.sizeInvalidated = !(this.ambilightContainer.style.width == this.playerOffset.width + 'px')
    window.requestAnimationFrame(() => this.drawAmbilight())
  }

  drawAmbilight() {
    if (!this.ambiEnabled) return this.scheduleNextFrame()

    if ((this.sizeInvalidated && !this.updateSizes()) ||
      this.isFullscreen) {
      return this.scheduleNextFrame()
    }

    if (this.video_player.currentTime == 0) {
      this.hide()
      return this.scheduleNextFrame()
    }
    if (this.isHidden) {
      this.isHidden = false
      this.ambilightContainer.style.opacity = '1'
    }


    var newFrameCount = this.video_player.webkitDecodedFrameCount + this.video_player.webkitDroppedFrameCount
    if (this.videoFrameCount == newFrameCount) {
      return this.scheduleNextFrame()
    }
    this.videoFrameCount = newFrameCount

    this.buffer.ctx.drawImage(this.video_player, 0, 0, this.p.w, this.p.h)
    this.players.forEach((player) => {
      player.ctx.drawImage(this.buffer.elem, 0, 0)
    })

    this.scheduleNextFrame()
  }

  disable() {
    if (!this.ambiEnabled) return
    this.ambiEnabled = false
    this.hide()
  }

  hide() {
    if (this.isHidden) return
    this.isHidden = true
    this.ambilightContainer.style.opacity = '0'
    setTimeout(() => {
      this.players.forEach((player) => {
        player.ctx.clearRect(0, 0, player.elem.width, player.elem.height)
      })
    }, 500)
  }
}


enableAmbilight = () => {
  const isVideoPage = window.location.href.indexOf('watch?v=') != -1
  if (window.ambilight) {
    if (!isVideoPage) {
      if (window.ambilight.ambiEnabled) {
        window.ambilight.disable()
      }
    } else {
      if (!window.ambilight.ambiEnabled) {
        window.ambilight.ambiEnabled = true
      }
    }
  } else if (isVideoPage) {
    if (!$.s('ytd-masthead')) return //Not ready
    window.ambilight = new Ambilight()
  }
}
toggleAmbilight = setInterval(() => enableAmbilight(), 500)