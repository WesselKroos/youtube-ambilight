import { on, off, raf, wrapErrorHandler } from './generic';
import SettingsConfig from './settings-config';
import BarDetection from './bar-detection';

// Resolution of the buffer the ambient light is rendered from.
// It is blurred heavily afterwards, so a few pixels are more than enough.
const BUFFER_WIDTH = 64;

// Amount of frames a transition between two sources (cover <-> video,
// cover <-> cover) takes to fade in.
const TRANSITION_FRAMES = 36;
const TRANSITION_ALPHA = 0.12;

// Many videos contain a thin black line at their edges, which is too thin to
// be detected as a bar. Video compression also blurs the edges of black bars
// into the image. So a few extra pixels are clipped to hide those edges.
const BARS_CLIP_MARGIN = 2;

// The settings of the YouTube player that are also applied on YouTube Music.
// They are shared via the extension storage, so a change on youtube.com is
// also applied on music.youtube.com
export const musicSettingNames = [
  'enabled',
  'spread',
  'blur2',
  'brightness',
  'contrast',
  'saturation',
  'frameBlending',
  'frameBlendingSmoothness',
  'detectHorizontalBarSizeEnabled',
  'detectVerticalBarSizeEnabled',
  'detectColoredHorizontalBarSizeEnabled',
  'detectHorizontalBarSizeOffsetPercentage',
];

const barDetectionSettingNames = [
  'detectHorizontalBarSizeEnabled',
  'detectVerticalBarSizeEnabled',
  'detectColoredHorizontalBarSizeEnabled',
  'detectHorizontalBarSizeOffsetPercentage',
];

// The bar detection reports its results to the stats of the YouTube player,
// which are not available on YouTube Music
const noopStats = {
  updateBarDetectionImage: () => {},
  updateBarDetectionResult: async () => {},
  addBarDetectionDuration: () => {},
  updateBarDetectionInfo: () => {},
};

export const getDefaultMusicSettings = () =>
  Object.fromEntries(
    musicSettingNames.map((name) => [
      name,
      SettingsConfig.find((setting) => setting.name === name)?.default,
    ])
  );

export default class MusicAmbientlight {
  enabled = false;
  isVideoMode = false;
  isPlayerPageOpen = false;
  isFullscreen = false;
  sourceKey = undefined;
  transitionFramesLeft = 0;
  scheduledFrameId = undefined;
  scheduledVideoFrameId = undefined;
  // Percentage of the video height/width per side that contains black bars
  barsClip = { horizontal: 0, vertical: 0 };

  constructor(playerPageElem, playerElem, settings) {
    this.playerPageElem = playerPageElem;
    this.playerElem = playerElem;

    this.barDetection = new BarDetection({ stats: noopStats });

    this.initElems();
    this.initListeners();
    this.updateSettings(settings);
  }

  get videoElem() {
    return this.playerElem.querySelector('#song-video video.html5-main-video');
  }

  get coverElem() {
    return this.playerElem.querySelector('#song-image img');
  }

  initElems() {
    this.elem = document.createElement('div');
    this.elem.classList.add('ytal-music');
    this.elem.setAttribute('aria-hidden', 'true');

    this.glowElem = document.createElement('div');
    this.glowElem.classList.add('ytal-music__glow');
    this.elem.appendChild(this.glowElem);

    this.buffer = document.createElement('canvas');
    this.bufferCtx = this.buffer.getContext('2d', { alpha: false });

    // Two layers of the same buffer: a wide and soft one for the spread and a
    // tighter brighter one that sticks to the edges of the cover or video
    this.layers = ['far', 'near'].map((name) => {
      const canvas = document.createElement('canvas');
      canvas.classList.add('ytal-music__layer', `ytal-music__layer--${name}`);
      this.glowElem.appendChild(canvas);
      return {
        canvas,
        ctx: canvas.getContext('2d', { alpha: false }),
      };
    });

    // A full window layer below the navigation bar, guide and player bar, so
    // that the ambient light can also shine through them
    document.body.appendChild(this.elem);
  }

