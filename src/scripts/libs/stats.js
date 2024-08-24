import {
  Canvas,
  SafeOffscreenCanvas,
  on,
  requestIdleCallback,
} from './generic';

export default class Stats {
  frametimesHistoryMax = 120;
  barDetectionDurationsMax = 5;

  constructor(ambientlight) {
    this.ambientlight = ambientlight;
    this.settings = ambientlight.settings;
  }

  initElems() {
    if (this.FPSListElem) return;

    this.FPSListElem = document.createElement('div');
    this.FPSListElem.classList.add('ambientlight__fps-list');

    this.ambientlightFTElem = document.createElement('div');
    this.ambientlightFTElem.classList.add('ambientlight__ambientlight-ft');
    this.ambientlightFTElem.style.display = 'none';

    this.ambientlightFTLegendElem = document.createElement('div');
    this.ambientlightFTLegendElem.classList.add(
      'ambientlight__ambientlight-ft-legend'
    );
    const ambientlightFTLegendElemNode = document.createTextNode('');
    this.ambientlightFTLegendElem.appendChild(ambientlightFTLegendElemNode);
    this.ambientlightFTElem.append(this.ambientlightFTLegendElem);

    this.ambientlightFTAxisLegendsElem = document.createElement('div');
    this.ambientlightFTAxisLegendsElem.classList.add(
      'ambientlight__ambientlight-ft-axis-legends'
    );

    this.ambientlightFTAxisLegendTopElem = document.createElement('div');
    this.ambientlightFTAxisLegendTopElem.classList.add(
      'ambientlight__ambientlight-ft-axis-legend',
      'ambientlight__ambientlight-ft-axis-legend--top'
    );
    const ambientlightFTAxisLegendTopElemNode = document.createTextNode('');
    this.ambientlightFTAxisLegendTopElem.appendChild(
      ambientlightFTAxisLegendTopElemNode
    );
    this.ambientlightFTAxisLegendsElem.append(
      this.ambientlightFTAxisLegendTopElem
    );

    this.ambientlightFTAxisLegendBottomElem = document.createElement('div');
    this.ambientlightFTAxisLegendBottomElem.classList.add(
      'ambientlight__ambientlight-ft-axis-legend',
      'ambientlight__ambientlight-ft-axis-legend--bottom'
    );
    const ambientlightFTAxisLegendBottomElemNode = document.createTextNode('');
    this.ambientlightFTAxisLegendBottomElem.appendChild(
      ambientlightFTAxisLegendBottomElemNode
    );
    this.ambientlightFTAxisLegendsElem.append(
      this.ambientlightFTAxisLegendBottomElem
    );

    this.ambientlightFTElem.append(this.ambientlightFTAxisLegendsElem);

    this.FPSListElem.append(this.ambientlightFTElem);

    const appendFPSItem = (className) => {
      const elem = document.createElement('div');
      elem.classList.add(className);
      const textNode = document.createTextNode('');
      elem.appendChild(textNode);
      this.FPSListElem.append(elem);
      return elem;
    };

    this.displayFPSElem = appendFPSItem('ambientlight__display-fps');
    this.videoFPSElem = appendFPSItem('ambientlight__video-fps');
    this.videoDroppedFramesElem = appendFPSItem(
      'ambientlight__video-dropped-frames'
    );
    this.videoSyncedElem = appendFPSItem('ambientlight__video-synced');
    this.ambientlightFPSElem = appendFPSItem('ambientlight__ambientlight-fps');
    this.ambientlightDroppedFramesElem = appendFPSItem(
      'ambientlight__ambientlight-dropped-frames'
    );

    this.videoResolutionElem = appendFPSItem('ambientlight__video-resolution');
    this.videoSyncedResolutionElem = appendFPSItem(
      'ambientlight__video-synced-resolution'
    );
    if (!this.ambientlight.shouldDrawDirectlyFromVideoElem())
      this.videoBufferResolutionElem = appendFPSItem(
        'ambientlight__video-buffer-resolution'
      );
    this.projectorBufferResolutionElem = appendFPSItem(
      'ambientlight__projector-buffer-resolution'
    );
    this.projectorResolutionElem = appendFPSItem(
      'ambientlight__projector-resolution'
    );

    this.barDetectionFPSElem = appendFPSItem(
      'ambientlight__ambientlight-bar-detection-fps'
    );
    this.barDetectionDurationElem = appendFPSItem(
      'ambientlight__ambientlight-bar-detection-duration'
    );
    this.barDetectionHorizontalResultElem = appendFPSItem(
      'ambientlight__ambientlight-bar-detection-horizontal-result'
    );
    this.barDetectionVerticalResultElem = appendFPSItem(
      'ambientlight__ambientlight-bar-detection-vertical-result'
    );
    this.barDetectionGraphElem = appendFPSItem(
      'ambientlight__ambientlight-bar-detection-graph'
    );
    this.barDetectionGraphElem.style.height = '256px';
    this.barDetectionGraphElem.style.display = 'none';
  }

