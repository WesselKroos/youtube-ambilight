/**
 * Platform abstraction layer.
 *
 * The extension was originally written for YouTube only. Every place where the
 * YouTube DOM contract leaks into the code is funnelled through this module so
 * that the same code base can also drive Bilibili (www.bilibili.com and
 * player.bilibili.com).
 *
 * YouTube markup            | Bilibili markup
 * --------------------------|------------------------------------------------
 * ytd-app                   | #app (div.app-v1)
 * #content.ytd-app          | #mirror-vdcon.video-container-v1
 * ytd-watch-flexy           | #mirror-vdcon.video-container-v1
 * .html5-video-player       | .bpx-player-video-area
 * .html5-video-container    | .bpx-player-video-wrap
 * .ytp-right-controls       | .bpx-player-control-bottom-right
 * #masthead-container       | (none)
 * video.html5-main-video    | .bpx-player-video-area video
 * view class ytp-fullscreen | [data-screen] on .bpx-player-container
 */

export const PLATFORM_YOUTUBE = 'youtube';
export const PLATFORM_BILIBILI = 'bilibili';

export const VIEW_DISABLED = 'DISABLED';
export const VIEW_DETACHED = 'DETACHED';
export const VIEW_SMALL = 'SMALL';
export const VIEW_THEATER = 'THEATER';
export const VIEW_FULLSCREEN = 'FULLSCREEN';
export const VIEW_POPUP = 'POPUP';

const getHostname = () => {
  try {
    return location.hostname || '';
  } catch {
    return '';
  }
};

export const isBilibiliPlatform = /(^|\.)bilibili\.com$/i.test(getHostname());
export const isYouTubePlatform = !isBilibiliPlatform;
export const PLATFORM = isBilibiliPlatform
  ? PLATFORM_BILIBILI
  : PLATFORM_YOUTUBE;

const isYouTubeEmbedPageUrl = () =>
  !!location.pathname?.startsWith('/embed/');

const isYouTubeWatchPageUrl = () =>
  ['/watch', '/live/'].some((path) => location.pathname.startsWith(path)) ||
  isYouTubeEmbedPageUrl();

const BILIBILI_EMBED_PATHS = ['/player.html', '/blackboard/'];
const BILIBILI_WATCH_PATHS = [
  '/video/',
  '/bangumi/play/',
  '/cheese/play/',
  '/medialist/play/',
  '/festival/',
  '/list/',
];

export const isBilibiliEmbedPageUrl = () =>
  BILIBILI_EMBED_PATHS.some((path) => location.pathname?.startsWith(path)) ||
  getHostname() === 'player.bilibili.com';

export const isBilibiliWatchPageUrl = () =>
  BILIBILI_WATCH_PATHS.some((path) => location.pathname?.startsWith(path)) ||
  isBilibiliEmbedPageUrl();

export const isWatchPageUrl = () =>
  isBilibiliPlatform ? isBilibiliWatchPageUrl() : isYouTubeWatchPageUrl();

export const isEmbedPageUrl = () =>
  isBilibiliPlatform ? isBilibiliEmbedPageUrl() : isYouTubeEmbedPageUrl();

/**
 * The shared config. Keep the YouTube entries exactly as they were before the
 * port so YouTube behaviour cannot regress.
 */
