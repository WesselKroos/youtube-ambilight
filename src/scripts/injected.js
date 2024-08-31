import {
  raf,
  setErrorHandler,
  setStyleProperty,
  watchSelectors,
  wrapErrorHandler,
} from './libs/generic';
import { contentScript } from './libs/messaging/content';
import SentryReporter, {
  setCrashOptions,
  setVersion,
} from './libs/sentry-reporter';

setErrorHandler((ex) => SentryReporter.captureException(ex));

wrapErrorHandler(function initVersionAndCrashOptions() {
  const version = document.currentScript?.getAttribute('data-version') || '';
  setVersion(version);
  const options = JSON.parse(
    document.currentScript?.getAttribute('data-crash-options')
  );
  setCrashOptions(options);
  contentScript.addMessageListener(
    'crashOptions',
    (newCrashOptions) => {
      setCrashOptions(newCrashOptions);
    },
    true
  );
})();

const getElem = (() => {
  const elems = {};
  return (name) => {
    if (!elems[name]?.isConnected)
      elems[name] = document.querySelector(`[data-ytal-elem="${name}"]`);
    return elems[name];
  };
})();

function updateTheme(toDark) {
  document.documentElement.toggleAttribute('dark', toDark);

  const ytdAppElem = getElem('ytd-app');
  if (ytdAppElem?.setMastheadTheme) {
    ytdAppElem.setMastheadTheme();
  }
}

contentScript.addMessageListener(
  'update-theme',
  function onUpdateTheme(toDark) {
    const start = performance.now();

    updateTheme(toDark);

    contentScript.postMessage('updated-theme');
    performance.measure('update-theme', { start, end: performance.now() });
  }
);

function updateImmersiveMode(enable, skipVideoPlayerSetSize = false) {
  const html = document.documentElement;
  const enabled = html.getAttribute('data-ambientlight-immersive') != null;
  html.toggleAttribute('data-ambientlight-immersive', enable);

  if (!skipVideoPlayerSetSize && enabled !== enable) videoPlayerSetSize();
}

contentScript.addMessageListener(
  'update-immersive-mode',
  function onUpdateImmersiveMode(enable) {
    const start = performance.now();

    updateImmersiveMode(enable);

    contentScript.postMessage('update-immersive-mode');
    performance.measure('update-immersive-mode', {
      start,
      end: performance.now(),
    });
  }
);

contentScript.addMessageListener(
  'set-live-chat-theme',
  function seLiveChatTheme(toDark) {
    const liveChatElem = getElem('live-chat');
    if (!liveChatElem) return;

    liveChatElem.postToContentWindow({
      'yt-live-chat-set-dark-theme': toDark,
    });
  }
);

contentScript.addMessageListener('is-hdr-video', function isHdrVideo() {
  const videoPlayerElem = getElem('video-player');
  const isHdr = videoPlayerElem?.getVideoData?.()?.isHdr ?? false;
  contentScript.postMessage('is-hdr-video', isHdr);
});

function videoPlayerSetSize(messageId) {
  const videoPlayerElem = getElem('video-player');
  if (videoPlayerElem) {
    try {
      videoPlayerElem.setSize();
      videoPlayerElem.setInternalSize();
    } catch (ex) {
      console.warn(
        `Failed to resize the video player${
          ex?.message ? `: ${ex?.message}` : ''
        }`
      );
    }
  }
  contentScript.postMessage('sizes-changed', messageId);
}

contentScript.addMessageListener(
  'video-player-set-size',
  function onVideoPlayerSetSize(id) {
    const start = performance.now();

    videoPlayerSetSize(id);

    performance.measure('video-player-set-size', {
      start,
      end: performance.now(),
    });
  }
);

contentScript.addMessageListener(
  'show',
  function show({
    ytdAppElemBackground,
    toDark,
    hideScrollbar,
    relatedScrollbar,
    immersiveMode,
  }) {
    const start = performance.now();

    const mastheadElem = getElem('ytd-app #masthead-container');
    if (mastheadElem) mastheadElem.classList.add('no-animation');

    const ytdAppElem = getElem('ytd-app');
    const playerTheaterContainerElem = getElem(
      watchSelectors
        .map((selector) => `${selector} #full-bleed-container`)
        .join(', ')
    );

    // Temporary backgrounds
    if (playerTheaterContainerElem) {
      setStyleProperty(
        playerTheaterContainerElem,
        'background',
        'none',
        'important'
      );
    }
    if (ytdAppElem)
      setStyleProperty(
        ytdAppElem,
        'background',
        ytdAppElemBackground,
        'important'
      );

    const html = document.documentElement;
    if (hideScrollbar)
      html.toggleAttribute('data-ambientlight-hide-scrollbar', true);
    if (relatedScrollbar)
      html.toggleAttribute('data-ambientlight-related-scrollbar', true);
    if (immersiveMode) updateImmersiveMode(true, true);

    updateTheme(toDark);

    // await new Promise((resolve) => raf(resolve));
    // // eslint-disable-next-line no-unused-vars
    // const _1 = videoElem.clientWidth;
    html.toggleAttribute('data-ambientlight-enabled', true);

    videoPlayerSetSize();

    // Restore default backgrounds
    if (playerTheaterContainerElem)
      playerTheaterContainerElem.style.background = '';
    if (ytdAppElem) ytdAppElem.style.background = '';

    if (mastheadElem) mastheadElem.classList.remove('no-animation');

    performance.measure('show (injected)', {
      start,
      end: performance.now(),
    });

    contentScript.postMessage('show');
  }
);