  hide(onlyDisabled = false) {
    if (!onlyDisabled || !this.settings.showResolutions) {
      this.videoResolutionElem.childNodes[0].nodeValue = '';
      this.videoSyncedResolutionElem.childNodes[0].nodeValue = '';
      if (this.videoBufferResolutionElem)
        this.videoBufferResolutionElem.childNodes[0].nodeValue = '';
      this.projectorBufferResolutionElem.childNodes[0].nodeValue = '';
      this.projectorResolutionElem.childNodes[0].nodeValue = '';
    }

    if (!onlyDisabled || !this.settings.showFPS) {
      this.videoFPSElem.childNodes[0].nodeValue = '';
      this.videoDroppedFramesElem.childNodes[0].nodeValue = '';
      this.videoSyncedElem.childNodes[0].nodeValue = '';
      this.ambientlightFPSElem.childNodes[0].nodeValue = '';
      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue = '';
    }

    if (
      !onlyDisabled ||
      !this.settings.showBarDetectionStats ||
      !this.settings.detectHorizontalBarSizeEnabled
    ) {
      this.barDetectionHorizontalResultElem.childNodes[0].nodeValue = '';
    }

    if (
      !onlyDisabled ||
      !this.settings.showBarDetectionStats ||
      !this.settings.detectVerticalBarSizeEnabled
    ) {
      this.barDetectionVerticalResultElem.childNodes[0].nodeValue = '';
    }

    if (
      !onlyDisabled ||
      !this.settings.showBarDetectionStats ||
      (!this.settings.detectHorizontalBarSizeEnabled &&
        !this.settings.detectVerticalBarSizeEnabled)
    ) {
      this.barDetectionDurations = [];
      this.barDetectionDurationElem.childNodes[0].nodeValue = '';
      this.barDetectionFPSElem.childNodes[0].nodeValue = '';

      if (this.barDetectionCanvas?.parentNode) {
        if (this.barDetectionCtx) {
          this.barDetectionCtx.clearRect(
            0,
            0,
            this.barDetectionCanvas.width,
            this.barDetectionCanvas.height
          );
          this.barDetectionCanvas.width = 1;
          this.barDetectionCanvas.height = 1;
        }

        if (this.barDetectionBufferCtx) {
          this.barDetectionBufferCtx.clearRect(
            0,
            0,
            this.barDetectionBufferCanvas.width,
            this.barDetectionBufferCanvas.height
          );
          this.barDetectionBufferCanvas.width = 1;
          this.barDetectionBufferCanvas.height = 1;
        }

        this.barDetectionGraphElem.removeChild(this.barDetectionCanvas);
        this.barDetectionGraphElem.style.display = 'none';
      }
    }

    if (
      !onlyDisabled ||
      !this.settings.showFPS ||
      !this.settings.showFrametimes
    ) {
      this.displayFPSElem.childNodes[0].nodeValue = '';
    }

    if (!onlyDisabled || !this.settings.showFrametimes) {
      this.ambientlightFTLegendElem.childNodes[0].nodeValue = '';

      if (this.frameTimesCanvas?.parentNode) {
        if (this.frameTimesCtx)
          this.frameTimesCtx.clearRect(
            0,
            0,
            this.frameTimesCanvas.width,
            this.frameTimesCanvas.height
          );
        this.ambientlightFTElem.removeChild(this.frameTimesCanvas);
        this.ambientlightFTElem.style.display = 'none';
      }
    }

    if (
      this.FPSListElem?.isConnected &&
      (!onlyDisabled ||
        (!this.settings.showBarDetectionStats &&
          !this.settings.showResolutions &&
          !this.settings.showFPS &&
          !this.settings.showFrametimes))
    ) {
      this.FPSListElem.remove();
    }
  }

  videoFrameTimes = [];
  frameTimes = [];

