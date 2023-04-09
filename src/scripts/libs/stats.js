import { Canvas, on } from './generic'
import { FRAMESYNC_VIDEOFRAMES } from './settings'

export default class Stats {
  frametimesHistoryMax = 120

  constructor(ambientlight) {
    this.ambientlight = ambientlight
    this.settings = ambientlight.settings
  }

  initElems() {
    if (this.FPSListElem && this.FPSListElem.isConnected) return

    this.FPSListElem = document.createElement('div')
    this.FPSListElem.classList.add('ambientlight__fps-list')

    this.ambientlightFTElem = document.createElement('div')
    this.ambientlightFTElem.classList.add('ambientlight__ambientlight-ft')
    this.ambientlightFTElem.style.display = 'none'
    this.ambientlightFTLegendElem = document.createElement('div')
    this.ambientlightFTLegendElem.classList.add('ambientlight__ambientlight-ft-legend')
    const ambientlightFTLegendElemNode = document.createTextNode('')
    this.ambientlightFTLegendElem.appendChild(ambientlightFTLegendElemNode)
    this.ambientlightFTElem.append(this.ambientlightFTLegendElem)
    this.FPSListElem.append(this.ambientlightFTElem)

    const appendFPSItem = (className) => {
      const elem = document.createElement('div')
      elem.classList.add(className)
      const textNode = document.createTextNode('')
      elem.appendChild(textNode)
      this.FPSListElem.append(elem)
      return elem
    }

    this.displayFPSElem = appendFPSItem('ambientlight__display-fps')
    this.videoFPSElem = appendFPSItem('ambientlight__video-fps')
    this.videoDroppedFramesElem = appendFPSItem('ambientlight__video-dropped-frames')
    this.videoSyncedElem = appendFPSItem('ambientlight__video-synced')
    this.ambientlightFPSElem = appendFPSItem('ambientlight__ambientlight-fps')
    this.ambientlightDroppedFramesElem = appendFPSItem('ambientlight__ambientlight-dropped-frames')

    this.videoResolutionElem = appendFPSItem('ambientlight__video-resolution')
    this.videoSyncedResolutionElem = appendFPSItem('ambientlight__video-synced-resolution')
    if(!this.ambientlight.shouldDrawDirectlyFromVideoElem())
      this.videoBufferResolutionElem = appendFPSItem('ambientlight__video-buffer-resolution')
    this.projectorBufferResolutionElem = appendFPSItem('ambientlight__projector-buffer-resolution')
    this.projectorResolutionElem = appendFPSItem('ambientlight__projector-resolution')

    this.ambientlight.videoPlayerElem?.prepend(this.FPSListElem)
  }

  hide(onlyDisabled = false) {
    if(!onlyDisabled || !this.settings.showResolutions) {
      this.videoResolutionElem.childNodes[0].nodeValue = ''
      this.videoSyncedResolutionElem.childNodes[0].nodeValue = ''
      if(this.videoBufferResolutionElem)
        this.videoBufferResolutionElem.childNodes[0].nodeValue = ''
      this.projectorBufferResolutionElem.childNodes[0].nodeValue = ''
      this.projectorResolutionElem.childNodes[0].nodeValue = ''
    }

    if(!onlyDisabled || !this.settings.showFPS) {
      this.videoFPSElem.childNodes[0].nodeValue = ''
      this.videoDroppedFramesElem.childNodes[0].nodeValue = ''
      this.videoSyncedElem.childNodes[0].nodeValue = ''
      this.ambientlightFPSElem.childNodes[0].nodeValue = ''
      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue = ''
    }

    if(!onlyDisabled || !this.settings.showFPS || !this.settings.showFrametimes) {
      this.displayFPSElem.childNodes[0].nodeValue = ''
    }

    if(!onlyDisabled || !this.settings.showFrametimes) {
      this.ambientlightFTLegendElem.childNodes[0].nodeValue = ''
      
      if(this.frameTimesCanvas?.parentNode) {
        if(this.frameTimesCtx)
          this.frameTimesCtx.clearRect(0, 0, this.frameTimesCanvas.width, this.frameTimesCanvas.height)
        this.ambientlightFTElem.removeChild(this.frameTimesCanvas)
        this.ambientlightFTElem.style.display = 'none'
      }
    }
  }

