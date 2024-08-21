import { setErrorHandler, wrapErrorHandler } from './libs/generic';
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

contentScript.addMessageListener(
  'set-masthead-theme',
  function setMastheadTheme() {
    const ytdAppElem = getElem('ytd-app');
    if (!ytdAppElem) return;

    ytdAppElem.setMastheadTheme();
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

contentScript.addMessageListener(
  'video-player-set-size',
  function videoPlayerSetSize() {
    const videoPlayerElem = getElem('video-player');
    if (!videoPlayerElem) return;

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
    contentScript.postMessage('sizes-changed');
  }
);

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
