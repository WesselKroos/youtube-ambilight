import {
  on,
  wrapErrorHandler,
  isWatchPageUrl,
  setErrorHandler,
  watchSelectors,
  isEmbedPageUrl,
  setWarning,
  off,
} from './libs/generic';
import { ErrorEvents } from './libs/errors/events';
import {
  getNodeTreeString,
  getOtherUnknownAppElems,
  getPageElems,
  getSelectorTreeString,
} from './libs/errors/dom';
import { AmbientlightError } from './libs/errors/ambient-light-error';
import SentryReporter, {
  setVersion,
  setCrashOptions,
} from './libs/errors/sentry-reporter';
import Ambientlight from './libs/ambientlight';
import Settings from './libs/settings';
import { contentScript } from './libs/messaging/content';
import { getVersion } from './libs/utils';
import { defaultCrashOptions, storage } from './libs/storage';
import {
  isBilibiliPlatform,
  platform,
  getAppElem,
  getContentElem,
  getWatchElem,
  getMastheadElem,
  getVideoElem,
  getSelectorsString,
  getSettingsMenuBtnParentSelectorString,
  getWatchVideoSelectorString,
  getEmbedVideoSelectorString,
} from './libs/platform';

setErrorHandler((ex) => SentryReporter.captureException(ex));

wrapErrorHandler(async function initVersionAndCrashOptions() {
  const version = getVersion(); // document.currentScript?.getAttribute('data-version') || ''
  setVersion(version);
  // const options = JSON.parse(document.currentScript?.getAttribute('data-crash-options'))
  const crashOptions =
    (await storage.get('crashOptions')) || defaultCrashOptions;
  setCrashOptions(crashOptions);
  contentScript.addMessageListener('crashOptions', (newCrashOptions) => {
    setCrashOptions(newCrashOptions);
  });

  storage.addListener(function storageListener(changes) {
    if (!changes.crashOptions?.newValue) return;

    const crashOptions = changes.crashOptions.newValue;
    setCrashOptions(crashOptions);
  });
})();

let errorEvents;
wrapErrorHandler(function initErrorEvents() {
  errorEvents = new ErrorEvents();
})();

const logErrorEventWithPageTrees = (message, details = {}) => {
  if (!isWatchPageUrl()) return;
  if (isVideoInKnownInvalidLocation()) return;

  details = {
    ...details,
    ...getPageElems(),
  };

  errorEvents.add(message, details);
};

const isVideoInKnownInvalidLocation = () => {
  const ytdAppPlayerVideoElem = () => document.querySelector(
    'ytd-app > #container.ytd-player video.html5-main-video'
  );
  const playerApiVideoElem = () => document.querySelector(
    '#player-api video.html5-main-video'
  );
  const ytPlayerManagerVideoElem = () => document.querySelector(
    'yt-player-manager video.html5-main-video'
  );
  const ytdInlinePreviewPlayerVideoElem = () => document.querySelector(
    '#inline-preview-player video.html5-main-video'
  );
  const ytdBrowseVideoElem = () => document.querySelector(
    'ytd-browse video.html5-main-video'
  );
  const ytdMiniplayerVideoElem = () => document.querySelector(
    'ytd-miniplayer video.html5-main-video'
  );
  const channelPlayerVideoElem = () => document.querySelector(
    'ytd-channel-video-player-renderer video.html5-main-video'
  );
  const isInShorts = () => document.querySelector(
    'ytd-shorts video.html5-main-video'
  );
  const isControlledByAnotherExtension = () => document.querySelector(
    '.html5-video-container video.stefanvdvideotop'
  );
  const outsideYtdAppVideoElem = () => document.querySelector(
    'html > *:not(body) video.html5-main-video, body > *:not(ytd-app) video.html5-main-video, body > video.html5-main-video'
  );
  return !!(
    ytdAppPlayerVideoElem() ||
    playerApiVideoElem() ||
    ytPlayerManagerVideoElem() ||
    ytdInlinePreviewPlayerVideoElem() ||
    ytdBrowseVideoElem() ||
    ytdMiniplayerVideoElem() ||
    channelPlayerVideoElem() ||
    isInShorts() ||
    isControlledByAnotherExtension() ||
    outsideYtdAppVideoElem()
  );
};