contentScript.addMessageListener('hide', function hide({ toDark }) {
  const start = performance.now();

  const mastheadElem = getElem('ytd-app #masthead-container');
  if (mastheadElem) mastheadElem.classList.add('no-animation');

  const html = document.documentElement;
  html.toggleAttribute('data-ambientlight-enabled', false);

  html.toggleAttribute('data-ambientlight-hide-scrollbar', false);
  html.toggleAttribute('data-ambientlight-related-scrollbar', false);

  updateImmersiveMode(false, true);

  updateTheme(toDark);

  videoPlayerSetSize();

  if (mastheadElem) mastheadElem.classList.remove('no-animation');

  performance.measure('hide (injected)', {
    start,
    end: performance.now(),
  });

  contentScript.postMessage('hide');
});

contentScript.addMessageListener(
  'video-player-update-video-data-keywords',
  function videoPlayerUpdateVideoDataKeywords(keywords) {
    const videoPlayerElem = getElem('video-player');
    if (!videoPlayerElem) return;

    videoPlayerElem.updateVideoData({ keywords });
  }
);

contentScript.addMessageListener(
  'video-player-reload-video-by-id',
  function videoPlayerReloadVideoById() {
    const videoPlayerElem = getElem('video-player');
    if (videoPlayerElem) {
      const id = videoPlayerElem.getVideoData()?.video_id;
      if (id) videoPlayerElem.loadVideoById(id); // Refreshes auto quality setting range above 480p
    }
    contentScript.postMessage('video-player-reload-video-by-id');
  }
);

let videoObserver;
let videoObserverElem;
contentScript.addMessageListener(
  'apply-chromium-bug-1142112-workaround',
  function applyChromiumBug1142112Workaround() {
    try {
      const videoElem = getElem('video');
      if (videoObserverElem === videoElem) return;

      if (videoObserver) {
        videoObserver.disconnect();
        videoObserver = undefined;
      }
      videoObserverElem = videoElem;
      if (!videoElem || videoElem.ambientlightGetVideoPlaybackQuality) return;

      let videoIsHidden = false; // IntersectionObserver is always executed at least once when the observation starts
      let videoVisibilityChangeTime;
      videoObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (videoObserverElem !== entry.target) continue;
            videoIsHidden = entry.intersectionRatio === 0;
            videoVisibilityChangeTime = performance.now();
          }
        },
        {
          rootMargin: '-70px 0px 0px 0px', // masthead height (56px) + additional pixel to be safe
          threshold: 0.0001, // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        }
      );
      videoObserver.observe(videoElem);

      Object.defineProperty(videoElem, 'ambientlightGetVideoPlaybackQuality', {
        value: videoElem.getVideoPlaybackQuality,
      });

      let previousDroppedVideoFrames = 0;
      let droppedVideoFramesCorrection = 0;
      let previousTime = performance.now();

      videoElem.getVideoPlaybackQuality = function () {
        // Use scoped properties instead of this from here on
        const original = videoElem.ambientlightGetVideoPlaybackQuality();
        let droppedVideoFrames = original.droppedVideoFrames;
        if (droppedVideoFrames < previousDroppedVideoFrames) {
          previousDroppedVideoFrames = 0;
          droppedVideoFramesCorrection = 0;
        }
        // Ignore dropped frames for 2 seconds due to requestVideoFrameCallback dropping frames when the video is offscreen
        if (videoIsHidden || videoVisibilityChangeTime > previousTime - 2000) {
          droppedVideoFramesCorrection +=
            droppedVideoFrames - previousDroppedVideoFrames;
        }
        previousDroppedVideoFrames = droppedVideoFrames;
        droppedVideoFrames = Math.max(
          0,
          droppedVideoFrames - droppedVideoFramesCorrection
        );
        previousTime = performance.now();
        return {
          corruptedVideoFrames: original.corruptedVideoFrames,
          creationTime: original.creationTime,
          droppedVideoFrames,
          totalVideoFrames: original.totalVideoFrames,
        };
      };
    } catch (ex) {
      console.warn(
        'Failed to apply getVideoPlaybackQuality workaround. Continuing ambientlight initialization...'
      );
      SentryReporter.captureException(ex);
    }
  }.bind(this)
);