  initListeners() {
    this.playerObserver = new MutationObserver(
      wrapErrorHandler(function onPlayerMutation() {
        this.update();
      }.bind(this), true)
    );
    this.playerObserver.observe(this.playerElem, {
      attributes: true,
      attributeFilter: ['video-mode', 'player-page-open', 'player-ui-state'],
    });

    // The cover <img> element is reused between songs, only its src changes
    this.coverObserver = new MutationObserver(
      wrapErrorHandler(function onCoverMutation() {
        this.update();
      }.bind(this), true)
    );
    this.coverContainerElem =
      this.playerElem.querySelector('#song-image') ?? this.playerElem;
    this.coverObserver.observe(this.coverContainerElem, {
      attributes: true,
      attributeFilter: ['src'],
      childList: true,
      subtree: true,
    });

    this.onCoverLoad = () => this.update();
    on(this.coverContainerElem, 'load', this.onCoverLoad, { capture: true }, true);

    this.resizeObserver = new ResizeObserver(
      wrapErrorHandler(function onResize() {
        this.updateLayout();
      }.bind(this), true)
    );
    this.resizeObserver.observe(this.playerPageElem);
    this.resizeObserver.observe(this.playerElem);

    // The main panel scrolls along with the queue in narrow layouts
    // The player page slides in and out with a transform, which is not
    // detected by the ResizeObserver
    this.onPlayerPageTransitionEnd = () => this.scheduleLayoutUpdate();
    on(
      this.playerPageElem,
      'transitionend animationend',
      this.onPlayerPageTransitionEnd,
      undefined,
      true
    );

    this.onScroll = () => this.scheduleLayoutUpdate();
    on(this.playerPageElem, 'scroll', this.onScroll, {
      capture: true,
      passive: true,
    }, true);

    // Media events do not bubble, but can be captured. This also covers the
    // video element that is created or replaced after the initialization
    this.onVideoChange = () => this.update();
    on(this.playerElem, 'loadeddata seeked playing resize', this.onVideoChange, {
      capture: true,
    }, true);

    this.onVisibilityChange = () => this.update();
    on(document, 'visibilitychange', this.onVisibilityChange, undefined, true);
  }

  updateSettings(settings) {
    const previousSettings = this.settings;
    this.settings = { ...getDefaultMusicSettings(), ...this.settings, ...settings };
    if (
      previousSettings &&
      barDetectionSettingNames.some(
        (name) => previousSettings[name] !== this.settings[name]
      )
    ) {
      this.resetBarDetection();
    }
    const { spread, blur2, brightness, contrast, saturation } = this.settings;

    // Mimics the projectors of the YouTube player: the spread is the amount
    // of the video size the ambient light extends past the edges
    this.elem.style.setProperty('--ytal-music-spread', spread / 100);
    this.elem.style.setProperty('--ytal-music-blur', blur2 / 100);
    this.glowElem.style.filter = [
      contrast != 100 ? `contrast(${contrast}%)` : '',
      brightness != 100 ? `brightness(${brightness}%)` : '',
      saturation != 100 ? `saturate(${saturation}%)` : '',
    ]
      .filter((filter) => filter)
      .join(' ');

    this.update();
  }

  get videoFrameAlpha() {
    if (!this.settings.frameBlending) return 1;

    // Blend video frames with the previous frames to smooth out flickering
    return Math.max(0.1, 1 - this.settings.frameBlendingSmoothness / 100);
  }

  update() {
    this.isVideoMode = this.playerElem.hasAttribute('video-mode');
    this.isPlayerPageOpen = this.playerElem.hasAttribute('player-page-open');
    this.isFullscreen =
      this.playerElem.getAttribute('player-ui-state') === 'FULLSCREEN';

    const enabled =
      this.settings.enabled &&
      this.isPlayerPageOpen &&
      !this.isFullscreen &&
      document.visibilityState !== 'hidden';

    if (!enabled) {
      if (this.enabled) this.hide();
      return;
    }

    this.enabled = true;
    this.elem.classList.add('ytal-music--active');

    const source = this.getSource();
    if (!source) {
      this.elem.classList.remove('ytal-music--visible');
      return;
    }

    if (source.key !== this.sourceKey) {
      // Fade the new source in over the previous one, unless there is nothing
      // to fade from yet
      this.transitionFramesLeft =
        this.sourceKey === undefined ? 0 : TRANSITION_FRAMES;
      this.sourceKey = source.key;
    }

    this.updateLayout();
    this.elem.classList.add('ytal-music--visible');
    this.scheduleDraw();
  }

  hide() {
    this.enabled = false;
    this.elem.classList.remove('ytal-music--active', 'ytal-music--visible');
    this.cancelScheduledDraw();
    this.cancelScheduledVideoFrame();
    this.updateVideoClip();
  }

  getSource() {
    if (this.isVideoMode) {
      const video = this.videoElem;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      if (video.readyState < 2) return;

      return {
        key: 'video',
        elem: video,
        width: video.videoWidth,
        height: video.videoHeight,
        fit: 'contain',
      };
    }

    const cover = this.coverElem;
    // A 1x1 transparent placeholder is used while the cover is not loaded yet
    if (!cover?.complete || cover.naturalWidth <= 1) return;

    return {
      key: cover.currentSrc || cover.src,
      elem: cover,
      width: cover.naturalWidth,
      height: cover.naturalHeight,
      fit: getComputedStyle(cover).objectFit === 'contain' ? 'contain' : 'cover',
    };
  }