const detectDetachedVideo = () => {
  const observer = new MutationObserver(
    wrapErrorHandler(async function detectDetachedVideo() {
      if (!isWatchPageUrl()) return;

      onUrlChanged();

      const videoElem = ambientlight.videoElem;
      const ytdAppElem = ambientlight.ytdAppElem ?? document.body;

      const isDetached =
        !videoElem ||
        !ytdAppElem?.contains(videoElem) ||
        !document.contains(ytdAppElem) ||
        (isBilibiliPlatform &&
          !document.contains(ambientlight.videoPlayerElem));
      if (!isDetached) {
        if (errorEvents.list.length) {
          errorEvents.list = [];
        }
        return;
      }

      if (!document.querySelector('video')) return;

      const newVideoElem = isBilibiliPlatform
        ? getVideoElem()
        : document.body !== ytdAppElem
        ? document.querySelector(getWatchVideoSelectorString())
        : ytdAppElem.querySelector('video.html5-main-video');
      if (!newVideoElem) {
        logErrorEventWithPageTrees('detectDetachedVideo');
        return;
      }

      if (isBilibiliPlatform) {
        // Bilibili replaces its player element and its whole app element (#app)
        // when its client side rendering has finished (and when the player is
        // re-created), which detaches everything we injected. Re-bind the
        // existing instance to the new page elements.
        await ambientlight.rebindPageElems(newVideoElem);
        if (errorEvents.list.length) {
          errorEvents.list = [];
        }
        return;
      }

      if (document.body !== ytdAppElem) {
        const newYtdAppElem = newVideoElem.closest('ytd-app');
        if (newYtdAppElem !== ytdAppElem) {
          const details = {
            documentHasOldVideo: document.contains(videoElem),
            documentHasOldYtdApp: document.contains(ytdAppElem),
            htmlHasOldVideo: document.documentElement?.contains(videoElem),
            htmlHasOldYtdApp: document.documentElement?.contains(ytdAppElem),
            newYtdAppHasOldVideo: newYtdAppElem?.contains(videoElem),
            oldYtdAppHasOldVideo: ytdAppElem?.contains(videoElem),
            oldYtdAppTree: getNodeTreeString(ytdAppElem),
            oldVideoTree: getNodeTreeString(videoElem),
          };
          logErrorEventWithPageTrees('detectDetachedYtdApp', details);
          return; // We do not support this, because if we do we have to move or re-create the settings menu, canvasses and other elements as well
        }
      }

      if (videoElem !== newVideoElem) {
        ambientlight.initVideoElem(newVideoElem);
      }

      ambientlight.start();

      if (errorEvents.list.length) {
        errorEvents.list = [];
      }
    }, true)
  );

  observer.observe(document, {
    attributes: false,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: true,
    subtree: true,
  });
};

const waitForVideoInteraction = async (videoElem) => {
  if (videoElem.readyState > 2 && !videoElem.paused && !videoElem.ended) return;

  await new Promise((resolve, reject) => {
    try {
      const onInteraction = () => {
        off(videoElem, 'playing', onInteraction);
        off(window, 'click', onInteraction);
        resolve();
      };
      on(videoElem, 'playing', onInteraction, { once: true });
      on(window, 'click', onInteraction, { once: true });
    } catch (ex) {
      reject(ex);
    }
  });
};

