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

HTMLElement.prototype.attr = function(name, value) {
  if(typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
HTMLElement.prototype.append = function(elem) {
  if(typeof elem === 'string')
    elem = document.createTextNode(elem)
  this.appendChild(elem)
  return this
}
HTMLElement.prototype.appendTo = function(elem) {
  elem.append(this)
  return this
}
HTMLElement.prototype.prependChild = HTMLElement.prototype.prepend
HTMLElement.prototype.prepend = function(elem) {
  this.prependChild(elem)
  return this
}
HTMLElement.prototype.prependTo = function(elem) {
  elem.prepend(this)
  return this
}
HTMLElement.prototype.class = function(className) {
  const existingClasses = this.className.split(' ')
  if(existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function(className) {
  const classList = this.className.split(' ')
  const pos = classList.indexOf(className)
  if(pos !== -1) {
    classList.splice(pos, 1)
    this.className = classList.join(' ')
  }
  return this
}
HTMLElement.prototype.text = function(text) {
  this.innerText = text
  return this
}
addEventListenerPrototype = function(eventNames, callback) {
  var list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.addEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype

HTMLElement.prototype.offset = function() {
  return this.getBoundingClientRect()
}

body = document.body
  
  

//// Ambilight

class Ambilight {
  constructor() {
    this.initStyling()
    
    this.playerOffset = {}
    this.srcVideoOffset = {}

    this.ambiEnabled = true
    this.sizeInvalidated = true
    
    this.p = null;
    this.a = null;
    this.isFullscreen = false
    this.videoFrameCount = 0

    
    this.barSizeW = (1 / 18) //Based on video width
    this.barSizeH = this.barSizeW * (16/9)
    this.strength = 6
    this.innerStrength = 1
    this.opacityStrength = 3
    
    this.video_player = $.s("#player video")
    this.video_player.style.webkitFilter = 'contrast(115%)'
    
    this.allContainer = document.createElement("div")
    this.allContainer.style.position = 'absolute'
    this.allContainer.style.left = '0'
    this.allContainer.style.top = '0'
    this.allContainer.style.width = '100%'
    this.allContainer.style.height = '200%'
    this.allContainer.style.overflow = 'hidden'
    this.allContainer.style.backfaceVisibility = 'hidden'
    this.allContainer.style.transform = 'translate3d(0,0,1)'
    body.prepend(this.allContainer)

    this.ambilightContainer = document.createElement("div")
    this.ambilightContainer.style.position = 'absolute'
    this.ambilightContainer.style.pointerEvents = 'none'
    this.ambilightContainer.style.webkitFilter = 'blur(4px)'
    //this.ambilightContainer.style.backfaceVisibility = 'hidden'
    //this.ambilightContainer.style.transform = 'translate3d(0,0,1)'
    this.allContainer.prepend(this.ambilightContainer)

    this.playersContainer = document.createElement("div")
    this.playersContainer.style.position = 'absolute'
    this.playersContainer.style.width = '100%'
    this.playersContainer.style.height = '100%'
    this.playersContainer.style.webkitFilter = 'contrast(115%)'
    //this.playersContainer.style.mixBlendMode = 'lighten'
    //this.playersContainer.style.zIndex = 1
    //this.playersContainer.style.backfaceVisibility = 'hidden'
    //this.playersContainer.style.transform = 'translate3d(0,0,1)'
    this.ambilightContainer.prepend(this.playersContainer)
    
    this.ambilightContainers = []
    this.players = []
    const bufferElem = document.createElement("canvas")
    const bufferCtx = bufferElem.getContext("2d")
    bufferCtx.imageSmoothingEnabled = false
    this.buffer = {
      elem: bufferElem,
      ctx: bufferCtx
    }
    
    const videoBufferElem = document.createElement("canvas")
    const videoBufferCtx = bufferElem.getContext("2d")
    videoBufferCtx.imageSmoothingEnabled = false
    this.videoBuffer = {
      elem: videoBufferElem,
      ctx: videoBufferCtx
    }
    
    let lastScaleX = 1
    let lastScaleY = 1
    for(let i = 0; i < this.strength; i++) {
      let pos = i - this.innerStrength
      const scaleStepW = this.barSizeW * 2
      const scaleStepH = this.barSizeH * 2
      let scaleX = 1
      let scaleY = 1
      const nextScale = (prev, step, direction) => {
        step = (step * prev * (1 + step))
        return (direction > 0) ? prev + step : prev - step
      }
      while(pos > 0) {
        scaleX = nextScale(scaleX, scaleStepW, 1)
        scaleY = nextScale(scaleY, scaleStepH, 1)
        pos--
      }
      while(pos < 0) {
        scaleX = nextScale(scaleX, scaleStepW, -1)
        scaleY = nextScale(scaleX, scaleStepW, -1)
        //Todo: If inner we should add it to a different container.
        //This player has no blur, but the innercontainer has an overlapping blur
        //This way we retain the correct edge color without losing brightness and edge details
        pos++
      }
      
      const elem = $.create('canvas')
      elem.style.position = 'absolute'
      //elem.style.outline = '1px solid #fff'
      elem.style.width = '100%'
      elem.style.height = '100%'
      //this.opacityStrength
      //this.innerStrength
      //Old opacity v2
      //elem.style.opacity = Math.min((1 - ( Math.log((i - this.innerStrength - this.opacityStrength) * 100000000) / Math.log((this.strength + 1 - this.innerStrength) * 100000000) )), 1)
      //if(i == this.strength - 1) {
      //  elem.style.webkitFilter = 'blur(30px)'
      //}
      elem.style.imageRendering = 'pixelated'
      const ctx = elem.getContext('2d')
      ctx.imageSmoothingEnabled = false
    
      const container = $.create('div')
      container.style.position = 'absolute'
      //container.style.outline = '1px solid #fff'
      container.style.width = '100%'
      container.style.height = '100%'
      container.style.transform = `scale(${scaleX}, ${scaleY})`
      this.playersContainer.prepend(container)
      container.prepend(elem)
    
      this.players.push({
        elem: elem,
        ctx: ctx
      })
      this.ambilightContainers.push(container)
      lastScaleX = scaleX
      lastScaleY = scaleY
    }

    const shadow = $.create('div')
    shadow.style.position = 'absolute'
    shadow.style.width = '100%'
    shadow.style.height = '100%'
    shadow.style.transform = `scale(${lastScaleX}, ${lastScaleY})`
    const middleColor = '#777777'
    shadow.style.background = `linear-gradient(to right, #111 0%, ${middleColor}00 15%, ${middleColor}00 85%, #111 100%), linear-gradient(to bottom, #111 10%, ${middleColor} 25%, ${middleColor} 75%, #111 90%)`
    shadow.style.mixBlendMode = 'multiply'
    this.ambilightContainer.appendChild(shadow)

    const shadowCenter = $.create('div')
    shadowCenter.style.position = 'absolute'
    shadowCenter.style.width = '76%'
    shadowCenter.style.height = '60%'
    shadowCenter.style.top = '20%'
    shadowCenter.style.left = '12%'
    shadowCenter.style.background = '#fff'
    shadow.appendChild(shadowCenter)


    $.s('.ytp-size-button').on('click', () => {
      setTimeout(() => {
        this.sizeInvalidated = true
      }, 1)
    })
    
    window.addEventListener('resize', () => {
      this.sizeInvalidated = true
    })

    this.video_player.on('playing', () => {
      this.sizeInvalidated = true
    })
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

  initStyling() {
    const html = $.s('html')
    html.style.background = '#000'
    body.style.background = '#000'
    
    const ytHead = $.s('ytd-masthead')
    ytHead.style.background = 'none'
    const searchInput = $.s('#container.ytd-searchbox')
    searchInput.style.background = 'none'
    //.ytd-searchbox #search::-webkit-input-placeholder {
    //  color: var(--ytd-searchbox-legacy-border-color);
    //}
    const searchBtn = $.s('#search-icon-legacy')
    searchBtn.style.background = 'none'
    const searchForm = $.s('#search-form')
    searchForm.style.opacity = .5
    
    const watch = $.s('ytd-watch')
    watch.style.background = 'none'
    
    const app = $.s('ytd-app')
    app.style.background = 'none'
    //app.style.zIndex = 2
    
    const moviePlayer = $.s('#movie_player')
    moviePlayer.style.background = 'none'
    
    const playerContainer = $.s('#player-container')
    playerContainer.style.background = 'none'
  }

  updateSizes() {
    //console.log('resizing')
    this.playerOffset = this.video_player.offset()
    if(this.playerOffset.top < 0) return false //Not ready

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

    //this.ambilightContainer.style.webkitFilter = `blur(${this.playerOffset.height/100 * 10}px)`
    this.ambilightContainer.style.top = this.playerOffset.top + 'px'
    this.ambilightContainer.style.left = this.playerOffset.left + 'px'
    this.ambilightContainer.style.width = this.playerOffset.width + 'px'
    this.ambilightContainer.style.height = (this.playerOffset.height + window.pageYOffset) + 'px'
    
    this.ambilightContainer.style.webkitFilter = `blur(${this.playerOffset.height/13}px)`
      
    this.players.forEach((player) => {
      player.elem.width = this.p.w
      player.elem.height = this.p.h
      //player.elem.style.webkitFilter = `blur(${this.playerOffset.height/100 * 3}`
      //player.elem.style.webkitFilter = `blur(${this.playerOffset.height/100 * Math.max((5 + 3 * (1 - Math.max(player.elem.style.opacity, .1))), 5)}px)`
      player.ctx = player.elem.getContext('2d')
      this.videoBuffer.elem.width = this.srcVideoOffset.width
      this.videoBuffer.elem.height = this.srcVideoOffset.height
      this.videoBuffer.ctx = this.videoBuffer.elem.getContext('2d')
      this.buffer.elem.width = this.p.w
      this.buffer.elem.height = this.p.h
      this.buffer.ctx = this.buffer.elem.getContext('2d')
    })
  
    /*const edge = {
      w: this.p.w * this.barSizeW,
      h: this.p.h * this.barSizeH
    }
    this.a = {
      1: {
        x: 0,
        y: 0,
        w: this.p.w,
        h: edge.h
      },
      2: {
        x: 0,
        y: this.p.h - edge.h,
        w: this.p.w,
        h: edge.h
      },
      3: {
        x: 0,
        y: edge.h,
        w: edge.w,
        h: this.p.h - edge.h - edge.h
      },
      4: {
        x: this.p.w - edge.w,
        y: edge.h,
        w: edge.w,
        h: this.p.h - edge.h - edge.h
      }
    }*/
  
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
    if(!this.ambiEnabled) return this.scheduleNextFrame()

    if((this.sizeInvalidated && !this.updateSizes()) ||
      this.isFullscreen) {
      return this.scheduleNextFrame()
    }

    if(this.video_player.currentTime == 0) {
      this.hide()
      return this.scheduleNextFrame()
    }
    if(this.isHidden) {
      window.ambilight.ambilightContainer.style.display = ''
      this.isHidden = false
    }
  
    
    var newFrameCount = this.video_player.webkitDecodedFrameCount + this.video_player.webkitDroppedFrameCount
    if(this.videoFrameCount == newFrameCount) {
      return this.scheduleNextFrame()
    }
    this.videoFrameCount = newFrameCount

    this.videoBuffer.ctx.drawImage(this.video_player, 0, 0)
    this.buffer.ctx.drawImage(this.videoBuffer.elem, 0, 0, this.p.w, this.p.h)
    this.players.forEach((player) => {
      player.ctx.drawImage(this.buffer.elem, 0, 0)
    })
  
    this.scheduleNextFrame()
  }

  disable() {
    this.ambiEnabled = false
    this.hide()
  }

  hide() {
    this.isHidden = true
    this.ambilightContainer.style.display = 'none'
    this.players.forEach((player) => {
      player.ctx.clearRect(0,0,player.elem.width, player.elem.height)
    })
  }
}


enableAmbilight = () => {
  const isVideoPage = window.location.href.indexOf('watch?v=') != -1
  if(window.ambilight) {
    if(!isVideoPage) {
      if(window.ambilight.ambiEnabled) {
        window.ambilight.disable()
      }
    } else {
      if(!window.ambilight.ambiEnabled) {
        window.ambilight.ambiEnabled = true
      }
    }
  } else if(isVideoPage) {
    if(!$.s('ytd-masthead')) return //Not ready
    window.ambilight = new Ambilight()
  }
}
toggleAmbilight = setInterval(() => enableAmbilight(), 500)