  update() {
    if (this.ambientlight.isHidden) return;

    if (this.settings.showResolutions) {
      const videoResolution = `VIDEO: ${
        this.ambientlight.videoElem?.videoWidth ?? '?'
      }x${this.ambientlight.videoElem?.videoHeight ?? '?'}`;
      const videoSyncedResolution = this.settings.videoOverlayEnabled
        ? `VIDEO SYNCED: ${
            this.ambientlight.videoOverlay?.elem?.width ?? '?'
          }x${this.ambientlight.videoOverlay?.elem?.height ?? '?'}`
        : '';
      const projector = this.ambientlight.projector;
      const projectorBufferResolution = this.settings.webGL
        ? `AMBIENT BUFFER: ${projector?.elem?.width ?? '?'}x${
            projector?.elem?.height ?? '?'
          } 
         [ load: ${(projector?.loadTime ?? 0).toFixed(1)}ms
          | draw: ${(projector?.drawTime ?? 0).toFixed(1)}ms]`
        : '';
      const projectorResolution = `AMBIENT: ${
        this.settings.webGL
          ? `${projector?.blurCanvas?.width ?? '?'}x${
              projector?.blurCanvas?.height ?? '?'
            } 
          [ clear: ${(projector?.blurClearTime ?? 0).toFixed(1)}ms
          | draw: ${(projector?.blurDrawTime ?? 0).toFixed(1)}ms]`
          : projector?.projectors?.length
          ? `${projector?.projectors[0]?.elem?.width ?? '?'}x${
              projector?.projectors[0]?.elem?.height ?? '?'
            }`
          : `?x?`
      }`;

      this.videoResolutionElem.childNodes[0].nodeValue = videoResolution;
      this.videoSyncedResolutionElem.childNodes[0].nodeValue =
        videoSyncedResolution;
      this.projectorBufferResolutionElem.childNodes[0].nodeValue =
        projectorBufferResolution;
      this.projectorResolutionElem.childNodes[0].nodeValue =
        projectorResolution;

      if (this.videoBufferResolutionElem) {
        const projectorBuffer = this.ambientlight.projectorBuffer;
        const videoBufferResolution = `
          VIDEO BUFFER: ${projectorBuffer?.elem?.width ?? '?'}x${
          projectorBuffer?.elem?.height ?? '?'
        }${
          projectorBuffer?.ctx?.loadTime === undefined
            ? ''
            : `
          [ load: ${(projectorBuffer?.ctx?.loadTime ?? 0).toFixed(1)}ms
          | draw: ${(projectorBuffer?.ctx?.drawTime ?? 0).toFixed(1)}ms]`
        }`;
        this.videoBufferResolutionElem.childNodes[0].nodeValue =
          videoBufferResolution;
      }
    }

    if (this.settings.showFPS) {
      // Video FPS
      const videoFrameRate = this.ambientlight.videoFrameRate;
      const videoFPSText = `VIDEO: ${videoFrameRate.toFixed(2)} ${
        videoFrameRate ? `(${(1000 / videoFrameRate).toFixed(1)}ms)` : ''
      }`;

      // Video dropped frames
      const videoDroppedFrameCount =
        this.ambientlight.getVideoDroppedFrameCount();
      const videoDroppedFramesText = `VIDEO DROPPED: ${videoDroppedFrameCount}`;
      const videoDroppedFramesColor =
        videoDroppedFrameCount > 0 ? '#ff3' : '#7f7';

      // Video synced
      let videoSyncedText = '';
      let videoSyncedColor = '#f55';
      if (this.settings.videoOverlayEnabled) {
        const videoOverlay = this.ambientlight.videoOverlay;
        videoSyncedText = `VIDEO SYNCED: ${
          videoOverlay?.isHidden ? 'NO' : 'YES'
        }`;
        videoSyncedColor = videoOverlay?.isHidden ? '#f55' : '#7f7';
      }

      // Ambientlight FPS
      const ambientlightFrameRate = this.ambientlight.ambientlightFrameRate;
      const framerateLimit = this.ambientlight.getRealFramerateLimit();
      const ambientlightFPSText = `AMBIENT: ${ambientlightFrameRate.toFixed(
        2
      )} ${
        ambientlightFrameRate
          ? `(${(1000 / ambientlightFrameRate).toFixed(1)}ms)${
              framerateLimit ? ` LIMITED TO: ${framerateLimit.toFixed(2)}` : ''
            }`
          : ''
      }`;
      const ambientlightFrameRateTarget = framerateLimit
        ? Math.min(videoFrameRate, framerateLimit)
        : videoFrameRate;
      const ambientlightFPSColor =
        ambientlightFrameRate < ambientlightFrameRateTarget * 0.9
          ? '#f55'
          : ambientlightFrameRate < ambientlightFrameRateTarget - 0.2
          ? '#ff3'
          : '#7f7';

      // Ambientlight dropped frames
      const ambientlightDroppedFramesText = `AMBIENT DROPPED: ${this.ambientlight.ambientlightVideoDroppedFrameCount}`;
      const ambientlightDroppedFramesColor =
        this.ambientlight.ambientlightVideoDroppedFrameCount > 0
          ? '#ff3'
          : '#7f7';

      // Render all stats

      this.videoFPSElem.childNodes[0].nodeValue = videoFPSText;

      this.videoDroppedFramesElem.childNodes[0].nodeValue =
        videoDroppedFramesText;
      this.videoDroppedFramesElem.style.color = videoDroppedFramesColor;

      this.videoSyncedElem.childNodes[0].nodeValue = videoSyncedText;
      this.videoSyncedElem.style.color = videoSyncedColor;

      this.ambientlightFPSElem.childNodes[0].nodeValue = ambientlightFPSText;
      this.ambientlightFPSElem.style.color = ambientlightFPSColor;

      this.ambientlightDroppedFramesElem.childNodes[0].nodeValue =
        ambientlightDroppedFramesText;
      this.ambientlightDroppedFramesElem.style.color =
        ambientlightDroppedFramesColor;
    }

    if (this.settings.showFrametimes && this.settings.showFPS) {
      // Display FPS
      const displayFrameRate = Math.max(24, this.ambientlight.displayFrameRate);
      const videoFrameRate = this.ambientlight.videoFrameRate;
      const displayFPSText = `DISPLAY: ${displayFrameRate.toFixed(2)} ${
        displayFrameRate ? `(${(1000 / displayFrameRate).toFixed(1)}ms)` : ''
      }`;
      const displayFPSColor =
        displayFrameRate < videoFrameRate - 1
          ? '#f55'
          : displayFrameRate < videoFrameRate - 0.2
          ? '#ff3'
          : '#7f7';

      this.displayFPSElem.childNodes[0].nodeValue = displayFPSText;
      this.displayFPSElem.style.color = displayFPSColor;
    } else if (this.displayFPSElem.childNodes[0].nodeValue !== '') {
      this.displayFPSElem.childNodes[0].nodeValue = '';
    }

    this.updateFrameTimes();
    this.updateBarDetectionDurations();

    if (
      (this.settings.showBarDetectionStats ||
        this.settings.showFPS ||
        this.settings.showResolutions ||
        this.settings.showFrametimes) &&
      this.FPSListElem?.isConnected === false
    ) {
      this.ambientlight.videoPlayerElem?.prepend(this.FPSListElem);
    }
  }

  // Mimic received video frame stats
  receiveAnimationFrametimes = (compose, presentedFrames) => {
    this.receiveVideoFrametimes(compose, {
      presentedFrames,
      presentationTime: compose,
      processingDuration:
        this.previousPresentedFrames === presentedFrames
          ? 0
          : 0.125 / Math.max(24, this.ambientlight.displayFrameRate),
      expectedDisplayTime:
        compose + 1000 / Math.max(24, this.ambientlight.displayFrameRate),
    });
  };

  // Flow of the browsers rendering pipeline (with durations & timestamps)
  //
  // Media playback engine: ━━► decode [processingDuration] ━━► present to compositor [presentationTime] ━┳ (can be before or after compose)
  // Compositor:                                      ━━► compose [timestamp] ━┻━ handle animation/videoFrameCallbacks ━━► do other things ━━► gather received painted frames ━━► display [expectedDisplayTime]
  // Main thread:      ━━► requestVideoFrameCallback to compositor ━┻ (can before or after compose)     ┻━► receiveVideoFrameCallback [receive] ━━► present rendered canvasses to compositor ━┻ (can be before or after display)