const configs = {
  [PLATFORM_YOUTUBE]: {
    name: PLATFORM_YOUTUBE,
    isWatchPageUrl: isYouTubeWatchPageUrl,
    isEmbedPageUrl: isYouTubeEmbedPageUrl,

    appSelectors: ['ytd-app'],
    contentSelectors: ['#content.ytd-app'],
    watchSelectors: ['ytd-watch-flexy', 'ytd-watch-fixie', 'ytd-watch-grid'],
    mastheadSelectors: ['ytd-app #masthead-container'],

    videoSelectors: ['video.html5-main-video'],
    // Used while the extension is not initialised yet (page load / SPA switch)
    watchVideoSelectors: [
      'ytd-app #content.ytd-app ytd-watch-flexy video.html5-main-video',
      'ytd-app #content.ytd-app ytd-watch-fixie video.html5-main-video',
      'ytd-app #content.ytd-app ytd-watch-grid video.html5-main-video',
    ],
    embedVideoSelectors: [
      '#player .html5-video-player .html5-video-container video.html5-main-video',
    ],
    videoPlayerSelectors: ['.html5-video-player'],
    videoContainerSelectors: ['.html5-video-container'],
    playerContainerSelectors: ['#player-container-inner'],
    // The settings menu button is inserted right before this element.
    settingsButtonAnchorSelectors: [
      'ytd-player [data-tooltip-target-id="ytp-autonav-toggle-button"]',
    ],
    settingsMenuBtnParentSelectors: [
      '.ytp-right-controls',
      '.ytp-chrome-controls > *:last-child',
    ],
    // Element whose attribute changes signal a view change.
    viewObserverTargetSelectors: ['.html5-video-player'],
    viewObserverAttributeFilter: ['class'],
    requiresSettingsMenuBtnParent: true,
  },

  [PLATFORM_BILIBILI]: {
    name: PLATFORM_BILIBILI,
    isWatchPageUrl: isBilibiliWatchPageUrl,
    isEmbedPageUrl: isBilibiliEmbedPageUrl,

    appSelectors: ['#app', '#bilibili-player'],
    contentSelectors: [
      '#mirror-vdcon.video-container-v1',
      '.video-container-v1',
      '.bpx-player-container',
      '#bilibili-player',
    ],
    watchSelectors: ['#mirror-vdcon', '.video-container-v1'],
    // The header bar is the element the ambient light has to shine through: it is
    // fixed and paints above the content (z-index 1002), so it covered the light in
    // the top strip of the page. Like YouTube's masthead it is made transparent
    // while the page is at the top (the `at-top` class is toggled by
    // `Ambientlight.updateAtTop()`). It does not exist on the embed player
    // (player.bilibili.com), so it must stay optional.
    mastheadSelectors: ['.bili-header__bar'],
    mastheadOptional: true,

    videoSelectors: ['.bpx-player-video-area video'],
    watchVideoSelectors: ['.bpx-player-video-area video'],
    embedVideoSelectors: ['.bpx-player-video-area video', 'video'],
    videoPlayerSelectors: ['.bpx-player-video-area'],
    videoContainerSelectors: ['.bpx-player-video-wrap'],
    playerContainerSelectors: ['.bpx-player-container'],
    settingsButtonAnchorSelectors: ['.bpx-player-ctrl-setting'],
    settingsMenuBtnParentSelectors: ['.bpx-player-control-bottom-right'],
    viewObserverTargetSelectors: ['.bpx-player-container'],
    viewObserverAttributeFilter: [
      'class',
      'data-screen',
      'data-ctrl-hidden',
    ],
    // The control bar is rendered late (and is re-created when the player
    // switches layout), so a missing parent must not abort the start-up.
    requiresSettingsMenuBtnParent: false,
  },
};

export const platform = configs[PLATFORM];

export const watchSelectors = platform.watchSelectors;

const firstOf = (selectors, root = document) => {
  for (const selector of selectors) {
    const elem = root.querySelector(selector);
    if (elem) return elem;
  }
  return null;
};

const allOf = (selectors, root = document) =>
  selectors.map((selector) => root.querySelector(selector)).filter(Boolean);

export const getSelectorsString = (selectors) => selectors.join(', ');

/** Selector string for the video element while the extension is not initialised. */
export const getWatchVideoSelectorString = () =>
  getSelectorsString(platform.watchVideoSelectors);

/** Selector string for the video element on an embedded player page. */
export const getEmbedVideoSelectorString = () =>
  getSelectorsString(platform.embedVideoSelectors);

/** Selector string for the controls container the settings button mounts into. */
export const getSettingsMenuBtnParentSelectorString = () =>
  platform.settingsMenuBtnParentSelectors
    .map((selector) => `${platform.videoPlayerSelectors[0]} ${selector}`)
    .join(', ');

/** Query a list of selectors and return the first match, or null. */
export const queryFirst = firstOf;
export const queryAll = allOf;

export const getAppElem = () => firstOf(platform.appSelectors);
export const getContentElem = () =>
  firstOf(platform.contentSelectors) ?? document.body;
