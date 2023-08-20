import { on, wrapErrorHandler, isWatchPageUrl, setErrorHandler } from './libs/generic'
import SentryReporter, { getSelectorTreeString, getNodeTreeString, AmbientlightError, ErrorEvents, setVersion, setCrashOptions } from './libs/sentry-reporter'
import Ambientlight from './libs/ambientlight'
import { contentScript } from './libs/messaging'
import Settings from './libs/settings'

setErrorHandler((ex) => SentryReporter.captureException(ex))

wrapErrorHandler(function initVersionAndCrashOptions() {
  const version = document.currentScript?.getAttribute('data-version') || ''
  setVersion(version)
  const options = JSON.parse(document.currentScript?.getAttribute('data-crash-options'))
  setCrashOptions(options)
  contentScript.addMessageListener('crashOptions', newCrashOptions => {
    setCrashOptions(newCrashOptions)
  }, true)
})()

let errorEvents;
wrapErrorHandler(function initErrorEvents() {
  errorEvents = new ErrorEvents()
})()

const getOtherUnknownAppElems = () => 
  [...document.querySelectorAll('body > *')]
    .filter(function getAppElems(elem) {
      return (
        elem.tagName.endsWith('-APP') && 
        ![
          'YTD-APP', 'YTVP-APP', 'YTCP-APP', 'YTLR-APP', 'DAILY-COMPANION-APP'
        ].includes(elem.tagName)
      )
    });

const logErrorEventWithPageTrees = (message, details = {}) => {
  if (!isWatchPageUrl()) return
  if (isVideoInKnownInvalidLocation()) return

  const allSelector = 'html, body, ytd-app, ytd-watch-flexy, #player-container, ytd-player, #container.ytd-player, .html5-video-player, .html5-video-container, video, .video-stream, .html5-main-video';
  const otherAppElems = getOtherUnknownAppElems()

  details = {
    ...details,
    counts: allSelector.split(',').reduce((counts, selector) => {
      selector = selector.trim()
      counts[selector] = document.querySelectorAll(selector).length
      return counts
    }, {}),
    otherApps: otherAppElems.map(elem => elem.tagName),
    otherAppsTree: otherAppElems.length > 0 ? getSelectorTreeString(otherAppElems.map(elem => elem.tagName).join(',')) : undefined,
    bodyTree: getSelectorTreeString('body'),
    ytdAppTree: getSelectorTreeString('ytd-app'),
    ytdWatchFlexyTree: getSelectorTreeString('ytd-watch-flexy'),
    ytdPlayerTree: getSelectorTreeString('ytd-player'),
    ΩTree: getSelectorTreeString(allSelector),
  }

  errorEvents.add(message, details)
}

const isVideoInKnownInvalidLocation = () => {
  const ytdAppPlayerVideoElem = document.querySelector('ytd-app > #container.ytd-player video.html5-main-video')
  const playerApiVideoElem = document.querySelector('#player-api video.html5-main-video')
  const ytPlayerManagerVideoElem = document.querySelector('yt-player-manager video.html5-main-video')
  const ytdInlinePreviewPlayerVideoElem = document.querySelector('#inline-preview-player video.html5-main-video')
  const ytdMiniplayerVideoElem = document.querySelector('ytd-miniplayer video.html5-main-video')
  const channelPlayerVideoElem = document.querySelector('ytd-channel-video-player-renderer video.html5-main-video')
  const outsideYtdAppVideoElem = document.querySelector('html > *:not(body) video.html5-main-video, body > *:not(ytd-app) video.html5-main-video, body > video.html5-main-video')
  return !!(ytdAppPlayerVideoElem || playerApiVideoElem || ytPlayerManagerVideoElem || ytdInlinePreviewPlayerVideoElem || ytdMiniplayerVideoElem || channelPlayerVideoElem || outsideYtdAppVideoElem)
}

const detectDetachedVideo = () => {
  const observer = new MutationObserver(wrapErrorHandler(function detectDetachedVideo() {
    if (!isWatchPageUrl()) return

    const videoElem = ambientlight.videoElem
    const ytdAppElem = ambientlight.ytdAppElem

    const isDetached = (
      !videoElem ||
      !ytdAppElem?.contains(videoElem) ||
      !document.contains(ytdAppElem)
    )
    if (!isDetached) {
      if(errorEvents.list.length) {
        errorEvents.list = []
      }
      return
    }

    if(!document.querySelector('video')) return

    const newVideoElem = document.querySelector('ytd-app ytd-watch-flexy video.html5-main-video')
    if (!newVideoElem) {
      logErrorEventWithPageTrees('detectDetachedVideo')
      return
    }
    
    const newYtdAppElem = newVideoElem.closest('ytd-app')
    if(newYtdAppElem !== ytdAppElem) {
      const details = {
        documentHasOldVideo: document.contains(videoElem),
        documentHasOldYtdApp: document.contains(ytdAppElem),
        htmlHasOldVideo: document.documentElement?.contains(videoElem),
        htmlHasOldYtdApp: document.documentElement?.contains(ytdAppElem),
        newYtdAppHasOldVideo: newYtdAppElem?.contains(videoElem),
        oldYtdAppHasOldVideo: ytdAppElem?.contains(videoElem),
        oldYtdAppTree: getNodeTreeString(ytdAppElem),
        oldVideoTree: getNodeTreeString(videoElem)
      }
      logErrorEventWithPageTrees('detectDetachedYtdApp', details)
      return // We do not support this, because if we do we have to move or re-create the settings menu, canvasses and other elements as well
    }


    if(videoElem !== newVideoElem) {
      ambientlight.initVideoElem(newVideoElem)
    }
    
    ambientlight.start()

    if(errorEvents.list.length) {
      errorEvents.list = []
    }
  }, true))

  observer.observe(document, {
    attributes: false,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false,
    childList: true,
    subtree: true
  })
}