  videoFrameTimes = []
  frameTimes = []

  update() {
    if (this.ambientlight.isHidden) return

    if(this.settings.showResolutions) {
      const videoResolution = `VIDEO: ${this.ambientlight.videoElem?.videoWidth ?? '?'}x${this.ambientlight.videoElem?.videoHeight ?? '?'}`
      const videoSyncedResolution = this.settings.videoOverlayEnabled
        ? `VIDEO SYNCED: ${this.ambientlight.videoOverlay?.elem?.width ?? '?'}x${this.ambientlight.videoOverlay?.elem?.height ?? '?'}`
        : '';
      const projector = this.ambientlight.projector
      const projectorBufferResolution = this.settings.webGL
        ? `AMBIENT BUFFER: ${projector?.canvas?.width ?? '?'}x${projector?.canvas?.height ?? '?'} 
         [ load: ${(projector?.loadTime ?? 0).toFixed(1)}ms
          | draw: ${(projector?.drawTime ?? 0).toFixed(1)}ms]`
        : '';
      const projectorResolution = `AMBIENT: ${this.settings.webGL
        ? `${projector?.blurCanvas?.width ?? '?'}x${projector?.blurCanvas?.height ?? '?'} 
          [ clear: ${(projector?.blurClearTime ?? 0).toFixed(1)}ms
          | draw: ${(projector?.blurDrawTime ?? 0).toFixed(1)}ms]`
        : projector?.projectors?.length
          ? `${projector?.projectors[0]?.elem?.width ?? '?'}x${projector?.projectors[0]?.elem?.height ?? '?'}`
          : `?x?`
      }`
      
      this.videoResolutionElem.childNodes[0].nodeValue = videoResolution
      this.videoSyncedResolutionElem.childNodes[0].nodeValue = videoSyncedResolution
      this.projectorBufferResolutionElem.childNodes[0].nodeValue = projectorBufferResolution
      this.projectorResolutionElem.childNodes[0].nodeValue = projectorResolution

      if(this.videoBufferResolutionElem) {
        const projectorBuffer = this.ambientlight.projectorBuffer
        const videoBufferResolution = `
          VIDEO BUFFER: ${projectorBuffer?.elem?.width ?? '?'}x${projectorBuffer?.elem?.height ?? '?'} 
          [ load: ${(projectorBuffer?.ctx?.loadTime ?? 0).toFixed(1)}ms
          | draw: ${(projectorBuffer?.ctx?.drawTime ?? 0).toFixed(1)}ms]`
        this.videoBufferResolutionElem.childNodes[0].nodeValue = videoBufferResolution
      }
    }

    if(this.settings.showFPS) {
      // Video FPS
      const videoFrameRate = this.ambientlight.videoFrameRate
      const videoFPSText = `VIDEO: ${videoFrameRate.toFixed(2)} ${videoFrameRate ? `(${(1000/videoFrameRate).toFixed(2)}ms)` : ''}`

      // Video dropped frames
      const videoDroppedFrameCount = this.ambientlight.getVideoDroppedFrameCount()
      const videoDroppedFramesText = `VIDEO DROPPED: ${videoDroppedFrameCount}`
      const videoDroppedFramesColor = (videoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

      // Video synced
      let videoSyncedText = '';
      let videoSyncedColor = '#f55';
      if (this.settings.videoOverlayEnabled) {
        const videoOverlay = this.ambientlight.videoOverlay
        videoSyncedText = `VIDEO SYNCED: ${videoOverlay?.isHidden ? 'NO' : 'YES'}`
        videoSyncedColor = videoOverlay?.isHidden ? '#f55' : '#7f7'
      }

      // Ambientlight FPS
      const ambientlightFrameRate = this.ambientlight.ambientlightFrameRate
      const ambientlightFPSText = `AMBIENT: ${ambientlightFrameRate.toFixed(2)} ${ambientlightFrameRate
        ? `(${(1000/ambientlightFrameRate).toFixed(2)}ms)${this.settings.framerateLimit 
          ? ` LIMITED: ${this.ambientlight.getRealFramerateLimit().toFixed(2)}` : ''
        }` : ''
      }`
      const ambientlightFrameRateTarget = this.settings.framerateLimit 
        ? Math.min(videoFrameRate, this.ambientlight.getRealFramerateLimit()) 
        : videoFrameRate
      const ambientlightFPSColor = (ambientlightFrameRate < ambientlightFrameRateTarget * .9)
        ? '#f55'
        : (ambientlightFrameRate < ambientlightFrameRateTarget - 0.2) ? '#ff3' : '#7f7'

      // Ambientlight dropped frames
      const ambientlightDroppedFramesText = `AMBIENT DROPPED: ${this.ambientlight.ambientlightVideoDroppedFrameCount}`
      const ambientlightDroppedFramesColor = (this.ambientlight.ambientlightVideoDroppedFrameCount > 0) ? '#ff3' : '#7f7'

      // Render all stats

      this.videoFPSElem.childNodes[0].nodeValue = videoFPSText

      this.videoDroppedFramesElem.childNodes[0].nodeValue = videoDroppedFramesText
      this.videoDroppedFramesElem.style.color = videoDroppedFramesColor

      this.videoSyncedElem.childNodes[0].nodeValue = videoSyncedText
      this.videoSyncedElem.style.color = videoSyncedColor

      this.ambientlightFPSElem.childNodes[0].nodeValue = ambientlightFPSText
      this.ambientlightFPSElem.style.color = ambientlightFPSColor

      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue = ambientlightDroppedFramesText
      this.ambientlightDroppedFramesElem.style.color = ambientlightDroppedFramesColor
    }

    if(this.settings.showFrametimes && this.settings.showFPS) {
      // Display FPS
      const displayFrameRate = this.ambientlight.displayFrameRate
      const videoFrameRate = this.ambientlight.videoFrameRate
      const displayFPSText = `DISPLAY: ${displayFrameRate.toFixed(2)} ${displayFrameRate ? `(${(1000/displayFrameRate).toFixed(2)}ms)` : ''}`
      const displayFPSColor = (displayFrameRate < videoFrameRate - 1)
        ? '#f55'
        : (displayFrameRate < videoFrameRate - 0.2) ? '#ff3' : '#7f7'

      this.displayFPSElem.childNodes[0].nodeValue = displayFPSText
      this.displayFPSElem.style.color = displayFPSColor
    } else if(this.displayFPSElem.childNodes[0].nodeValue !== '') {
      this.displayFPSElem.childNodes[0].nodeValue = ''
    }

    this.updateFrameTimes()
  }

  receiveVideoFrametimes = (compose, info) => {
    if (!this.settings.showFrametimes) return

    const now = parseFloat(performance.now().toFixed(1))
    if (this.previousPresentedFrames) {
      const skippedFrames = info.presentedFrames - this.previousPresentedFrames - 1
      for (let i = 0; i < skippedFrames; i++) {
        this.videoFrameTimes.push({
          decode: parseFloat((info.presentationTime - (info.processingDuration * 1000)).toFixed(1)) - (0.1 * i),
          present: info.presentationTime - (0.1 * i),
          display: info.expectedDisplayTime - (0.1 * i),
          compose: compose - (0.1 * i),
          receive: now - (0.1 * i)
        })
      }
    }
    
    // Flow of the rendering pipeline (with durations & timestamps)
    //
    // Media playback engine: ━━► decode [processingDuration] ━━► present to compositor [presentationTime] ━┳ (can be before or after compose)
    // Compositor:                                      ━━► compose [timestamp] ━┻━ handle animation/videoFrameCallbacks ━━► handle other callbacks              ━ ━► display [expectedDisplayTime]
    // Main thread:      ━━► requestVideoFrameCallback to compositor ━┻ (can before or after compose)     ┻━► receiveVideoFrameCallback [receive] ━━► draw ambient light ━┻ (can be before or after display) 

    this.videoFrameTimes.push({
      decode: parseFloat((info.presentationTime - (info.processingDuration * 1000)).toFixed(1)),
      present: info.presentationTime,
      compose,
      receive: now,
      display: info.expectedDisplayTime,
    })
    this.previousPresentedFrames = info.presentedFrames
  }

  addVideoFrametimes = (frameTimes) => {
    frameTimes.video = this.videoFrameTimes[this.videoFrameTimes.length - 1] || 0
  }

  addAmbientFrametimes = (frameTimes, results) => {
    if(!this.settings.showFrametimes || !results?.hasNewFrame) return
  
    frameTimes.frameEnd = parseFloat(performance.now().toFixed(1))
    // const videoFrameTimes = [...this.videoFrameTimes]
    // frameTimes.video = videoFrameTimes.pop() || 0

    const droppedVideoFrameTimes = this.videoFrameTimes.splice(0, this.videoFrameTimes.indexOf(frameTimes.video) + 1) // Remove all historic video frametimes
    droppedVideoFrameTimes.pop() // Remove the current video frametime
    for (const video of droppedVideoFrameTimes) {
      this.frameTimes.push({
        video
      })
    }
    this.frameTimes.push(frameTimes)

    requestIdleCallback(() => {
      frameTimes.display = parseFloat(performance.now().toFixed(1))
    }, { timeout: 1 })
    requestIdleCallback(() => {
      frameTimes.complete = parseFloat(performance.now().toFixed(1))
    })
  }

  updateFrameTimes = () => {
    if(!this.settings.showFrametimes || !this.frameTimes.length) {
      if(this.frameTimesCanvas?.parentNode) {
        if(this.frameTimesCtx)
          this.frameTimesCtx.clearRect(0, 0, this.frameTimesCanvas.width, this.frameTimesCanvas.height)
        this.ambientlightFTElem.removeChild(this.frameTimesCanvas)
        this.ambientlightFTLegendElem.childNodes[0].nodeValue = ''
        this.ambientlightFTElem.style.display = 'none'
      }
      return
    }

    // Ambient light FrameTimes
    let frameTimes = this.frameTimes
    this.frameTimes = this.frameTimes.slice(-this.frametimesHistoryMax)
    frameTimes.pop()
    frameTimes = frameTimes.slice(-this.frametimesHistoryMax)

    // const dropped = frameTimes.filter(x => !x.video?.display).length
    // const displayFrameTimes = frameTimes.filter(x => x.video?.display)
    // const displayIntervals = displayFrameTimes.map((x, i) => (
    //   i > 0 ? parseFloat((x.video?.display - displayFrameTimes[i-1].video?.display).toFixed(1)) : undefined
    // )).filter(x => x !== undefined)
    // const average = parseFloat((displayIntervals.reduce((p, c) => p + c, 0) / displayIntervals.length).toFixed(1));
    // console.log(`[${Math.min(...displayIntervals)} | ${average} | ${Math.max(...displayIntervals)}] Dropped: ${dropped}\n`, 
    //   displayIntervals.join('\n'));

    const displayFrameDuration = (1000 / (Math.max(24, this.ambientlight.displayFrameRate) || 1000))
    const videoFrameDuration = (1000 / (Math.max(24, Math.min(this.ambientlight.videoFrameRate, 60)) || 1000))
    let lastVideoFrameTime = {}
    for (const ft of frameTimes) {
      if (!ft.video) {
        ft.video = (this.settings.frameSync === FRAMESYNC_VIDEOFRAMES)
          ? {
            decode: (lastVideoFrameTime.decode || 0) + videoFrameDuration,
            present: (lastVideoFrameTime.present || 0) + videoFrameDuration,
            compose: (lastVideoFrameTime.compose || 0) + videoFrameDuration,
            receive: (lastVideoFrameTime.receive || 0) + videoFrameDuration,
            display: (lastVideoFrameTime.display || 0) + videoFrameDuration
          }
          : {
            decode: ft.frameStart,
            present: ft.frameStart,
            compose: ft.frameStart,
            receive: ft.frameStart,
            display: ft.frameStart + displayFrameDuration
          }
      }
      lastVideoFrameTime = ft.video
      if (!ft.display)
        ft.display = ft.video.receive
      if (!ft.complete)
        ft.complete = ft.video.receive
    }

    const videoProcessingRange = this.getRange(
      frameTimes.map(ft => ft.video.present - ft.video.decode)
    );
    const ambientlightProcessingRange = this.getRange(
      frameTimes.map(ft => ft.display - ft.video.receive).filter(x => x != 0)
    );
    const ambientlightBudgetRange = this.getRange(
      frameTimes.map(ft => ft.video.display - ft.video.receive)
    );
    const otherBusyRange = this.getRange(
      frameTimes.map(ft => ft.complete - ft.display).filter(x => x != 0)
    );
    const delayedFrames = frameTimes.filter(ft => ft.display > ft.video.display).length
    const lostFrames = frameTimes.filter(ft => !ft.frameStart).length

    const legend = `         FRAMETIMES                 MIN        MAX
BLUE   | video processing:   ${videoProcessingRange[0]       }ms ${videoProcessingRange[1]       }ms
GREEN  | ambient processing: ${ambientlightProcessingRange[0]}ms ${ambientlightProcessingRange[1]}ms
GRAY   | ambient budget:     ${ambientlightBudgetRange[0]    }ms ${ambientlightBudgetRange[1]    }ms
PURPLE | other processing:   ${otherBusyRange[0]             }ms ${otherBusyRange[1]             }ms

                 FRAMECOUNTERS
GREEN          | on time:  ${frameTimes.length - delayedFrames - lostFrames}
YELLOW/ORANGE  | delayed:  ${delayedFrames}
RED            | dropped:  ${lostFrames}

         LINES
GREEN  | when the video frame is rendered
YELLOW | render delayed by 1 display frame
ORANGE | delayed by more than 1 display frame
GREY   | previous display frames`
    this.ambientlightFTLegendElem.childNodes[0].nodeValue = legend

    const scaleX = 3
    const width = frameTimes.length * scaleX
    const height = 300
    const rangeY = 7.65
    const scaleY = height / (videoFrameDuration * (rangeY * 2)) // Math.min(500, (Math.max(videoFrameDuration, longestDuration) * 1.25))

    if(!this.frameTimesCanvas) {
      this.frameTimesCanvas = new Canvas(width, height)
      this.frameTimesCanvas.setAttribute('title', 'Click to toggle legend')
      on(this.frameTimesCanvas, 'click', e => {
        e.preventDefault();
        this.ambientlightFTElem.toggleAttribute('legend');
      }, { capture: true })
      on(this.frameTimesCanvas, 'mousedown', e => {
        e.preventDefault();
      }, { capture: true }) // Prevent pause
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas)
      this.ambientlightFTElem.style.display = ''

      this.frameTimesCtx = this.frameTimesCanvas.getContext('2d', { alpha: true })
    } else if (
      this.frameTimesCanvas.width !== width ||
      this.frameTimesCanvas.height !== height
    ) {
      this.frameTimesCanvas.width = width
      this.frameTimesCanvas.height = height
    } else {
      this.frameTimesCtx.clearRect(0, 0, width, height)
    }
    if(!this.frameTimesCanvas?.parentNode) {
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas)
      this.ambientlightFTElem.style.display = ''
    }