export const getWatchElem = () => firstOf(platform.watchSelectors);
export const getMastheadElem = () => firstOf(platform.mastheadSelectors);

/** All video elements of the page, in document order. */
export const getVideoElems = () =>
  allOf(platform.videoSelectors).filter(
    (elem, index, list) => list.indexOf(elem) === index
  );

export const getVideoElem = () => getVideoElems()[0] ?? null;

export const closestOf = (elem, selectors) => {
  if (!elem) return null;
  for (const selector of selectors) {
    const found = elem.closest(selector);
    if (found) return found;
  }
  return null;
};

export const getVideoPlayerElem = (videoElem) =>
  closestOf(videoElem, platform.videoPlayerSelectors);

export const getVideoContainerElem = (videoElem) =>
  closestOf(videoElem, platform.videoContainerSelectors);

export const getPlayerContainerElem = (videoElem) =>
  (videoElem && closestOf(videoElem, platform.playerContainerSelectors)) ||
  firstOf(platform.playerContainerSelectors);

/** Element that carries the current view state, used for attribute observers. */
export const getViewObserverElems = (videoPlayerElem) => {
  const elems = allOf(platform.viewObserverTargetSelectors);
  if (videoPlayerElem) {
    for (const selector of platform.viewObserverTargetSelectors) {
      const found = videoPlayerElem.closest(selector);
      if (found) elems.push(found);
    }
  }
  return elems.filter((elem, index, list) => list.indexOf(elem) === index);
};

export const getSettingsMenuBtnParent = (videoPlayerElem) =>
  videoPlayerElem
    ? firstOf(platform.settingsMenuBtnParentSelectors, videoPlayerElem)
    : null;

/**
 * Element the settings button is inserted in front of.
 * Searched in the whole document by default, because the anchor is not always
 * a descendant of the video player element.
 */
export const getSettingsButtonAnchor = (root = document) =>
  firstOf(platform.settingsButtonAnchorSelectors, root);

/** Where the button container should be mounted while being (re)built. */
export const getSettingsButtonAnchorFallback = (videoPlayerElem) =>
  getSettingsButtonAnchor(videoPlayerElem) ||
  getSettingsMenuBtnParent(videoPlayerElem) ||
  videoPlayerElem;

/**
 * Which view is currently active.
 * Returns one of the VIEW_* constants.
 */
export const getView = (instance) => {
  if (!document.contains(instance.videoPlayerElem)) return VIEW_DETACHED;

  if (!isBilibiliPlatform) {
    if (
      document.fullscreenElement ||
      instance.videoPlayerElem.classList.contains('ytp-fullscreen')
    )
      return VIEW_FULLSCREEN;

    if (instance.videoPlayerElem.classList.contains('ytp-player-minimized'))
      return VIEW_POPUP;

    if (
      instance.ytdWatchElemFromVideo
        ? instance.ytdWatchElemFromVideo.getAttribute('theater') != null
        : instance.playerTheaterContainerElemFromVideo
    ) {
      return VIEW_THEATER;
    }

    return VIEW_SMALL;
  }

  const screen =
    getPlayerContainerElem(instance.videoElem)?.getAttribute('data-screen') ||
    null;

  if (document.fullscreenElement || screen === 'full') return VIEW_FULLSCREEN;
  if (screen === 'mini') return VIEW_POPUP;
  if (screen === 'web') return VIEW_FULLSCREEN; // 网页全屏 (web fullscreen)
  if (screen === 'wide') return VIEW_THEATER; // 宽屏 (wide / theater)

  return VIEW_SMALL;
};

/**
 * Bilibili keeps the video element inside a plain <video> element. The legacy
 * "bwp-video" custom element uses a closed shadow root, so its frames cannot be
 * read at all.
 */
export const isUnsupportedVideoElem = (videoElem) =>
  isBilibiliPlatform && !!videoElem && videoElem.tagName === 'BWP-VIDEO';

/** CSS selector list for the "is there a video on the page" checks. */
export const getVideoSelectorString = () =>
  getSelectorsString(platform.videoSelectors);

export const getContentSelectorString = () =>
  getSelectorsString(platform.contentSelectors);

export const getWatchSelectorString = () =>
  getSelectorsString(platform.watchSelectors);
