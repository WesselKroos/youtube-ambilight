import { $, html, setErrorHandler, uuidv4 } from "./generic";
import { BrowserClient } from '@sentry/browser/esm/client';
import {
  captureException,
  withScope,
  initAndBind
} from "@sentry/core";


export const getNodeTree = (elem) => {
  const nodes = [];
  nodes.push(elem);
  while(elem.parentNode) {
    nodes.unshift(elem.parentNode);
    elem = elem.parentNode;
  }
  return nodes.map(node => node.cloneNode(false).outerHTML).join('\n')
}

export const getVideosNodeTree = () => [...$.sa('video')]
  .reduce((obj, elem, i) => {
    obj[`»('video')[${i}].nodeTree`] = getNodeTree(elem)
    return obj
  }, {})

export const getPlayerContainersNodeTree = () => [...$.sa('#player-container')]
  .reduce((obj, elem, i) => {
    obj[`»('#player-container')[${i}].nodeTree`] = getNodeTree(elem)
    return obj
  }, {})

initAndBind(BrowserClient, {
  dsn: 'https://a3d06857fc2d401690381d0878ce3bc3@sentry.io/1524536',
  defaultIntegrations: false,
  release: html.getAttribute('data-ambilight-version') || '?',
  attachStacktrace: true,
  beforeSend: (event) => {
    try {
      event.request = {
        url: (!navigator.doNotTrack) ? location.href : '?', // Respect DoNotTrack
        headers: {
          "User-Agent": navigator.userAgent // Add UserAgent
        }
      };
      // Normalize stacktrace domain of all browsers
      for(const value of event.exception.values) {
        if(value.stacktrace && value.stacktrace.frames) {
          for(const frame of value.stacktrace.frames) {
            frame.filename = frame.filename.replace(/[a-z]+?-extension:\/\/[a-z|0-9|-]+?\//g, 'extension://')
            frame.filename = frame.filename.replace(/\/[a-z|0-9]+?\/jsbin\//g, '/_hash_/jsbin/')
            frame.filename = frame.filename.replace(/\/s\/player\/[a-z|0-9]+?\//g, '/s/player/_hash_/')
          }
        }
      }
    } catch (ex) { console.warn(ex) }
    return event
  }
})

let sessionId;
export default class AmbilightSentry {
  static captureExceptionWithDetails(ex) {

    try {
      // Include stack trace in report (ex.name = 'SecurityError')
      if (ex.stack && (
        Object.prototype.toString.call(ex) === '[object DOMException]' ||
        Object.prototype.toString.call(ex) === '[object DOMError]'
      )) {
        const exWithStack = new Error(ex.message)
        exWithStack.code = ex.code
        exWithStack.stack = ex.stack
        exWithStack.name = ex.name
        ex = exWithStack
      }
    } catch (ex) { console.warn(ex) }

    console.error('YouTube Ambilight | ', ex)

    withScope(scope => {
      try {
        let userId = localStorage.getItem('ambilight-crash-reporter-id')
        if(!userId) {
          userId = uuidv4()
          localStorage.setItem('ambilight-crash-reporter-id', userId)
        }
        scope.setUser({ id: userId })
      } catch { console.warn(ex) }

      try {
        if(!sessionId) {
          sessionId = uuidv4()
        }
        scope.setTag('session', sessionId)
      } catch { console.warn(ex) }

      const setExtra = (name, value) => {
        try {
          scope.setExtra(name, (value === undefined) ? null : value)
        } catch (ex) { console.warn(ex) }
      }

      try {
        if(ex && ex.details) {
          setExtra('Exception details', ex.details)
        }
      } catch (ex) {
        setExtra('Exception details (exception)', ex)
      }

      try {
        setExtra('Window', {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio,
          fullscreen: document.fullscreen
        })
      } catch (ex) {
        setExtra('Window (exception)', ex)
      }

      try {
        if (window.screen) {
          setExtra('Screen', {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth
          })
        }
      } catch (ex) {
        setExtra('Screen (exception)', ex)
      }

      try {
        setExtra('YouTube', {
          dark: !!(html.attributes.dark || {}).value,
          lang: (html.attributes.lang || {}).value,
          loggedIn: !!$.s('#avatar-btn')
        })
      } catch (ex) {
        setExtra('YouTube (exception)', ex)
      }

      const pageExtra = {}
      try {
        pageExtra.isVideo = (location.pathname == '/watch')
      } catch (ex) {
        setExtra('Page .isVideo (exception)', ex)
      }
      try {
        pageExtra.isYtdApp = !!$.s('ytd-app')
      } catch (ex) { 
        setExtra('Page .isYtdApp (exception)', ex)
      }
      setExtra('Page', pageExtra)

      try {
        if (!navigator.doNotTrack) {
          setExtra('Video ID', $.s('ytd-watch-flexy').attributes['video-id']?.value)
        }
      } catch (ex) {
        setExtra('Video ID (exception)', ex)
      }

      try {
        setExtra('Video elements', $.sa('video').length)
      } catch (ex) { 
        setExtra('Video elements (exception)', ex)
      }

      try {
        const videoPlayerElem = $.s('#movie_player')
        if (videoPlayerElem) {
          const stats = videoPlayerElem.getStatsForNerds()
          const relevantStats = ['bandwidth_kbps', 'buffer_health_seconds', 'codecs', 'color', 'dims_and_frames', 'drm', 'resolution']
          Object.keys(stats).forEach(key => {
            if(!relevantStats.includes(key))
              delete stats[key]
          })
          setExtra('Player', stats)
        }
      } catch (ex) { 
        setExtra('Player (exception)', ex)
      }

      let ambilightExtra = {}
      try {
        ambilightExtra.initialized = (typeof ambilight !== 'undefined')
        if (typeof ambilight !== 'undefined') {
          ambilightExtra.now = performance.now()
          const keys = [
            'ambilightFrameCount',
            'videoFrameCount',
            'ambilightVideoDroppedFrameCount',
            'droppedVideoFramesCorrection',
            'ambilightFrameRate',
            'videoFrameRate',
            'displayFrameRate',
            'previousDrawTime',
            'previousFrameTime',
            'buffersCleared',
            'sizesInvalidated',
            'delayedCheckVideoSizeAndPosition',
            'requestVideoFrameCallbackId',
            'videoFrameCallbackReceived',
            'scheduledNextFrame',
            'scheduledHandleVideoResize',
            'view',
            'isOnVideoPage',
            'atTop',
            'isFillingFullscreen',
            'isHidden',
            'videoIsHidden',
            'isAmbilightHiddenOnWatchPage',
            'isVideoHiddenOnWatchPage',
            'isBuffering',
            'isVR',
            'srcVideoOffset.top',
            'srcVideoOffset.width',
            'srcVideoOffset.height',
            'videoOffset.left',
            'videoOffset.top',
            'videoOffset.width',
            'videoOffset.height',
            'p.w',
            'p.h',
            'enableChromiumBug1092080Workaround',
            'enableChromiumBug1123708Workaround',
            'enableChromiumBug1142112Workaround',
            'enableMozillaBug1606251Workaround',
            'getImageDataAllowed',
          ]
          keys.forEach(key => {
            let value = ambilight
            key.split('.').forEach(key => value = value[key]) // Find multi depth values
            ambilightExtra[key] = value
          })
        }
        setExtra('Ambilight', ambilightExtra)
      } catch (ex) {
        setExtra('Ambilight (exception)', ex)
      }

      try {
        if (typeof ambilight !== 'undefined') {
          // settings
          const settingsExtra = {}
          ;(ambilight.settings || []).forEach(setting => {
            if (!setting || !setting.name) return
            settingsExtra[setting.name] = setting.value
            if (!setting.key) return
            settingsExtra[`${setting.name}-key`] = setting.key
          })
          setExtra('Ambilight settings', settingsExtra)
        }
      } catch (ex) { 
        setExtra('Ambilight settings (exception)', ex)
      }

      captureException(ex)
      scope.clear()
    })
  }
}

setErrorHandler((ex) => AmbilightSentry.captureExceptionWithDetails(ex))