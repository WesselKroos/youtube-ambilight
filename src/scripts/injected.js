import { setErrorHandler, setStyleProperty } from './libs/generic';
import { contentScript } from './libs/messaging/content';

let reporting = false; // Prevent infinite loops
setErrorHandler((ex) => {
  if (reporting) return;

  try {
    reporting = true;
    contentScript.postMessage('error', {
      name: ex.name,
      message: ex.message,
      stack: ex.stack,
      details: ex.details,
    });
  } catch (reportEx) {
    console.warn('Failed to report error:', ex, 'innerError:', reportEx);
  } finally {
    reporting = false;
  }
});

const getElem = (() => {
  const elems = {};
  return (name) => {
    if (!elems[name]?.isConnected) {
      if (elems[name] && !elems[name].isConnected) {
        elems[name].dataset.ytalElem = name;
      }
      elems[name] = document.querySelector(`[data-ytal-elem="${name}"]`);
      if (elems[name]) {
        delete elems[name].dataset.ytalElem;
      }
    }
    return elems[name];
  };
})();

// YouTube web component wrappers (yt-attributed-string, yt-page-header-renderer,
// yt-lockup-view-model) stamp inline color styles from server styleRuns or from
// ytcfg INNERTUBE_CONTEXT.client.userInterfaceTheme. Toggling html[dark] does not
// update those inline colors, so the watch page description keeps near-black
// light-theme text on the dark background.
const webComponentWrapperSelector =
  'yt-attributed-string, yt-page-header-renderer, yt-lockup-view-model';
const ytThemeValue = (toDark) =>
  toDark ? 'USER_INTERFACE_THEME_DARK' : 'USER_INTERFACE_THEME_LIGHT';

let lastRenderedWebComponentTheme = null;
let nativeWebComponentTheme = null;
let webComponentObserver = null;

function renderWebComponentWrapper(element, lateStamped) {
  const { data } = element.rawProps ?? {};
  if (
    !element.isWebComponentWrapper ||
    data == null ||
    typeof element.render !== 'function'
  )
    return;

  // Re-rendering a wrapper that contains a video element recreates the <video>,
  // which re-initializes its GPU compositor layer over the masthead
  if (element.querySelector('video')) return;

  if (element.localName === 'yt-attributed-string' && typeof data === 'function') {
    // fontColor styleRuns are server-set for the theme the page was requested
    // with and ignore ytcfg; inherit the colors from the CSS cascade instead
    element.rawProps.linkInheritColor = () => true;
    element.rawProps.noStyleRuns = () => true;
  } else if (lateStamped) {
    // Late-stamped wrappers already rendered with the updated ytcfg theme
    return;
  } else if (
    typeof data === 'function' &&
    element.localName !== 'yt-page-header-renderer' &&
    element.localName !== 'yt-lockup-view-model'
  ) {
    // Re-rendering other function-typed wrappers (button shapes, subscribe and
    // notification renderers) duplicates their structure
    return;
  }

  element.replaceChildren();
  element.render();
}

// ytd-watch-metadata stamps the --yt-saturated-* hover palette (used by the
// description box and the views/date line on hover) via updateHoverColor(),
// which reads its isDark property only at initialization
function updateSaturatedColors(element, toDark) {
  if (!('isDark' in element) || typeof element.set !== 'function') return;
  element.set('isDark', toDark);
  element.updateHoverColor?.();
}

// Components such as yt-chip-cloud-renderer, ytd-watch-flexy, yt-icon and
// yt-formatted-string each carry an independent isDarkTheme Polymer property
// that is only set when they are stamped. Elements inside ytd-shorts always
// receive isDarkTheme=true: the Shorts stage has a hardcoded dark background,
// so its overlay elements need dark-mode styling in both themes
function updateIsDarkTheme(element, toDark) {
  if (!('isDarkTheme' in element) || typeof element.set !== 'function') return;
  element.set('isDarkTheme', element.closest('ytd-shorts') ? true : toDark);
}