    const rects = []
    console.log(frameTimes)
    for (let i = 0; i < frameTimes.length; i++) {
      const ft = frameTimes[i];
      const x = i * scaleX
      if (ft.frameStart !== undefined) {
        // const nextVideoDisplay = (i === frameTimes.length - 1) ? null : (frameTimes[i+1].video.display - ft.video.display)
        // const display2x = (ft.display - ft.video.display) + displayFrameDuration
        const videoDisplay2x = ft.video.display + displayFrameDuration
        // const display = (ft.display - ft.video.display)
        // const complete = (ft.complete - ft.video.display)
        // const drawEnd = (ft.drawEnd - ft.video.display)
        // const drawStart = (ft.drawStart - ft.video.display)
        // const receive = (ft.video.receive - ft.video.display)
        // const present = (ft.video.present - ft.video.display)
        // const decode = ft.video.decode
        // const previousVideoDisplay = (i === 0) ? null : (frameTimes[i-1].video.display - ft.video.display)
        // const previousComplete = (i === 0) ? null : (frameTimes[i-1].complete - ft.video.display)
        
        const frameRects = []
        // if (previousComplete) {
        //   frameRects.push(['#999', 0, y + previousComplete])
        // }
        // if (previousVideoDisplay) {
        //   frameRects.push(['#555', 0, y + previousVideoDisplay])
        // }
        // frameRects.push(['#999', ft.drawEnd, ft.complete])

        // Idle
        // frameRects.push(['#60b', y, ft.video.present])
        
        // Video decoding
        // frameRects.push(['#06d', y + ft..video.present, -decode])
        // frameRects.push(['#00f', y, receive])

        // Ambient
        const colorIndex = ft.display <= ft.video.display ? 0 : (ft.display <= videoDisplay2x ? 1 : 2)
        // frameRects.push([['#0d0', '#ec0', '#ef5f00'][colorIndex], drawStart, drawEnd])
        frameRects.push([['#0f0', '#ff0', '#ff7700'][colorIndex], ft.drawEnd, ft.display])
        
        // CPU
        // frameRects.push(['#90d', y, drawStart])
        
        // frameRects.push(['#000', y, present])
        // frameRects.push(['#f0f', y + ft.video.display, 3])
        // if (nextVideoDisplay) {
        //   frameRects.push(['#555', y + nextVideoDisplay, height - (y + nextVideoDisplay)])
        // }

        const displayY = Math.ceil((videoFrameDuration * rangeY) * scaleY)
        const offset = ft.video.display - displayY // Math.ceil(((videoFrameDuration * rangeY) - ft.video.display) * scaleY)
        for(const frameRect of frameRects) {
          const [color, pointA, pointB] = frameRect;
          rects.push([color, x, Math.ceil(pointA * scaleY) - offset, 1 * scaleX, Math.ceil((pointB - pointA)  * scaleY) - offset])
        }
        console.log(rects);
      } else if(!this.settings.framerateLimit) {
        rects.push(['#f00', x, 0, scaleX, height])
      }
    }
    
