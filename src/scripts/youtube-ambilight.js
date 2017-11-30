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
  var existingClasses = this.className.split(' ')
  if(existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function(className) {
  var classList = this.className.split(' ')
  var pos = classList.indexOf(className)
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
addEventListenerPrototype = function(eventName, callback) {
  this.addEventListener(eventName, callback)
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype

HTMLElement.prototype.offset = function() {
  return this.getBoundingClientRect()
}

Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
  get: function(){
    return !!(this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2)
  }
})

body = document.body


//// Ambilight

class Ambilight {
  constructor() {
    this.strength = 0
    this.srcVideoOffsetTop = -1
    this.isOnPlay = false
    this.receivedSettings = false
    this.syncCounts = []
    this.containers = []
    this.iframes = []
    this.players = []
    this.syncLoops = []
    this.previousCorrections = []
    
    this.requestOptions()
  }

  requestOptions() {
    window.addEventListener("message", event => {
      if (event.source != window) return
      if (event.data.type && event.data.type == "RECEIVE_SETTINGS")
        this.onReceivedOptions(event.data.settings)
    })
    window.postMessage({ type: "GET_SETTINGS" }, "*")
  }

  onReceivedOptions(s) {
    if(!this.receivedSettings) {
      this.strength = s.strength
      this.receivedSettings = true
      this.init()
    } else {
      if(this.strength != s.strength) {
        if(this.strength > s.strength) {
          for(let i = this.strength; i > s.strength; i--) {
            this.removeAmbilightVideo()
          }
        } else if(this.strength < s.strength) {
          for(let i = this.strength; i < s.strength; i++) {
            this.addAmbilightVideo()
          }
          this.setVideo()
          this.setVideoPosition()
        }
      }
      this.strength = s.strength
    }

    this.filter = `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%) blur(${s.size}vw)`
    Object.keys(this.containers).forEach(key => {
      this.containers[key].style.webkitFilter = this.filter
    })
    
    //// This was a fix to keep the brightness on point
    // const style = document.head.appendChild(document.createElement("style"))
    // const opacity = 1 - (Math.max(0, s.size - 3) / 7)
    // style.innerHTML = `.ambilight-video::after {opacity: ${opacity}}`
  }
  
  init() {
    this.initSrcVideo()
    this.initElements()
    this.initImmersiveMode()
    this.setVideo()
    this.initPlayerApi()
  }
  
  initElements() {
    $.create('div')
      .class('noise')
      .prependTo(body)

    for(let i = 0; i < this.strength; i++) {
      this.addAmbilightVideo()
    }
    
    window.on('resize', () => this.setVideoPosition())
    this.setVideoPosition()
  }

  addAmbilightVideo() {
    const key = this.containers.length
    this.containers.push($.create('div')
      .class('ambilight-video')
      .prependTo(body))

    this.iframes.push($.create('iframe')
      .attr('allowtransparency', true)
      .class('ambilight-player unloaded')
      .attr('id', `ambilight-player-${key}`)
      .appendTo(this.containers[key]))
    this.syncLoops.push(null)
    this.syncCounts.push(0)
    this.previousCorrections.push(0)
    if(this.YTApiInitialized)
      this.addPlayer(key)
  }

  removeAmbilightVideo() {
    const key = this.players.length - 1
    clearInterval(this.syncLoops[key])
    this.players[key].destroy()
    this.containers[key].remove()
    this.iframes[key].remove()
    
    this.containers.pop()
    this.iframes.pop()
    this.players.pop()
    this.syncCounts.pop()
    this.previousCorrections.pop()
    this.syncLoops.pop()
  }

  initImmersiveMode() {
    $.create('button')
      .class('toggle-auto-hide-btn ytp-button')
      .attr('title', 'Ambilight Immersive mode\n(This hides everything around the video untill you scroll down)')
      .on('click', this.toggleAutoHide.bind(this))
      .prependTo($.s('.ytp-right-controls'))
  
    window.on('scroll', () => {
      if(window.scrollY > this.srcVideoOffsetTop)
        body.class('disable-hide-surroundings')
      else
        body.removeClass('disable-hide-surroundings')
    })
  }

  initSrcVideo() {
    $.s('.ytp-size-button.ytp-button')
      .on('click', () => this.setVideoPosition())

    this.srcVideo = $.s('.video-stream.html5-main-video')
      .on("play", this.onPlay.bind(this))
      .on("pause", this.onPause.bind(this))
    this.srcVideo.style.left = 0
  }

  initPlayerApi() {
    window.onYouTubeIframeAPIReady = () => {
      this.YTApiInitialized = true
      try {
        Object.keys(this.iframes).forEach(key => {
          this.addPlayer(key)
        })
      } catch(ex) {
        console.error(`Youtube Ambilight failed to load the ambilight player: ${ex.message}`)
      }
    }
    var script = $.create('script')
      .attr('id', 'ambilight-player-script')
      .attr('src', 'https://www.youtube.com/iframe_api')
      .appendTo($.s('head'))
  }

  addPlayer(key) {
    this.players[key] = new YT.Player(`ambilight-player-${key}`, {
      events: {
        'onReady': (event) => this.onPlayerReady(event, key),
        'onError': (event) => this.onPlayerError(event, key)
        //'onStateChange': window.onPlayerStateChange
      }
    })
  }

  onPlayerReady(event, key) {
    this.startSync(key)
  }

  onPlayerError(event, key) {
    console.error(`YouTube Ambilight failed to load ambilight player ${key} (Error ${event.data})`)
    if(event.data == 101 || event.data == 150)
      console.error('Cause: This channel has disabled embedding into other websites')
    else if(event.data == 5)
      console.error('Cause: The video cannot be viewed in a HTML5 video tag')
    console.error('More info: https://developers.google.com/youtube/iframe_api_reference#onError')
  }

  toggleAutoHide() {
    body.classList.toggle("hide-surroundings")
  }

  setVideo() {
    const videoId = $.param('v', location.href)
    if(!videoId) return
    //console.log(`Loading ambilight video with id: ${videoId}`)
    const src = `//www.youtube.com/embed/${videoId}?enablejsapi=1&origin=https://www.youtube.com&autoplay=1&autohide=1&controls=0&showinfo=0&rel=0&fs=0&mute=1&disablekb=1&cc_load_policy=0&iv_load_policy=3&modestbranding=1&vq=tiny`
    
    Object.keys(this.iframes).forEach(key => {
      const player = this.players[key]
      const iframe = this.iframes[key]
      if(iframe.attr('src') == '#' && player.getVideoStats && $.param('v', location.href) == player.getVideoStats().docid) return
      
      iframe.class('unloaded')
        //Setting to # and then replace to avoid duplicate entries in the browser history
        .attr('src', '#')
        .contentWindow.location.replace(src)
    })
  }

  startSync(key) {
    if(this.syncLoops[key]) return
    this.syncLoops[key] = setInterval(() => this.sync(key), 1000)
  }
  sync(key) {
    const player = this.players[key]
    const srcVideo = this.srcVideo
    if(!player || !player.getPlayerState || player.getPlayerState() == 3) return
    const playerState = player.getPlayerState()

    if(!srcVideo.playing) {
      if(playerState != 0) {
        player.pauseVideo()
      }
        return
    } else if(playerState == 2) {
      player.playVideo()
      return
    } else if(playerState == 3) { //buffering
      return
    }

    const videoTime = srcVideo.currentTime
    const ambilightTime = player.getCurrentTime()
    if(videoTime == 0 || ambilightTime == 0) return
    
    if(Math.abs(videoTime - ambilightTime) > .02) {
      let correction = 0.05
      if(playerState != 3 && Math.abs(videoTime - ambilightTime) < 2) {
        correction = this.previousCorrections[key] + (videoTime - ambilightTime)
      } else {
        this.previousCorrections[key] = 0
      }
      player.seekTo(videoTime + correction, true)
      this.previousCorrections[key] = correction

      if(this.syncCounts[key] > 10)
        console.warn(`Youtube Ambilight seems to fail while trying to sync the video\nVideo time:${videoTime}\nAmbilight time: ${ambilightTime}\nTimecorrection: ${correction}`)
      this.syncCounts[key]++
    } else if(this.syncCounts[key] != 0) {
      this.syncCounts[key] = 0
      this.iframes[key].removeClass('unloaded')
      this.setVideoPosition()
    }
  }

  setVideoPosition() {
    setTimeout(() => {
      const v = this.srcVideo
      Object.keys(this.containers).forEach(key => {
        const c = this.containers[key]
        if(!c || !v) return
        const cs = c.style
        
        cs.width = `${v.offsetWidth}px`
        cs.height = `${v.offsetHeight}px`
        cs.left = (v.offset().left + window.scrollX) + 'px'
        cs.top = (v.offset().top + window.scrollY) + 'px'
      })
      this.updateSrcVideoTop()
    }, 100)
  }

  updateSrcVideoTop() {
    this.srcVideoOffsetTop = this.srcVideo.offset().top + window.scrollY
  }

  onPause() {
    setTimeout(() => {
      if(this.isOnPlay) {
        return
      }
      Object.keys(this.iframes).forEach(key => {
        this.sync(key)
      })
    }, 250)
  }

  onStop() {
    this.onPause()
    body.class('disable-ambilight')
    Object.keys(this.iframes).forEach(key => {
      this.iframes[key].class('unloaded')
    })
  }

  onPlay() {
    this.isOnPlay = true
    setTimeout(() => this.isOnPlay = false, 500)

    body.removeClass('disable-ambilight')
    if(this.players.filter((player) => {
      return !player || !player.getVideoStats || $.param('v', location.href) != player.getVideoStats().docid 
    }).length) {
      setTimeout(() => {
        this.setVideo()
      }, 500)
    } else {
      Object.keys(this.iframes).forEach(key => {
        this.sync(key)
      })
    }
  }
}

enableAmbilight = () => {
  isVideoPage = window.location.href.indexOf('watch?v=') != -1
  if(window.ambilight) {
    if(!isVideoPage) {
      window.ambilight.onStop()
    }
  } else if(isVideoPage) {
    window.ambilight = new Ambilight()
  }
}
toggleAmbilight = setInterval(() => enableAmbilight(), 500)