  receiveVideoFrametimes = (compose, info) => {
    if (!this.settings.showFrametimes) return;

    const now = performance.now();
    if (this.previousPresentedFrames) {
      const skippedFrames =
        info.presentedFrames - this.previousPresentedFrames - 1;
      // const videoFrameDuration = 1000 / Math.max(1, this.ambientlight.videoFrameRate)
      for (let i = 0; i < skippedFrames; i++) {
        // const offset = (videoFrameDuration * i)
        this.videoFrameTimes.push({
          // decode: (info.presentationTime - (info.processingDuration * 1000)) - offset,
          // present: info.presentationTime - offset,
          // display: info.expectedDisplayTime - offset,
          // compose: compose - offset,
          // receive: now - offset
        });
      }
    }
    this.videoFrameTimes.push({
      decode: info.presentationTime - info.processingDuration * 1000,
      present: info.presentationTime,
      compose,
      receive: now,
      display: info.expectedDisplayTime,
    });
    this.previousPresentedFrames = info.presentedFrames;
  };

  addVideoFrametimes = (frameTimes, compose) => {
    frameTimes.video = this.videoFrameTimes[
      this.videoFrameTimes.length - 1
    ] || {
      compose,
      receive: performance.now(),
    };
  };

  addAmbientFrametimes = (frameTimes) => {
    if (!this.settings.showFrametimes) return;

    frameTimes.frameEnd = performance.now();
    const droppedVideoFrameTimes = this.videoFrameTimes.splice(
      0,
      this.videoFrameTimes.indexOf(frameTimes.video) + 1
    ); // Remove all historic video frametimes
    droppedVideoFrameTimes.pop(); // Remove the current video frametime
    for (const video of droppedVideoFrameTimes) {
      this.frameTimes.push({
        video,
      });
    }
    this.frameTimes.push(frameTimes);

    requestIdleCallback(
      () => {
        frameTimes.display = performance.now();
      },
      { timeout: 1 }
    );
    requestIdleCallback(() => {
      frameTimes.complete = performance.now();
    });
  };

  updateFrameTimes = () => {
    if (!this.settings.showFrametimes || !this.frameTimes.length) {
      if (this.frameTimesCanvas?.parentNode) {
        if (this.frameTimesCtx)
          this.frameTimesCtx.clearRect(
            0,
            0,
            this.frameTimesCanvas.width,
            this.frameTimesCanvas.height
          );
        this.ambientlightFTElem.removeChild(this.frameTimesCanvas);
        this.ambientlightFTLegendElem.childNodes[0].nodeValue = '';
        this.ambientlightFTElem.style.display = 'none';
      }
      return;
    }

    // Ambient light FrameTimes
    let frameTimes = this.frameTimes;
    this.frameTimes = this.frameTimes.slice(-this.frametimesHistoryMax);
    frameTimes.pop();
    frameTimes = frameTimes.slice(-this.frametimesHistoryMax);

    // for (const ft of frameTimes) {
    //   if (!ft.video) {
    //     // console.log(JSON.parse(JSON.stringify(ft)))
    //     ft.video = {
    //       decode: ft.frameStart,
    //       present: ft.frameStart,
    //       compose: ft.frameStart,
    //       receive: ft.frameStart,
    //       display: ft.drawEnd
    //     }
    //   }
    //   if (!ft.display)
    //     ft.display = ft.video.receive
    //   if (!ft.complete)
    //     ft.complete = ft.video.receive
    // }

    const videoProcessingRange = this.getRange(
      frameTimes
        .filter((ft) => ft.video?.present && ft.video?.decode)
        .map((ft) => ft.video.present - ft.video.decode)
        .filter((x) => x != 0)
    );
    const ambientProcessingRange = this.getRange(
      frameTimes
        .filter((ft) => ft.display && ft.video?.receive)
        .map((ft) => ft.display - ft.video.receive)
        .filter((x) => x != 0)
    );
    const compositorProcessingRange = this.getRange(
      frameTimes
        .filter((ft) => ft.complete && ft.display)
        .map((ft) => ft.complete - ft.display)
        .filter((x) => x != 0)
    );
    const ambientlightBudgetRange = this.getRange(
      frameTimes
        .filter((ft) => ft.video?.display && ft.video?.receive)
        .map((ft) => ft.video.display - ft.video.receive)
        .filter((x) => x != 0)
    );
    const delayedFrames = frameTimes.filter(
      (ft) => ft.drawEnd && ft.video?.display && ft.drawEnd > ft.video.display
    ).length;
    const skippedFrames = frameTimes.filter(
      (ft) => !ft.video?.decode || !ft.drawEnd
    ).length;

    const legend = `               VERTICAL BARS             MIN        MAX
BLUE         | Video decoding:    ${videoProcessingRange[0]}ms ${
      videoProcessingRange[1]
    }ms
GREEN/YELLOW | Ambient rendering: ${ambientProcessingRange[0]}ms ${
      ambientProcessingRange[1]
    }ms
GRAY         | Compositing:       ${compositorProcessingRange[0]}ms ${
      compositorProcessingRange[1]
    }ms
ORANGE       | Compositing delay 
RED          | Skipped video frames

               DOTTED LINES
WHITE        | when the next video frame will be displayed
GRAY         | when the next video frame will decoded
GREEN        | when the video frame will be displayed

STATS
Frames on time: ${(frameTimes.length - delayedFrames - skippedFrames)
      .toString()
      .padStart(3, ' ')} | Delayed: ${delayedFrames
      .toString()
      .padStart(3, ' ')} | Skipped: ${skippedFrames.toString().padStart(3, ' ')}
Ambient rendering budget: ${ambientlightBudgetRange[0]}ms to ${
      ambientlightBudgetRange[1]
    }ms`;
    this.ambientlightFTLegendElem.childNodes[0].nodeValue = legend;

    const xSize = 3;
    const width = frameTimes.length * xSize;
    const height = 270;

    if (!this.frameTimesCanvas) {
      this.frameTimesCanvas = new Canvas(width, height);
      this.frameTimesCanvas.setAttribute('title', 'Click to toggle legend');
      on(
        this.frameTimesCanvas,
        'click',
        (e) => {
          e.preventDefault();
          this.ambientlightFTElem.toggleAttribute('legend');
        },
        { capture: true }
      );
      on(
        this.frameTimesCanvas,
        'mousedown',
        (e) => {
          e.preventDefault();
        },
        { capture: true }
      ); // Prevent pause
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas);
      this.ambientlightFTElem.style.display = '';

      this.frameTimesCtx = this.frameTimesCanvas.getContext('2d', {
        alpha: true,
      });
    } else if (
      this.frameTimesCanvas.width !== width ||
      this.frameTimesCanvas.height !== height
    ) {
      this.frameTimesCanvas.width = width;
      this.frameTimesCanvas.height = height;
    } else {
      this.frameTimesCtx.clearRect(0, 0, width, height);
    }
    if (!this.frameTimesCanvas?.parentNode) {
      this.ambientlightFTElem.appendChild(this.frameTimesCanvas);
      this.ambientlightFTElem.style.display = '';
    }

