import { $, on, off, requestIdleCallback, wrapErrorHandler, isWatchPageUrl } from './libs/generic'
import AmbilightSentry, { getSelectorTreeString, getNodeTreeString, AmbilightError, ErrorEvents } from './libs/ambilight-sentry'
import Ambilight from './libs/ambilight'

const errorEvents = new ErrorEvents()

const ambilightDetectDetachedVideo = (ytdAppElem) => {
  const observer = new MutationObserver(wrapErrorHandler(function detectDetachedVideo(mutationsList, observer) {
    if (!isWatchPageUrl()) return

    const isDetached = (!ambilight.videoElem || !ambilight.ytdWatchFlexyElem.contains(ambilight.videoElem))
    if (!isDetached) {
      if(errorEvents.list.length) {
        errorEvents.list = []
      }
      return
    }

    const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
    if (!videoElem) {
      const ytPlayerManagerVideoElem = ytdAppElem.querySelector('yt-player-manager video.html5-main-video')
      const ytdMiniplayerVideoElem = ytdAppElem.querySelector('ytd-miniplayer video.html5-main-video')
      const playerApiVideoElem = document.querySelector('#player-api video.html5-main-video')
      if(ytPlayerManagerVideoElem || ytdMiniplayerVideoElem || playerApiVideoElem) {
        return
      }

      const details = {
        documentContainsAmbilightVideoElem: document.contains(ambilight.videoElem),
        'ambilight.videoElem': getNodeTreeString(ambilight.videoElem),
        tree: getSelectorTreeString('video,#player-container')
      }
      errorEvents.add('detectDetachedVideo | video detached and found no new video in ytd-watch-flexy, yt-player-manager, ytd-miniplayer, #player-api', details)
      return
    }

    if(ambilight.videoElem !== videoElem) {
      ambilight.initVideoElem(videoElem)
      ambilight.initVideoListeners()
    }
    ambilight.start()

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

let initializingAmbilight = false
const tryInitAmbilight = async () => {
  if (!isWatchPageUrl()) return

  const ytdAppElem = $.s('ytd-app')
  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if (!videoElem) {
    const ytPlayerManagerVideoElem = ytdAppElem.querySelector('yt-player-manager video.html5-main-video')
    if(ytPlayerManagerVideoElem) {
      // errorEvents.add('tryInit | video in yt-player-manager')
      return false
    }
    const ytdMiniplayerVideoElem = ytdAppElem.querySelector('ytd-miniplayer video.html5-main-video')
    if(ytdMiniplayerVideoElem) {
      // errorEvents.add('tryInitAmbilight | video in ytd-miniplayer')
      return false
    }
    const playerApiVideoElem = document.querySelector('#player-api video.html5-main-video')
    if(playerApiVideoElem) {
      // errorEvents.add('tryInitAmbilight | video in #player-api')
      return false
    }
    errorEvents.add('tryInitAmbilight | no video in ytd-watch-flexy, yt-player-manager, ytd-miniplayer, #player-api', {
      tree: getSelectorTreeString('video,#player-container')
    })
    return false
  }
  
  window.ambilight = await new Ambilight(ytdAppElem, videoElem)

  errorEvents.list = []
  ambilightDetectDetachedVideo(ytdAppElem)
  ambilightDetectPageTransitions(ytdAppElem)
  if(!window.ambilight.isOnVideoPage) {
    ambilightDetectWatchPageVideo(ytdAppElem);
  }
  return true
}

const getWatchPageViewObserver = (() => {
  let observer;
  return (ytdAppElem) => {
    if(!observer) {
      observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => 
        ambilightStartIfWatchPageHasVideo(ytdAppElem)
      ))
    }
    return observer;
  }
})();
const ambilightDetectWatchPageVideo = (ytdAppElem) => {
  getWatchPageViewObserver(ytdAppElem).observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}
const ambilightStartIfWatchPageHasVideo = (ytdAppElem) => {
  if (!isWatchPageUrl() || window.ambilight.isOnVideoPage) {
    getWatchPageViewObserver().disconnect()
    return
  }

  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if(!videoElem) return

  getWatchPageViewObserver().disconnect()
  window.ambilight.isOnVideoPage = true
  window.ambilight.start()
}

const ambilightDetectPageTransitions = (ytdAppElem) => {
  on(document, 'yt-navigate-finish', () => {
    getWatchPageViewObserver(ytdAppElem).disconnect()
    if(isWatchPageUrl()) {
      ambilightStartIfWatchPageHasVideo(ytdAppElem)
      if(!window.ambilight.isOnVideoPage) {
        ambilightDetectWatchPageVideo(ytdAppElem)
      }
    } else {
      if(window.ambilight.isOnVideoPage) {
        window.ambilight.isOnVideoPage = false
        window.ambilight.hide()
      }
    }
  }, undefined, undefined, true);
}

const loadAmbilight = async () => {
  // Validate YouTube desktop web app
  const ytdAppElem = $.s('ytd-app')
  if(!ytdAppElem) {
    const appElems = [...$.sa('body > *')]
      .filter(elem => elem.tagName.endsWith('-APP') && elem.tagName !== 'YTVP-APP')
    if(appElems.length) {
      const selectorTree = getSelectorTreeString(appElems.map(elem => elem.tagName).join(','))
      throw new AmbilightError('Found one or more *-app elements but cannot find desktop app element: ytd-app', selectorTree)
    }
    return
  }

  if (await tryInitAmbilight()) return
  // Not on the watch page yet

  // Listen to DOM changes
  let initializing = false
  let tryAgain = true
  const observer = new MutationObserver(wrapErrorHandler(async (mutationsList, observer) => {
    if (initializing) {
      tryAgain = true
      return
    }

    if (window.ambilight) {
      observer.disconnect()
      return
    }

    initializing = true
    try {
      if (await tryInitAmbilight()) {
        // Initialized
        observer.disconnect()
      } else {
        while(tryAgain) {
          tryAgain = false
          if(await tryInitAmbilight()) {
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
  }, true))
  observer.observe(ytdAppElem, {
    childList: true,
    subtree: true
  })
}

const onLoad = () => requestIdleCallback(async function onLoadIdleCallback() {
  if(window.ambilight) return

  await loadAmbilight()
}, { timeout: 5000 })

try {
  if(document.readyState === 'complete') {
    onLoad()
  } else {
    window.addEventListener('load', onLoad)
  }
} catch (ex) {
  AmbilightSentry.captureExceptionWithDetails(ex)
}