    const displayY = Math.ceil((videoFrameDuration * rangeY) * scaleY)
    rects.push(['#00ff00aa', 0, displayY, width, 1])
    const displayY2x = Math.ceil(displayY + (displayFrameDuration * scaleY))
    rects.push(['#ffff0099', 0, displayY2x, width, 1])
    for(let i = 0; i < 50; i++) {
      const displayYnx = Math.ceil(displayY + ((displayFrameDuration * (2 + i)) * scaleY))
      if(displayYnx > height) break;
      rects.push(['#ff880066', 0, displayYnx, width, 1])
    }
    for(let i = 0; i < 50; i++) {
      const displayYxn = Math.ceil(displayY - (displayFrameDuration * (1 + i) * scaleY))
      if(displayYxn < 0) break;
      rects.push(['#ffffff66', 0, displayYxn, width, 1])
    }

    for (const rect of rects) {
      this.frameTimesCtx.fillStyle = rect[0]
      this.frameTimesCtx.fillRect(rect[1], rect[2], rect[3], rect[4])
    }
  }

  getRange = (list) => list.length 
    ? list
      .sort((a, b) => a - b)
      .reduce((lowest, de, i) => (i === 0)
        ? [de]
        : (i === list.length - 1)
          ? [lowest.toFixed(2)?.padStart(8, ' '), de.toFixed(2)?.padStart(8, ' ')]
          : lowest
      )
    : ['?', '?'];
}