    // Flow of the browsers rendering pipeline (with durations & timestamps)
    //
    // Media playback engine: ━━► video.decode ━━► video.present ━┳ (can be before or after compose)
    // Compositor:                            ━━► video.compose ━┻━ (handle animation/videoFrameCallbacks) ━━► do other things ━━► (gather received painted frames) ━━► video.display
    // Main thread:    ━━► requestVideoFrameCallback ━┻ (can before or after compose)   ┻━► receive ━━► drawStart ━━► drawEnd ━━► display (present rendered canvasses to compositor) ━┻ complete (can be before or after display)

    // console.log(frameTimes)
    const displayFrameDuration =
      1000 / Math.max(24, this.ambientlight.displayFrameRate);
    const offsettedFrameTimes = frameTimes.map((ft, i) => {
      // const offset = startOffset + (i * averageFrameTimesInterval); // To display frame variations
      const offset =
        ft.video?.display ?? ft.video?.compose + displayFrameDuration; // To display frame rendering durations
      return {
        video: ft.video
          ? {
              decode: ft.video?.decode - offset,
              present: ft.video?.present - offset,
              compose: ft.video?.compose - offset,
              receive: ft.video?.receive - offset,
              display: ft.video?.display - offset,
            }
          : undefined,
        drawStart: ft.drawStart - offset,
        drawEnd: ft.drawEnd - offset,
        display: ft.display - offset,
        complete: ft.complete - offset,
        nextCompose:
          i < frameTimes.length - 1
            ? frameTimes[i + 1].video?.compose - offset
            : undefined,
        nextDisplay:
          i < frameTimes.length - 1
            ? frameTimes[i + 1].video?.display - offset
            : undefined,
      };
    });
    // console.log('oft', offsettedFrameTimes)

    const frameDurations = offsettedFrameTimes.map((ft) => ({
      decodeToPresent: [ft.video?.decode, ft.video?.present - ft.video?.decode], // Media playback engine thread
      composeToReceive: [
        ft.video?.compose,
        ft.video?.receive - ft.video?.compose,
      ], // Compositor thread
      presentToCompose: [
        ft.video?.present,
        Math.max(0, ft.video?.compose - ft.video?.present),
      ], // Delayed video frame caused by desynchyronized compositor
      receiveToDrawStart: [ft.video?.receive, ft.drawStart - ft.video?.receive],
      drawStartTodrawEnd: [ft.drawStart, ft.drawEnd - ft.drawStart],
      drawEndToDisplay: [ft.drawEnd, ft.display - ft.drawEnd], // Current task on the main thread
      // displayToComplete: [ft.display, ft.complete - ft.display], // All tasks on main thread
      videoDisplay: ft.video?.display, // All tasks on main thread
      isDrawnBeforeVideoDisplay:
        !isFinite(ft.video?.display) || ft.drawEnd <= ft.video?.display,
      nextCompose: ft.nextCompose,
      isDrawnBeforeNextCompose:
        !isFinite(ft.nextCompose) || ft.drawEnd <= ft.nextCompose,
      nextDisplay: ft.nextDisplay,
      isDrawnBeforeNextDisplay:
        !isFinite(ft.nextDisplay) || ft.drawEnd <= ft.nextDisplay,
      isDrawn: isFinite(ft.drawEnd),
    }));
    // console.log('fd', frameDurations)

    // console.log(displayFrameDuration)

    let averageMinTimes = offsettedFrameTimes
      .map((ft) =>
        Math.min(
          ...[ft.video?.decode, ft.video?.compose].filter((t) => isFinite(t))
        )
      )
      .filter((t) => isFinite(t))
      .sort((a, b) => a - b);
    const minPercentile90Length = Math.floor(averageMinTimes.length * 0.9);
    const averageMinTimesPercentile90 = averageMinTimes.slice(
      averageMinTimes.length - minPercentile90Length,
      minPercentile90Length
    );
    const min =
      Math.round(
        Math.min(...averageMinTimesPercentile90) / displayFrameDuration
      ) * displayFrameDuration;