  scheduleLayoutUpdate() {
    if (this.scheduledLayoutUpdate) return;

    this.scheduledLayoutUpdate = true;
    raf(() => {
      this.scheduledLayoutUpdate = false;
      this.updateLayout();
    });
  }

  updateLayout() {
    if (!this.enabled) return;

    const source = this.getSource();
    if (!source) return;

    const elemRect = source.elem.getBoundingClientRect();
    if (!elemRect.width || !elemRect.height) return;

    // Only the visible part of the video or cover should glow, not the
    // letterboxing around it
    let { left, top, width, height } = elemRect;
    if (source.fit === 'contain') {
      const scale = Math.min(width / source.width, height / source.height);
      const contentWidth = source.width * scale;
      const contentHeight = source.height * scale;
      left += (width - contentWidth) / 2;
      top += (height - contentHeight) / 2;
      width = contentWidth;
      height = contentHeight;
    }

    if (source.key === 'video') {
      // The black bars are clipped off the video, so the ambient light should
      // start at the edges of the remaining image
      const { horizontal, vertical } = this.barsClip;
      const clipX = this.settings.detectVerticalBarSizeEnabled
        ? (width * vertical) / 100 + BARS_CLIP_MARGIN
        : 0;
      const clipY = this.settings.detectHorizontalBarSizeEnabled
        ? (height * horizontal) / 100 + BARS_CLIP_MARGIN
        : 0;
      left += clipX;
      top += clipY;
      width -= clipX * 2;
      height -= clipY * 2;
    }
    this.updateVideoClip(source.key === 'video' ? source.elem : undefined);

    const style = this.glowElem.style;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.width = `${width}px`;
    style.height = `${height}px`;
    this.elem.style.setProperty(
      '--ytal-music-size',
      `${Math.round(Math.min(width, height))}px`
    );

    const bufferHeight = Math.max(
      1,
      Math.round((BUFFER_WIDTH * height) / width)
    );
    if (
      this.buffer.width !== BUFFER_WIDTH ||
      this.buffer.height !== bufferHeight
    ) {
      this.buffer.width = BUFFER_WIDTH;
      this.buffer.height = bufferHeight;
      for (const { canvas } of this.layers) {
        canvas.width = BUFFER_WIDTH;
        canvas.height = bufferHeight;
      }
      // Resizing a canvas clears it, so the transition has nothing to fade from
      this.transitionFramesLeft = 0;
      this.scheduleDraw();
    }
  }

  scheduleDraw() {
    if (this.scheduledFrameId !== undefined) return;

    this.scheduledFrameId = raf(() => {
      this.scheduledFrameId = undefined;
      this.draw();
    });
  }

  cancelScheduledDraw() {
    if (this.scheduledFrameId === undefined) return;

    cancelAnimationFrame(this.scheduledFrameId);
    this.scheduledFrameId = undefined;
  }

  scheduleVideoFrame(video) {
    if (this.scheduledVideoFrameId !== undefined) return;

    if (video.requestVideoFrameCallback) {
      this.scheduledVideoFrameVideo = video;
      this.scheduledVideoFrameId = video.requestVideoFrameCallback(
        wrapErrorHandler(function onVideoFrame() {
          this.scheduledVideoFrameId = undefined;
          this.draw(true);
        }.bind(this), true)
      );
    } else {
      this.scheduledVideoFrameId = raf(() => {
        this.scheduledVideoFrameId = undefined;
        this.draw(true);
      });
    }
  }

  cancelScheduledVideoFrame() {
    if (this.scheduledVideoFrameId === undefined) return;

    if (this.scheduledVideoFrameVideo?.cancelVideoFrameCallback) {
      this.scheduledVideoFrameVideo.cancelVideoFrameCallback(
        this.scheduledVideoFrameId
      );
    } else {
      cancelAnimationFrame(this.scheduledVideoFrameId);
    }
    this.scheduledVideoFrameId = undefined;
    this.scheduledVideoFrameVideo = undefined;
  }

  draw(isVideoFrame = false) {
    if (!this.enabled) return;

    const source = this.getSource();
    if (!source) return;

    const isVideo = source.key === 'video';
    const isPlaying = isVideo && !source.elem.paused && !source.elem.ended;

    let alpha = 1;
    if (this.transitionFramesLeft > 0) {
      this.transitionFramesLeft--;
      alpha = this.transitionFramesLeft ? TRANSITION_ALPHA : 1;
    } else if (isVideoFrame && isPlaying) {
      alpha = this.videoFrameAlpha;
    }

    this.drawSource(source, alpha);
    if (isPlaying) this.detectBars(source.elem);

    if (this.transitionFramesLeft > 0) {
      this.scheduleDraw();
    } else if (isPlaying) {
      this.scheduleVideoFrame(source.elem);
    }
  }