// colorData elements (like ytd-expandable-metadata-renderer) apply their
// inline --yt-lightsource-* and --yt-basic-* variables through dataChanged(),
// which reads isDarkTheme() only at data-init time. dataChanged() calls
// isDarkTheme as a function while polymerController exposes it as a getter,
// so it is temporarily shadowed with a function
function updateColorDataElement(element, toDark) {
  const { polymerController } = element;
  if (!polymerController?.dataChanged) return;

  // dataChanged() may asynchronously reload a video player (like a channel
  // trailer); re-pause videos that were paused when playback resumes
  const pausedVideos = [...element.querySelectorAll('video')].filter(
    (video) => video.paused
  );
  const ownDescriptor = Object.getOwnPropertyDescriptor(
    polymerController,
    'isDarkTheme'
  );
  polymerController.isDarkTheme = () => toDark;
  polymerController.dataChanged();
  delete polymerController.isDarkTheme;
  if (ownDescriptor) {
    Object.defineProperty(polymerController, 'isDarkTheme', ownDescriptor);
  }
  for (const video of pausedVideos) {
    video.addEventListener(
      'play',
      () => video.closest('.html5-video-player')?.pauseVideo(),
      { once: true }
    );
  }
}

function onWebComponentMutations(mutations) {
  const toDark = lastRenderedWebComponentTheme === ytThemeValue(true);
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const elements = [node, ...node.querySelectorAll('*')];
      // Polymer setters run before the wrapper re-renders: they can re-stamp
      // yt-attributed-string contents, which would undo an earlier render
      for (const element of elements) {
        if (element.localName === 'ytd-watch-metadata') {
          updateSaturatedColors(element, toDark);
        }
        updateIsDarkTheme(element, toDark);
      }
      for (const element of elements) {
        if (element.matches(webComponentWrapperSelector)) {
          renderWebComponentWrapper(element, true);
        }
      }
    }
  }
}

