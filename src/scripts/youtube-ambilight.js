class Ambilight {
    constructor() {
      this.syncLoop = null
      this.srcVideoOffsetTop = -1
      this.isOnPlay = false
      this.previousCorrection = 0
      this.syncCount = 0

      this.initSrcVideo()
      this.initElements()
      this.initImmersiveMode()
      this.setVideo()
      this.initPlayerApi()
    }
  
    initElements() {
      $.create('div')
        .class('noise')
        .appendTo(body)
  
      this.container = $.create('div')
        .class('video-ambilight')
        .appendTo(body)
  
      this.iframe = $.create('iframe')
        .attr('allowtransparency', true)
        .class('unloaded')
        .attr('id', 'ambilight-player')
        .on('load', () => {
          setTimeout(() => {
            this.iframe.removeClass('unloaded')
          }, 2000)
        })
        .appendTo(this.container)
      
      window.on('resize', this.setVideoPosition.bind(this))
      setTimeout(() => { this.setVideoPosition() }, 1500)
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
        .on('click', this.setVideoPosition.bind(this))
  
      this.srcVideo = $.s('.video-stream.html5-main-video')
        .on("play", this.onPlay.bind(this))
        .on("pause", this.onPause.bind(this))
      this.srcVideo.style.left = 0
    }
    initPlayerApi() {
      window.onYouTubeIframeAPIReady = () => {
        try {
          this.player = new YT.Player('ambilight-player', {
              events: {
                'onReady': this.onPlayerReady.bind(this),
                'onError': this.onPlayerError.bind(this)
                //'onStateChange': window.onPlayerStateChange
              }
          });
        } catch(ex) {
          console.error(`Youtube Ambilight failed to load the ambilight player: ${ex.message}`)
        }
      }
      var script = $.create('script')
        .attr('id', 'ambilight-player-script')
        .attr('src', 'https://www.youtube.com/iframe_api')
        .appendTo($.s('head'))
    }
    
    onPlayerReady(event) {
      setTimeout(() => { this.setVideoPosition() }, 1500)
      this.startSync()
    }
    onPlayerError(event) {
      console.error(`YouTube Ambilight failed to load the ambilight player (Error ${event.data})`)
      if(event.data == 101 || event.data == 150)
        console.error('Cause: This channel has disabled embedding into other websites')
      else if(event.data == 5)
        console.error('Cause: The video cannot be viewed in a HTML5 video tag')
      console.error('More info: https://developers.google.com/youtube/iframe_api_reference#onError')
    }
  
    toggleAutoHide() {
      body.classList.toggle("hide-surroundings");
    }
  
    setVideo() {
      const videoId = $.param('v', location.href)
      if(!videoId) return
      //console.log(`Loading ambilight video with id: ${videoId}`)
      const src = `//www.youtube.com/embed/${videoId}?enablejsapi=1&origin=https://www.youtube.com&autoplay=1&autohide=1&controls=0&showinfo=0&fs=0&mute=1&vq=tiny`
      this.iframe.attr('src', src)
    }
  
    startSync() {
      if(this.syncLoop) return
      this.syncLoop = setInterval(this.sync.bind(this), 1000)
    }
    sync() {
      const player = this.player
      const srcVideo = this.srcVideo
      if(!player || !player.getPlayerState || player.getPlayerState() == 3) return
      const playerState = player.getPlayerState()

      if(!srcVideo.playing) {
        if(playerState != 0)
          player.pauseVideo()
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
          correction = this.previousCorrection + (videoTime - ambilightTime)
        } else {
          this.previousCorrection = 0
        }
        player.seekTo(videoTime + correction, true)
        this.previousCorrection = correction

        if(this.syncCount > 10)
          console.warn(`Youtube Ambilight seems to fail while trying to sync the video\nVideo time:${videoTime}\nAmbilight time: ${ambilightTime}\nTimecorrection: ${correction}`)
        this.syncCount++
      } else {
        this.syncCount = 0
      }
    }
  
    setVideoPosition() {
      setTimeout(() => {
        const v = this.srcVideo
        const a = this.container
        if(!a || !v) return
        const as = a.style
        
        as.width = `${v.offsetWidth}px`
        as.height = `${v.offsetHeight}px`
        as.left = (v.offset().left + window.scrollX) + 'px'
        as.top = (v.offset().top + window.scrollY) + 'px'
        this.updateSrcVideoTop()
      }, 100)
    }

    updateSrcVideoTop() {
      this.srcVideoOffsetTop = this.srcVideo.offset().top + window.scrollY
    }
  
    onPause(e) {
      if(this.isOnPlay) {
        this.iframe.class('unloaded')
        return
      }
      clearTimeout(this.queuedUnloadAnimation)
      this.sync()
    }
  
    onPlay(e) {
      this.isOnPlay = true
      setTimeout(() => this.isOnPlay = false, 200)
      if(!this.player || !this.player.getVideoStats || $.param('v', location.href) != this.player.getVideoStats().docid) {
        this.iframe.class('unloaded')
        clearTimeout(this.queuedUnloadAnimation)
        setTimeout(() => {
          this.setVideo()
        }, 500)
      } else {
        this.sync()
        this.queuedUnloadAnimation = setTimeout(() => {
          this.iframe.removeClass('unloaded')
        }, 3000)
      }
    }
  }
  
  if($.s('.video-ambilight')) {
    console.warn('Youtube Ambilight is already enabled')
  } else {
    //console.log(`Enabling ambilight`)
    window.ambilight = new Ambilight()
  }