const tryInitAmbientlight = async () => {
  if (window.ambientlight) return true
  if (!isWatchPageUrl()) return
  if(!document.querySelector('video')) return

  const videoElem = document.querySelector('ytd-app ytd-watch-flexy video.html5-main-video')
  if (!videoElem) {
    logErrorEventWithPageTrees('initialize - not found yet: ytd-app ytd-watch-flexy video.html5-main-video')
    return
  }

  const ytdAppElem = document.querySelector('ytd-app')
  if(!ytdAppElem) {
    logErrorEventWithPageTrees('initialize - not found yet: ytd-app')
    return
  }

  const ytdWatchFlexyElem = document.querySelector('ytd-app ytd-watch-flexy')
  if(!ytdWatchFlexyElem) {
    logErrorEventWithPageTrees('initialize - not found yet: ytd-watch-flexy')
    return
  }

  const mastheadElem = document.querySelector('ytd-app #masthead-container')
  if(!mastheadElem) {
    logErrorEventWithPageTrees('initialize - not found yet: #masthead-container')
    return
  }
  
  window.ambientlight = await new Ambientlight(ytdAppElem, ytdWatchFlexyElem, videoElem, mastheadElem)

  errorEvents.list = []
  detectDetachedVideo()
  detectPageTransitions(ytdAppElem)
  if(!window.ambientlight.isOnVideoPage) {
    detectWatchPageVideo(ytdAppElem);
  }
  return true
}

const getWatchPageViewObserver = (function initGetWatchPageViewObserver() {
  let observer;
  return function getWatchPageViewObserver() {
    if(!observer) {
      observer = new MutationObserver(wrapErrorHandler(function watchPageViewObserved() {
        startIfWatchPageHasVideo()
      }))
    }
    return observer;
  }
})();
const detectWatchPageVideo = (ytdAppElem) => {
  getWatchPageViewObserver().observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}
const startIfWatchPageHasVideo = () => {
  if (!isWatchPageUrl() || window.ambientlight.isOnVideoPage) {
    getWatchPageViewObserver().disconnect()
    return
  }

  const videoElem = document.querySelector('ytd-app ytd-watch-flexy video.html5-main-video')
  if(!videoElem) return

  getWatchPageViewObserver().disconnect()
  window.ambientlight.isOnVideoPage = true
  window.ambientlight.start()
}

const detectPageTransitions = (ytdAppElem) => {
  on(document, 'yt-navigate-finish', async function onYtNavigateFinish() {
    getWatchPageViewObserver().disconnect()
    if(isWatchPageUrl()) {
      startIfWatchPageHasVideo()
      if(!window.ambientlight.isOnVideoPage) {
        detectWatchPageVideo(ytdAppElem)
      }
    } else {
      if(window.ambientlight.isOnVideoPage) {
        window.ambientlight.isOnVideoPage = false
        await window.ambientlight.hide()
      }
    }
  }, undefined, undefined, true);
}

const loadAmbientlight = async () => {
  // Validate YouTube desktop web app
  const ytdAppElem = document.querySelector('ytd-app')
  if(!ytdAppElem) {
    const otherAppElems = getOtherUnknownAppElems()
    if(otherAppElems.length) {
      const selectorTree = getSelectorTreeString(otherAppElems.map(elem => elem.tagName).join(','))
      throw new AmbientlightError('Found one or more *-app elements but cannot find desktop app element: ytd-app', selectorTree)
    }
    return
  }

  if (await tryInitAmbientlight()) return
  // Not on the watch page yet

  try {
    await Settings.getStoredSettingsCached()
  } catch(ex) {
    console.warn('Ambient light for YouTube™ | The settings cannot be precached')
    console.error(ex)
  }

  // Listen to DOM changes
  let initializing = false
  let tryAgain = true
  const observer = new MutationObserver(wrapErrorHandler(
    async function ytdAppObserved(mutationsList, observer) {
      if (initializing) {
        tryAgain = true
        return
      }

      if (window.ambientlight) {
        observer.disconnect()
        return
      }

      initializing = true
      try {
        if (await tryInitAmbientlight()) {
          // Initialized
          observer.disconnect()
        } else {
          while(tryAgain && !window.ambientlight) {
            tryAgain = false
            if(await tryInitAmbientlight()) {
              // Initialized
              observer.disconnect()
              tryAgain = false
            }
          }
          initializing = false
        }
      } catch (ex) {
        // Disconnect to prevent infinite loops
        observer.disconnect()
        throw ex
      }
    },
    true
  ))
  observer.observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}

const onLoad = wrapErrorHandler(async function onLoadCallback() {
  if(window.ambientlight) return

  await loadAmbientlight()
})

;(function setup() {
  try {
    onLoad()
  } catch (ex) {
    SentryReporter.captureException(ex)
  }
})()