import { $, on, off, requestIdleCallback, wrapErrorHandler } from './libs/generic'
import AmbilightSentry, { getSelectorTreeString, getNodeTreeString, AmbilightError } from './libs/ambilight-sentry'
import { isWatchPageUrl } from './libs/utils'
import ErrorEvents from './libs/error-events'
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
      const details = {
        documentContainsAmbilightVideoElem: document.contains(ambilight.videoElem),
        'ambilight.videoElem': getNodeTreeString(ambilight.videoElem),
        tree: getSelectorTreeString('video,#player-container')
      }
      errorEvents.add('detectDetachedVideo | video detached and no new video', details)
      return
    }

    ambilight.initVideoElem(videoElem)
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

const tryInitAmbilight = (ytdAppElem) => {
  if (!isWatchPageUrl()) return

  const videoElem = ytdAppElem.querySelector('ytd-watch-flexy video.html5-main-video')
  if (!videoElem) {
    const ytPlayerManagerVideoElem = ytdAppElem.querySelector('yt-player-manager video.html5-main-video')
    if(ytPlayerManagerVideoElem) {
      // console.warn('Ambient light for YouTube™ | Waiting for the video to transition from the player-api')
      // console.log(playerApiElem.cloneNode(true))
      errorEvents.add('tryInit | video in yt-player-manager')
      return false
    }
    const ytdMiniplayerVideoElem = ytdAppElem.querySelector('ytd-miniplayer video.html5-main-video')
    if(ytdMiniplayerVideoElem) {
      // console.warn('Ambient light for YouTube™ | Waiting for the video to transition from the miniplayer')
      errorEvents.add('tryInitAmbilight | video in ytd-miniplayer')
      return false
    }
    const playerApiElem = document.querySelector('#player-api video.html5-main-video')
    if(playerApiElem) {
      errorEvents.add('tryInitAmbilight | video in #player-api')
      return false
    }
    // console.warn('Ambient light for YouTube™ | Waiting for the video to be created in ytd-app')
    errorEvents.add('tryInitAmbilight | no video in ytd-app ytd-watch-flexy', {
      tree: getSelectorTreeString('video,#player-container')
    })
    return false
  }
  
  window.ambilight = new Ambilight(ytdAppElem, videoElem)

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
  const navigationManager = document.querySelector('yt-navigation-manager')
  on(navigationManager, 'yt-navigate-finish', () => {
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

const loadAmbilight = () => {
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

  if (tryInitAmbilight(ytdAppElem)) return
  // Not on the watch page yet

  // Listen to DOM changes
  const observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => {
    if (window.ambilight) {
      observer.disconnect()
      return
    }

    try {
      if (tryInitAmbilight(ytdAppElem)) {
        // Initialized
        observer.disconnect()
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

const onLoad = () => requestIdleCallback(function onLoad() {
  if(window.ambilight) return
    
  loadAmbilight()
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