    let averageMaxTimes = offsettedFrameTimes
      .map((ft) =>
        Math.max(
          ...[
            ft.video?.display,
            ft.drawEnd,
            ft.nextCompose,
            ft.nextDisplay,
          ].filter((t) => isFinite(t))
        )
      )
      .filter((t) => isFinite(t))
      .sort((a, b) => a - b);
    const maxPercentile90Length = Math.floor(averageMaxTimes.length * 0.9);
    const averageMaxTimesPercentile90 = averageMaxTimes.slice(
      0,
      maxPercentile90Length
    );
    const max =
      Math.round(
        Math.max(...averageMaxTimesPercentile90) / displayFrameDuration
      ) * displayFrameDuration;

    this.ambientlightFTAxisLegendTopElem.childNodes[0].nodeValue = `${max.toFixed(
      1
    )}ms`;
    this.ambientlightFTAxisLegendBottomElem.childNodes[0].nodeValue = `${min.toFixed(
      1
    )}ms`;

    const range = max - min + displayFrameDuration;
    const yScale = height / range;
    const yLine = 1 / yScale;
    const framerateLimit = this.ambientlight.getRealFramerateLimit();
    const frameRects = frameDurations.map((fd) => [
      ...(framerateLimit || fd.isDrawn
        ? []
        : [['#800', xSize, min - displayFrameDuration / 2, range]]),
      ['#06f', xSize, ...fd.decodeToPresent],
      ['#666', 1, ...fd.composeToReceive],
      ['#f80', 1, ...fd.presentToCompose],
      // [
      //   fd.isDrawnBeforeVideoDisplay ? '#0f0' : '#ff0',
      //   1,
      //   ...fd.displayToComplete,
      // ],
      ['#a0b', 1, ...fd.drawEndToDisplay],
      [
        fd.isDrawnBeforeVideoDisplay ? '#0b0' : '#db0',
        xSize,
        ...fd.receiveToDrawStart,
      ],
      [
        fd.isDrawnBeforeVideoDisplay ? '#0f0' : '#ff0',
        xSize,
        ...fd.drawStartTodrawEnd,
      ],

      [fd.isDrawnBeforeNextCompose ? '#666' : '#666', 1, fd.nextCompose, yLine],
      [fd.isDrawnBeforeNextDisplay ? '#fff' : '#fff', 1, fd.nextDisplay, yLine],
      [
        fd.isDrawnBeforeVideoDisplay ? '#0f0' : '#0f0',
        1,
        fd.videoDisplay,
        yLine,
      ],
      ...(framerateLimit && !fd.isDrawn
        ? [['#000000bb', xSize, min - displayFrameDuration / 2, range]]
        : []),
    ]);
    // console.log(frameRects)

    const offset = min - displayFrameDuration / 2;
    let rects = [];
    for (let i = 0; i < frameRects.length; i++) {
      const frameRectLines = frameRects[i];
      const x = i * xSize;
      if (frameRectLines !== undefined) {
        for (const [color, xFrameSize, y, ySize] of frameRectLines) {
          if (isNaN(y) || isNaN(ySize) || ySize === 0) continue;
          rects.push([
            color,
            x + Math.round(xSize / 2 - xFrameSize / 2),
            Math.round((y - offset) * yScale),
            xFrameSize,
            Math.max(1, Math.round(ySize * yScale)),
          ]);
        }
      } else if (!framerateLimit) {
        rects.push(['#f00', x, 0, xSize, height]);
      }
    }
    // console.log('rects', rects);