function updateWebComponentColors(toDark) {
  const theme = ytThemeValue(toDark);
  const client = window.ytcfg?.get?.('INNERTUBE_CONTEXT')?.client;
  if (client) {
    if (nativeWebComponentTheme === null) {
      nativeWebComponentTheme =
        client.userInterfaceTheme ?? ytThemeValue(false);
    }
    client.userInterfaceTheme = theme;
  }

  if (lastRenderedWebComponentTheme !== theme) {
    lastRenderedWebComponentTheme = theme;
    // Polymer setters run before the wrapper re-renders: they can re-stamp
    // yt-attributed-string contents, which would undo an earlier render
    for (const element of document.querySelectorAll('*')) {
      if (element.localName === 'ytd-watch-metadata') {
        updateSaturatedColors(element, toDark);
      }
      updateColorDataElement(element, toDark);
      updateIsDarkTheme(element, toDark);
    }
    for (const element of document.querySelectorAll(
      webComponentWrapperSelector
    )) {
      renderWebComponentWrapper(element, false);
    }
  }

  // While the theme differs from the one the page was rendered with, wrappers
  // stamped after this toggle (the description stamps seconds later) still carry
  // stale server styleRun colors and must be re-rendered as they appear
  if (theme !== nativeWebComponentTheme) {
    if (!webComponentObserver) {
      webComponentObserver = new MutationObserver(onWebComponentMutations);
      webComponentObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  } else if (webComponentObserver) {
    webComponentObserver.disconnect();
    webComponentObserver = null;
  }
}

function updateTheme(toDark) {
  // YouTube's CSS uses :root defaults and [dark] / [light] attribute
  // selectors for its hashed CSS custom properties, so both attributes must
  // be managed together. Without [light] a page that YouTube rendered in dark
  // mode keeps its dark text colors after the dark attribute is removed
  document.documentElement.toggleAttribute('dark', toDark);
  document.documentElement.toggleAttribute('light', !toDark);

  const ytdAppElem = getElem('ytd-app');
  if (ytdAppElem?.setMastheadTheme) {
    ytdAppElem.setMastheadTheme();
  }

  updateWebComponentColors(toDark);
}

// After each SPA navigation YouTube stamps new elements and refreshes reused
// ones with data from the navigation response, which carries the styleRuns of
// YouTube's own theme. The childList observer cannot see refreshed elements,
// so the full traversal must run again on the new page
document.addEventListener('yt-navigate-finish', function onNavigateFinish() {
  if (lastRenderedWebComponentTheme === null) return;
  if (lastRenderedWebComponentTheme === nativeWebComponentTheme) return;

  const toDark = document.documentElement.hasAttribute('dark');
  lastRenderedWebComponentTheme = null;
  updateWebComponentColors(toDark);
});

contentScript.addMessageListener(
  'update-theme',
  function onUpdateTheme(toDark) {
    updateTheme(toDark);
    contentScript.postMessage('update-theme');
  }
);

const updateImmersiveMode = function updateImmersiveMode(
  enable,
  skipVideoPlayerSetSize = false
) {
  const html = document.documentElement;
  const enabled = html.getAttribute('data-ambientlight-immersive') != null;
  if (enabled === enable) return;

  const scroll = {
    x: window.scrollX,
    y: window.scrollY,
  };

  html.toggleAttribute('data-ambientlight-immersive', enable);
  const shift = enable ? 29 : -29;
  if (scroll.y > 50 && scroll.y < 100) {
    window.scrollTo(scroll.x, (scroll.y += shift));
  }

  const ytdApp = getElem('ytd-app');
  if (ytdApp?.mastheadHeight) {
    ytdApp.mastheadHeight += shift;
    ytdApp.updateMastheadCssHeight?.();
  }

  if (!skipVideoPlayerSetSize && enabled !== enable) videoPlayerSetSize();
};

contentScript.addMessageListener(
  'update-immersive-mode',
  function onUpdateImmersiveMode(enable) {
    updateImmersiveMode(enable);
    contentScript.postMessage('update-immersive-mode');
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
  'player-storyboard-format',
  function playerStoryboardSpec() {
    const player = getElem('video-player');
    const format = player?.getStoryboardFormat?.();
    contentScript.postMessage('player-storyboard-format', format);
  }
);

function videoPlayerSetSize() {
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
  contentScript.postMessage('sizes-changed');
}

contentScript.addMessageListener(
  'video-player-set-size',
  function onVideoPlayerSetSize() {
    videoPlayerSetSize();
    contentScript.postMessage('video-player-set-size');
  }
);

let vrVideoCtx;
let vrVideoCtxDrawArrays;
const drawVR = (...args) => {
  const result = vrVideoCtxDrawArrays.bind(vrVideoCtx)(...args);
  contentScript.postMessage('next-vr-frame');
  return result;
};

contentScript.addMessageListener('init-vr-video', function initVrVideo() {
  const vrVideoElem = getElem('vr-video');
  vrVideoCtx = vrVideoElem.getContext('webgl');
  if (vrVideoCtx) {
    if (vrVideoCtx.drawArrays !== drawVR) {
      vrVideoCtxDrawArrays = vrVideoCtx.drawArrays;
      vrVideoCtx.drawArrays = drawVR;
    }
  }
});

contentScript.addMessageListener('dispose-vr-video', function disposeVrVideo() {
  if (!vrVideoCtx) return;

  vrVideoCtx.drawArrays = vrVideoCtxDrawArrays;
  vrVideoCtx = undefined;
});

contentScript.addMessageListener(
  'show',
  function show({
    ytdAppElemBackground,
    toDark,
    hideScrollbar,
    relatedScrollbar,
    immersiveMode,
  }) {
    const mastheadElem = getElem('masthead');
    if (mastheadElem) mastheadElem.classList.add('no-animation');

    const ytdAppElem = getElem('ytd-app');
    // const playerTheaterContainerElem = getElem(
    //   watchSelectors
    //     .map((selector) => `${selector} #full-bleed-container`)
    //     .join(', ')
    // );

    // Temporary backgrounds
    // if (playerTheaterContainerElem) {
    //   setStyleProperty(
    //     playerTheaterContainerElem,
    //     'background',
    //     'none',
    //     'important'
    //   );
    // }
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
    // if (playerTheaterContainerElem)
    //   playerTheaterContainerElem.style.background = '';
    if (ytdAppElem) ytdAppElem.style.background = '';

    if (mastheadElem) mastheadElem.classList.remove('no-animation');
    contentScript.postMessage('show');
  }
);

contentScript.addMessageListener('hide', function hide({ toDark }) {
  const mastheadElem = getElem('masthead');
  if (mastheadElem) mastheadElem.classList.add('no-animation');

  const html = document.documentElement;
  html.toggleAttribute('data-ambientlight-enabled', false);

  html.toggleAttribute('data-ambientlight-hide-scrollbar', false);
  html.toggleAttribute('data-ambientlight-related-scrollbar', false);

  updateImmersiveMode(false, true);

  updateTheme(toDark);

  videoPlayerSetSize();

  if (mastheadElem) mastheadElem.classList.remove('no-animation');
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
      throw ex;
    }
  }.bind(this)
);