const tryInitAmbientlight = async () => {
  if (window.ambientlight) return true;
  if (!isWatchPageUrl()) return;
  if (!document.querySelector('video')) return;

  const settingsMenuBtnParentSelector =
    getSettingsMenuBtnParentSelectorString();
  const hasSettingsMenuBtnParent =
    !platform.requiresSettingsMenuBtnParent ||
    !!document.querySelector(settingsMenuBtnParentSelector);
  if (!hasSettingsMenuBtnParent) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${settingsMenuBtnParentSelector}`
    );
    return;
  }

  if (isEmbedPageUrl()) {
    const embedVideoSelector = getEmbedVideoSelectorString();
    const videoElem = document.querySelector(embedVideoSelector);
    if (!videoElem) {
      logErrorEventWithPageTrees(
        `initialize - not found yet: ${embedVideoSelector}`
      );
      return;
    }

    await waitForVideoInteraction(videoElem);
    if (!document.body?.contains(videoElem)) return;

    window.ambientlight = await new Ambientlight(videoElem);

    errorEvents.list = [];
    detectDetachedVideo();
    return true;
  }

  const watchVideoSelector = getWatchVideoSelectorString();
  const videoElem = document.querySelector(watchVideoSelector);
  if (!videoElem) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${watchVideoSelector}`
    );
    return;
  }

  const ytdAppElem = getAppElem();
  if (!ytdAppElem) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${getSelectorsString(
        platform.appSelectors
      )}`
    );
    return;
  }

  const contentElem = getContentElem();
  if (!contentElem) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${getSelectorsString(
        platform.contentSelectors
      )}`
    );
    return;
  }

  const ytdWatchElem = getWatchElem();
  if (!ytdWatchElem) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${getSelectorsString(
        platform.watchSelectors
      )}`
    );
    return;
  }

  // The masthead is optional and does not exist on every platform
  const mastheadElem = getMastheadElem();
  if (
    !mastheadElem &&
    platform.mastheadSelectors.length &&
    !platform.mastheadOptional
  ) {
    logErrorEventWithPageTrees(
      `initialize - not found yet: ${getSelectorsString(
        platform.mastheadSelectors
      )}`
    );
    return;
  }
  window.ambientlight = await new Ambientlight(
    videoElem,
    ytdAppElem,
    ytdWatchElem,
    mastheadElem
  );

  errorEvents.list = [];
  detectDetachedVideo();
  detectPageTransitions(ytdAppElem);
  if (!window.ambientlight.isOnVideoPage) {
    detectWatchPageVideo(ytdAppElem);
  }

  return true;
};

const getWatchPageViewObserver = (function initGetWatchPageViewObserver() {
  let observer;
  return function getWatchPageViewObserver() {
    if (!observer) {
      observer = new MutationObserver(
        wrapErrorHandler(function watchPageViewObserved() {
          startIfWatchPageHasVideo();
        }, true)
      );
    }
    return observer;
  };
})();
const detectWatchPageVideo = (ytdAppElem) => {
  getWatchPageViewObserver().observe(ytdAppElem, {
    childList: true,
    subtree: true,
  });
};
const startIfWatchPageHasVideo = () => {
  if (!isWatchPageUrl() || window.ambientlight.isOnVideoPage) {
    getWatchPageViewObserver().disconnect();
    return;
  }

  const videoElem = document.querySelector(getWatchVideoSelectorString());
  if (!videoElem) return;

  getWatchPageViewObserver().disconnect();
  window.ambientlight.isOnVideoPage = true;
  window.ambientlight.start();
};

// Bilibili is a single page application too, but it does not dispatch a
// navigation event that a content script can observe. The URL is therefore
// compared on every DOM change (see detectDetachedVideo) and on history
// navigation.
let lastUrl = location.href;
const onUrlChanged = wrapErrorHandler(async function onUrlChanged() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;

  getWatchPageViewObserver().disconnect();
  if (isWatchPageUrl()) {
    startIfWatchPageHasVideo();
    if (!window.ambientlight.isOnVideoPage) {
      detectWatchPageVideo(getAppElem() ?? document.body);
    }
  } else {
    if (window.ambientlight.isOnVideoPage) {
      window.ambientlight.isOnVideoPage = false;
      await window.ambientlight.hide();
    }
  }
}, true);

const detectPageTransitions = (ytdAppElem) => {
  if (isBilibiliPlatform) {
    on(window, 'popstate', onUrlChanged, undefined, true);
    return;
  }

  on(
    document,
    'yt-navigate-finish',
    async function onYtNavigateFinish() {
      getWatchPageViewObserver().disconnect();
      if (isWatchPageUrl()) {
        startIfWatchPageHasVideo();
        if (!window.ambientlight.isOnVideoPage) {
          detectWatchPageVideo(ytdAppElem);
        }
      } else {
        if (window.ambientlight.isOnVideoPage) {
          window.ambientlight.isOnVideoPage = false;
          await window.ambientlight.hide();
        }
      }
    },
    undefined,
    true
  );
};

const loadAmbientlight = async () => {
  // Mobile player
  if (document.querySelector('#player-control-container')) return;

  // Validate the desktop web app or the embedded page
  let observerTarget = getAppElem();
  if (!observerTarget) {
    if (isEmbedPageUrl()) {
      observerTarget = document.documentElement;
    } else {
      const otherAppElems = getOtherUnknownAppElems();
      if (otherAppElems.length) {
        const selectorTree = getSelectorTreeString(
          otherAppElems.map((elem) => elem.tagName).join(',')
        );
        throw new AmbientlightError(
          `Found one or more *-app elements but cannot find desktop app element: ${getSelectorsString(
            platform.appSelectors
          )}`,
          selectorTree
        );
      }
      return;
    }
  }

  if (await tryInitAmbientlight()) return;
  // Not on the watch page yet

  try {
    await Settings.getStoredSettingsCached();
  } catch (ex) {
    setWarning(
      `Your previous settings cannot be loaded. Refresh the webpage to try it again. ${'\n'}This can happen after you have updated the extension. ${'\n\n'}${ex?.toString()}`
    );

    if (
      !(
        ex.message === 'uninstalled' ||
        ex.message?.includes('QuotaExceededError')
      )
    ) {
      console.error(ex);
    }
  }

  // Listen to DOM changes
  let initializing = false;
  let tryAgain = true;
  const observer = new MutationObserver(
    wrapErrorHandler(async function ytdAppObserved(mutationsList, observer) {
      if (initializing) {
        tryAgain = true;
        return;
      }

      if (window.ambientlight) {
        observer.disconnect();
        return;
      }

      initializing = true;
      try {
        if (await tryInitAmbientlight()) {
          // Initialized
          observer.disconnect();
        } else {
          while (tryAgain && !window.ambientlight) {
            tryAgain = false;
            if (await tryInitAmbientlight()) {
              // Initialized
              observer.disconnect();
              tryAgain = false;
            }
          }
          initializing = false;
        }
      } catch (ex) {
        // Disconnect to prevent infinite loops
        observer.disconnect();
        throw ex;
      }
    }, true)
  );
  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
  });
};

const onLoad = wrapErrorHandler(async function onLoadCallback() {
  if (window.ambientlight !== undefined) return;

  window.ambientlight = false;
  await loadAmbientlight();
});

(function setup() {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onLoad, { once: true });
    } else {
      onLoad();
    }
  } catch (ex) {
    SentryReporter.captureException(ex);
  }
})();