    for (const rect of rects) {
      this.frameTimesCtx.fillStyle = rect[0];
      this.frameTimesCtx.fillRect(rect[1], rect[2], rect[3], rect[4]);
    }
  };

  getRange = (list) => {
    list = list.filter((value) => value !== undefined);
    if (!list.length) return ['?', '?'].map((value) => value.padStart(8, ' '));

    const sortedList = list.sort((a, b) => a - b);
    return [sortedList[0], sortedList[sortedList.length - 1]].map((value) =>
      (value === undefined ? '?' : value.toFixed(1)).padStart(8, ' ')
    );
  };

  barDetectionDurations = [];
  addBarDetectionDuration = (duration) => {
    if (!this.settings.showBarDetectionStats) return;

    this.barDetectionDurations.push(duration);
  };

  updateBarDetectionDurations = () => {
    if (
      !this.settings.showBarDetectionStats ||
      (!this.settings.detectHorizontalBarSizeEnabled &&
        !this.settings.detectVerticalBarSizeEnabled)
    ) {
      if (this.barDetectionDurationElem?.parentNode) {
        this.barDetectionDurationElem.childNodes[0].nodeValue = '';
        this.barDetectionDurationElem.style.color = '';
      }

      if (this.barDetectionHorizontalResultElem?.parentNode) {
        this.barDetectionHorizontalResultElem.childNodes[0].nodeValue = '';
        this.barDetectionHorizontalResultElem.style.color = '';
      }

      if (this.barDetectionVerticalResultElem?.parentNode) {
        this.barDetectionVerticalResultElem.childNodes[0].nodeValue = '';
        this.barDetectionVerticalResultElem.style.color = '';
      }

      if (this.barDetectionFPSElem?.parentNode) {
        this.barDetectionFPSElem.childNodes[0].nodeValue = '';
        this.barDetectionFPSElem.style.color = '';
      }

      if (this.barDetectionCanvas?.parentNode) {
        if (this.barDetectionCtx) {
          this.barDetectionCtx.clearRect(
            0,
            0,
            this.barDetectionCanvas.width,
            this.barDetectionCanvas.height
          );
          this.barDetectionCanvas.width = 1;
          this.barDetectionCanvas.height = 1;
        }

        if (this.barDetectionBufferCtx) {
          this.barDetectionBufferCtx.clearRect(
            0,
            0,
            this.barDetectionBufferCanvas.width,
            this.barDetectionBufferCanvas.height
          );
          this.barDetectionBufferCanvas.width = 1;
          this.barDetectionBufferCanvas.height = 1;
        }

        this.barDetectionGraphElem.removeChild(this.barDetectionCanvas);
        this.barDetectionGraphElem.style.display = 'none';
      }

      return;
    }

    const durations = this.barDetectionDurations.slice(
      -this.barDetectionDurationsMax
    );
    this.barDetectionDurations = durations;

    const duration = durations.length
      ? Math.round(
          durations.reduce((total, duration) => total + duration, 0) /
            durations.length
        ).toFixed(1)
      : undefined;

    this.barDetectionDurationElem.childNodes[0].nodeValue = duration
      ? ` SEARCH DURATION: ${duration}ms`
      : '';
    this.barDetectionDurationElem.style.color = '#fff';
  };

  updateBarDetectionInfo = (throttle, lastChange) => {
    if (!this.settings.showBarDetectionStats) return;

    const barDetectionFPS = throttle
      ? `${Math.round(1000 / throttle).toFixed(2)} (${(1000 / throttle).toFixed(
          1
        )}ms)`
      : 'VIDEO FPS';

    const barDetectionLastChange = lastChange
      ? `${((performance.now() - lastChange) / 1000).toFixed(1)}s ago`
      : '';

    this.barDetectionFPSElem.childNodes[0].nodeValue = `BAR DETECTION: ${barDetectionFPS} / ${barDetectionLastChange}`;
    this.barDetectionFPSElem.style.color = '#fff';
  };

  updateBarDetectionImage = (image) => {
    if (!image) return;
    if (!this.settings.showBarDetectionStats) return;

    const width = 512; // image.width ?? 1
    const height = 512; // image.height ?? 1

    if (!this.barDetectionCanvas) {
      this.barDetectionCanvas = new Canvas(width, height);
      this.barDetectionCtx = this.barDetectionCanvas.getContext('2d', {
        alpha: true,
      });

      this.barDetectionCanvas.setAttribute(
        'title',
        `LINES \nBlue:       Detected bar\nGreen:    Detected edge \nOrange:  Uncertain edge \nGray:       Ignored edge \nRed dotted: Scanline`
      );
      on(
        this.barDetectionCanvas,
        'click',
        (e) => {
          e.preventDefault();
          this.barDetectionGraphElem.toggleAttribute('legend');
        },
        { capture: true }
      );
      on(
        this.barDetectionCanvas,
        'mousedown',
        (e) => {
          e.preventDefault();
        },
        { capture: true }
      ); // Prevent pause
      this.barDetectionGraphElem.appendChild(this.barDetectionCanvas);
      this.barDetectionGraphElem.style.display = '';

      this.barDetectionBufferCanvas = new SafeOffscreenCanvas(width, height);
      this.barDetectionBufferCtx = this.barDetectionBufferCanvas.getContext(
        '2d',
        { alpha: true }
      );
    } else if (
      this.barDetectionCanvas.width !== width ||
      this.barDetectionCanvas.height !== height
    ) {
      this.barDetectionCanvas.width = width;
      this.barDetectionCanvas.height = height;
      this.barDetectionBufferCanvas.width = width;
      this.barDetectionBufferCanvas.height = height;
    } else {
      // this.barDetectionBufferCtx.clearRect(0, 0, width, height) // Causes short flickering to black
    }
    if (!this.barDetectionCanvas?.parentNode) {
      this.barDetectionGraphElem.appendChild(this.barDetectionCanvas);
      this.barDetectionGraphElem.style.display = '';
    }

    this.barDetectionBufferCtx.drawImage(
      image,
      0,
      0,
      this.barDetectionBufferCanvas.width,
      this.barDetectionBufferCanvas.height
    );
  };

  updateBarDetectionResult = async (
    barsFound,
    horizontalBarSizeInfo,
    verticalBarSizeInfo,
    horizontalPercentage,
    verticalPercentage
  ) => {
    if (!this.settings.showBarDetectionStats || !this.barDetectionCtx) return;

    this.barDetectionHorizontalResultElem.childNodes[0].nodeValue = `${[
      this.settings.detectHorizontalBarSizeEnabled
        ? ` HORIZONTAL: ${
            horizontalBarSizeInfo.percentage !== undefined
              ? `${horizontalBarSizeInfo.percentage
                  .toFixed(2)
                  .padStart(5, ' ')}`
              : '  #.##'
          }%  ➜ ${horizontalPercentage.toFixed(2).padStart(5, ' ')}%`
        : '',
      this.settings.detectHorizontalBarSizeEnabled
        ? ` COLOR (rgb):       ${horizontalBarSizeInfo.color
            ?.map((c) => Math.round(c).toString().padStart(3, ' '))
            ?.join(' ')}`
        : '',
    ]
      .filter((s) => s)
      .join('\n')}`;
    this.barDetectionHorizontalResultElem.style.color =
      horizontalBarSizeInfo.percentage !== undefined
        ? barsFound
          ? '#0f0'
          : '#f80'
        : '#fff';

    this.barDetectionVerticalResultElem.childNodes[0].nodeValue = `${[
      this.settings.detectVerticalBarSizeEnabled
        ? ` VERTICAL:     ${
            verticalBarSizeInfo.percentage !== undefined
              ? `${verticalBarSizeInfo.percentage.toFixed(2).padStart(5, ' ')}`
              : '  #.##'
          }%  ➜ ${verticalPercentage.toFixed(2).padStart(5, ' ')}%`
        : '',
      this.settings.detectVerticalBarSizeEnabled
        ? ` COLOR (rgb):       ${verticalBarSizeInfo.color
            ?.map((c) => Math.round(c).toString().padStart(3, ' '))
            ?.join(' ')}`
        : '',
    ]
      .filter((s) => s)
      .join('\n')}`;
    this.barDetectionVerticalResultElem.style.color =
      verticalBarSizeInfo.percentage !== undefined
        ? barsFound
          ? '#0f0'
          : '#f80'
        : '#fff';

    const width = this.barDetectionCanvas.width;
    const height = this.barDetectionCanvas.height;

    this.barDetectionCtx.clearRect(
      0,
      0,
      this.barDetectionCanvas.width,
      this.barDetectionCanvas.height
    );
    this.barDetectionCtx.drawImage(this.barDetectionBufferCanvas, 0, 0);
    this.barDetectionCtx.strokeStyle = '#00000077';

    const rects = [];
    const fillRects = [];

    if (horizontalBarSizeInfo.percentage !== undefined) {
      const xIndex = Math.floor(
        height * (horizontalBarSizeInfo.percentage / 100)
      );
      rects.push(['#0af', 0, xIndex, width, 1]);
      rects.push(['#0af', 0, height - xIndex - 1, width, 1]);
    }

    if (verticalBarSizeInfo.percentage !== undefined) {
      const yIndex = Math.floor(width * (verticalBarSizeInfo.percentage / 100));
      rects.push(['#0af', yIndex, 0, 1, height]);
      rects.push(['#0af', width - yIndex - 1, 0, 1, height]);
    }

    const certaintySize = globalThis.BARDETECTION_EDGE_RANGE;
    const getEdgeSizes = (yIndex, certainty) => {
      const length = Math.floor(yIndex - 1);
      return {
        length: length < 3 ? 0 : length,
        radius: Math.floor(certaintySize * certainty),
        thickness: length < 3 ? 1 : 2,
      };
    };
    const getEdgeColor = (deviates, percentage) =>
      deviates ? '#555' : percentage === undefined ? '#f80' : '#0c0';

    if (!this.dotsPattern) {
      const dotsPattern = await createImageBitmap(
        new ImageData(
          new Uint8ClampedArray([
            255, 50, 50, 255, 100, 0, 0, 255, 100, 0, 0, 255, 255, 50, 50, 255,
          ]),
          2,
          2,
          { colorSpace: 'srgb' }
        )
      );
      this.barDetectionDotsPattern = this.barDetectionCtx.createPattern(
        dotsPattern,
        'repeat'
      );
    }

    if (horizontalBarSizeInfo.topEdges && horizontalBarSizeInfo.bottomEdges) {
      for (const {
        xIndex,
        yIndex,
        deviates,
        deviatesTop,
        certainty,
      } of horizontalBarSizeInfo.topEdges) {
        const { length, radius, thickness } = getEdgeSizes(yIndex, certainty);
        fillRects.push([this.barDetectionDotsPattern, xIndex, 0, 1, length]);
        rects.push([
          getEdgeColor(
            deviates || deviatesTop,
            horizontalBarSizeInfo.percentage
          ),
          xIndex - radius,
          length,
          1 + radius * 2,
          thickness,
        ]);
      }
      for (const {
        xIndex,
        yIndex,
        deviates,
        deviatesBottom,
        certainty,
      } of horizontalBarSizeInfo.bottomEdges) {
        const { length, radius, thickness } = getEdgeSizes(yIndex, certainty);
        fillRects.push([
          this.barDetectionDotsPattern,
          xIndex,
          height - length,
          1,
          length,
        ]);
        rects.push([
          getEdgeColor(
            deviates || deviatesBottom,
            horizontalBarSizeInfo.percentage
          ),
          xIndex - radius,
          height - length - thickness,
          1 + radius * 2,
          thickness,
        ]);
      }
    }

    if (verticalBarSizeInfo.topEdges && verticalBarSizeInfo.bottomEdges) {
      for (const {
        xIndex,
        yIndex,
        deviates,
        deviatesTop,
        certainty,
      } of verticalBarSizeInfo.topEdges) {
        const { length, radius, thickness } = getEdgeSizes(yIndex, certainty);
        fillRects.push([this.barDetectionDotsPattern, 0, xIndex, length, 1]);
        rects.push([
          getEdgeColor(deviates || deviatesTop, verticalBarSizeInfo.percentage),
          length,
          xIndex - radius,
          thickness,
          1 + radius * 2,
        ]);
      }
      for (const {
        xIndex,
        yIndex,
        deviates,
        deviatesBottom,
        certainty,
      } of verticalBarSizeInfo.bottomEdges) {
        const { length, radius, thickness } = getEdgeSizes(yIndex, certainty);
        fillRects.push([
          this.barDetectionDotsPattern,
          width - length,
          xIndex,
          length,
          1,
        ]);
        rects.push([
          getEdgeColor(
            deviates || deviatesBottom,
            verticalBarSizeInfo.percentage
          ),
          width - length - thickness,
          xIndex - radius,
          thickness,
          1 + radius * 2,
        ]);
      }
    }

    for (const rect of fillRects) {
      this.barDetectionCtx.fillStyle = rect[0];
      this.barDetectionCtx.fillRect(rect[1], rect[2], rect[3], rect[4]);
    }
    for (const rect of rects) {
      this.barDetectionCtx.strokeRect(
        rect[1] - 0.5,
        rect[2] - 0.5,
        rect[3] + 1,
        rect[4] + 1
      );
    }
    for (const rect of rects) {
      this.barDetectionCtx.fillStyle = rect[0];

      this.barDetectionCtx.fillRect(rect[1], rect[2], rect[3], rect[4]);
    }
  };
}
