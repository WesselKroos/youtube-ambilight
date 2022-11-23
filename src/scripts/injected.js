import { $, on, off, requestIdleCallback, wrapErrorHandler, isWatchPageUrl, setErrorHandler, raf } from './libs/generic'
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

const errorEvents = new ErrorEvents()

const detectDetachedVideo = (ytdAppElem) => {
  const observer = new MutationObserver(wrapErrorHandler(function detectDetachedVideo(mutationsList, observer) {
    if (!isWatchPageUrl()) return

    const isDetached = (
      !ambientlight.videoElem ||
      !ytdAppElem?.contains(ambientlight.videoElem)
    )
    if (!isDetached) {
      if(errorEvents.list.length) {
        errorEvents.list = []
      }
      return
    }

    const newYtdAppElem = document.querySelector('ytd-app') 
    if(newYtdAppElem !== ytdAppElem) {
      const details = {
        newYtdAppElemContainsAmbientlightVideoElem: newYtdAppElem?.contains(ambientlight.videoElem),
        oldYtdAppElemContainsAmbientlightVideoElem: ytdAppElem?.contains(ambientlight.videoElem),
        'ambientlight.videoElem': getNodeTreeString(ambientlight.videoElem),
        tree: getSelectorTreeString('video,#player-container')
      }
      errorEvents.add('detectDetachedVideo | ytd-app element changed', details)
      return
    }

    const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
    if (!videoElem) {
      const ytPlayerManagerVideoElem = document.querySelector('yt-player-manager video.html5-main-video')
      const ytdMiniplayerVideoElem = document.querySelector('ytd-miniplayer video.html5-main-video')
      const playerApiVideoElem = document.querySelector('#player-api video.html5-main-video')
      const outsideYtdAppVideoElem = document.querySelector('body > *:not(ytd-app) video.html5-main-video, body > video.html5-main-video')
      if(ytPlayerManagerVideoElem || ytdMiniplayerVideoElem || playerApiVideoElem || outsideYtdAppVideoElem) {
        return
      }

      const details = {
        documentContainsAmbientlightVideoElem: document.contains(ambientlight.videoElem),
        'ambientlight.videoElem': getNodeTreeString(ambientlight.videoElem),
        tree: getSelectorTreeString('video,#player-container')
      }
      errorEvents.add('detectDetachedVideo | video detached and found no new video in ytd-watch-flexy, yt-player-manager, ytd-miniplayer, #player-api or outside ytd-app', details)
      return
    }

    if(ambientlight.videoElem !== videoElem) {
      ambientlight.initVideoElem(videoElem)
      ambientlight.initVideoListeners()
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

let initializingAmbientlight = false
const tryInitAmbientlight = async () => {
  if (!isWatchPageUrl()) return

  const ytdAppElem = $.s('ytd-app')
  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if (!videoElem) {
    const ytPlayerManagerVideoElem = document.querySelector('yt-player-manager video.html5-main-video')
    if(ytPlayerManagerVideoElem) {
      // errorEvents.add('tryInit | video in yt-player-manager')
      return false
    }
    const ytdMiniplayerVideoElem = document.querySelector('ytd-miniplayer video.html5-main-video')
    if(ytdMiniplayerVideoElem) {
      // errorEvents.add('tryInitAmbientlight | video in ytd-miniplayer')
      return false
    }
    const playerApiVideoElem = document.querySelector('#player-api video.html5-main-video')
    if(playerApiVideoElem) {
      // errorEvents.add('tryInitAmbientlight | video in #player-api')
      return false
    }
    const outsideYtdAppVideoElem = document.querySelector('body > *:not(ytd-app) video.html5-main-video, body > video.html5-main-video')
    if(outsideYtdAppVideoElem) {
      // errorEvents.add('tryInitAmbientlight | video outside ytd-app, probably moved by another extension')
      return false
    }
      
    errorEvents.add('tryInitAmbientlight | no video in ytd-watch-flexy, yt-player-manager, ytd-miniplayer, #player-api or outside ytd-app', {
      tree: getSelectorTreeString('video,#player-container')
    })
    return false
  }
  
  window.ambientlight = await new Ambientlight(ytdAppElem, videoElem)

  errorEvents.list = []
  detectDetachedVideo(ytdAppElem)
  detectPageTransitions(ytdAppElem)
  if(!window.ambientlight.isOnVideoPage) {
    detectWatchPageVideo(ytdAppElem);
  }
  return true
}

const getWatchPageViewObserver = (function initGetWatchPageViewObserver() {
  let observer;
  return function getWatchPageViewObserver(ytdAppElem) {
    if(!observer) {
      observer = new MutationObserver(wrapErrorHandler(
        function watchPageViewObserved(mutationsList, observer) {
          startIfWatchPageHasVideo(ytdAppElem)
        }
      ))
    }
    return observer;
  }
})();
const detectWatchPageVideo = (ytdAppElem) => {
  getWatchPageViewObserver(ytdAppElem).observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}
const startIfWatchPageHasVideo = (ytdAppElem) => {
  if (!isWatchPageUrl() || window.ambientlight.isOnVideoPage) {
    getWatchPageViewObserver().disconnect()
    return
  }

  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if(!videoElem) return

  getWatchPageViewObserver().disconnect()
  window.ambientlight.isOnVideoPage = true
  window.ambientlight.start()
}

const detectPageTransitions = (ytdAppElem) => {
  on(document, 'yt-navigate-finish', function onYtNavigateFinish() {
    getWatchPageViewObserver(ytdAppElem).disconnect()
    if(isWatchPageUrl()) {
      startIfWatchPageHasVideo(ytdAppElem)
      if(!window.ambientlight.isOnVideoPage) {
        detectWatchPageVideo(ytdAppElem)
      }
    } else {
      if(window.ambientlight.isOnVideoPage) {
        window.ambientlight.isOnVideoPage = false
        window.ambientlight.hide()
      }
    }
  }, undefined, undefined, true);
}

const loadAmbientlight = async () => {
  // Validate YouTube desktop web app
  const ytdAppElem = $.s('ytd-app')
  if(!ytdAppElem) {
    const appElems = [...$.sa('body > *')]
      .filter(function getAppElems(elem) {
        return (elem.tagName.endsWith('-APP') && elem.tagName !== 'YTVP-APP' && elem.tagName !== 'YTCP-APP' && ! elem.tagName !== 'YTLR-APP')
      })
    if(appElems.length) {
      const selectorTree = getSelectorTreeString(appElems.map(elem => elem.tagName).join(','))
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
          while(tryAgain) {
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