  drawSource(source, alpha) {
    const ctx = this.bufferCtx;
    const { width, height } = this.buffer;

    // Crop the source the same way as object-fit: cover does
    let sx = 0;
    let sy = 0;
    let sWidth = source.width;
    let sHeight = source.height;
    if (source.key === 'video') {
      // Leave out the black bars, so that the ambient light continues the
      // colors at the edges of the image instead of the black of the bars
      const { horizontal, vertical } = this.barsClip;
      sx = (sWidth * vertical) / 100;
      sy = (sHeight * horizontal) / 100;
      sWidth -= sx * 2;
      sHeight -= sy * 2;
    } else if (source.fit === 'cover') {
      const scale = Math.max(width / sWidth, height / sHeight);
      sWidth = width / scale;
      sHeight = height / scale;
      sx = (source.width - sWidth) / 2;
      sy = (source.height - sHeight) / 2;
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(source.elem, sx, sy, sWidth, sHeight, 0, 0, width, height);

    for (const layer of this.layers) {
      layer.ctx.drawImage(this.buffer, 0, 0);
    }
  }

  get isBarDetectionEnabled() {
    return (
      this.settings.detectHorizontalBarSizeEnabled ||
      this.settings.detectVerticalBarSizeEnabled
    );
  }

  resetBarDetection() {
    this.barDetection.reset();
    this.barsClip = { horizontal: 0, vertical: 0 };
    this.barDetectionVideoSrc = undefined;
    this.updateLayout();
    this.scheduleDraw();
  }

  // Clips the black bars off the video, so that the ambient light is
  // visible in their place, just like on youtube.com
  updateVideoClip(video) {
    if (!this.enabled || !this.isBarDetectionEnabled) video = undefined;

    if (this.clippedVideoElem && this.clippedVideoElem !== video) {
      this.clippedVideoElem.classList.remove('ytal-music-video-clip');
      this.clippedVideoElem.style.removeProperty('--ytal-music-video-clip');
      this.clippedVideoElem = undefined;
    }
    if (!video) return;

    const { horizontal, vertical } = this.barsClip;
    const clipY = this.settings.detectHorizontalBarSizeEnabled
      ? `calc(${horizontal}% + ${BARS_CLIP_MARGIN}px)`
      : '0%';
    const clipX = this.settings.detectVerticalBarSizeEnabled
      ? `calc(${vertical}% + ${BARS_CLIP_MARGIN}px)`
      : '0%';
    video.style.setProperty('--ytal-music-video-clip', `inset(${clipY} ${clipX})`);
    video.classList.add('ytal-music-video-clip');
    this.clippedVideoElem = video;
  }

  detectBars(video) {
    if (!this.isBarDetectionEnabled) return;

    // The bars can be different in the next video
    if (video.currentSrc !== this.barDetectionVideoSrc) {
      this.resetBarDetection();
      this.barDetectionVideoSrc = video.currentSrc;
    }

    const { settings } = this;
    this.barDetection.detect(
      video,
      settings.detectColoredHorizontalBarSizeEnabled,
      settings.detectHorizontalBarSizeOffsetPercentage,
      settings.detectHorizontalBarSizeEnabled,
      this.barsClip.horizontal,
      settings.detectVerticalBarSizeEnabled,
      this.barsClip.vertical,
      video.videoHeight / video.videoWidth,
      true,
      1,
      20,
      20,
      wrapErrorHandler(function onBarsDetected(horizontal, vertical) {
        const barsClip = {
          horizontal: settings.detectHorizontalBarSizeEnabled
            ? horizontal ?? this.barsClip.horizontal
            : 0,
          vertical: settings.detectVerticalBarSizeEnabled
            ? vertical ?? this.barsClip.vertical
            : 0,
        };
        if (
          barsClip.horizontal === this.barsClip.horizontal &&
          barsClip.vertical === this.barsClip.vertical
        )
          return;

        this.barsClip = barsClip;
        this.updateLayout();
        this.scheduleDraw();
      }.bind(this))
    );
  }

  destroy() {
    this.hide();
    this.barDetection.cancel();
    this.playerObserver.disconnect();
    this.coverObserver.disconnect();
    this.resizeObserver.disconnect();
    off(this.coverContainerElem, 'load', this.onCoverLoad);
    off(this.playerPageElem, 'scroll', this.onScroll);
    off(
      this.playerPageElem,
      'transitionend animationend',
      this.onPlayerPageTransitionEnd
    );
    off(this.playerElem, 'loadeddata seeked playing resize', this.onVideoChange);
    off(document, 'visibilitychange', this.onVisibilityChange);
    this.elem.remove();
  }
}
