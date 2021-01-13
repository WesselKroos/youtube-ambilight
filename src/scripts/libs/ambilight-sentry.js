import { $, html, setErrorHandler, uuidv4 } from "./generic";
import { BrowserClient } from '@sentry/browser/esm/client';
import {
  captureException,
  withScope,
  initAndBind
} from "@sentry/core";

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
          setExtra('details', ex.details)
        }
      } catch (ex) {
        setExtra('details.exception', ex)
      }

      try {
        setExtra('window', {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio,
          fullscreen: document.fullscreen
        })
      } catch (ex) {
        setExtra('window.exception', ex)
      }

      try {
        if (window.screen) {
          setExtra('screen', {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth
          })
        }
      } catch (ex) {
        setExtra('screen.exception', ex)
      }

      try {
        setExtra('youtube', {
          dark: !!(html.attributes.dark || {}).value,
          lang: (html.attributes.lang || {}).value,
          loggedIn: !!$.s('#avatar-btn')
        })
      } catch (ex) {
        setExtra('youtube.exception', ex)
      }

      const pageExtra = {}
      try {
        pageExtra.isVideo = (location.pathname == '/watch')
      } catch (ex) {
        setExtra('pageExtra.isVideo.exception', ex)
      }
      try {
        pageExtra.isYtdApp = !!$.s('ytd-app')
      } catch (ex) { 
        setExtra('pageExtra.isYtdApp.exception', ex)
      }
      setExtra('page', pageExtra)

      try {
        if (!navigator.doNotTrack) {
          setExtra('videoId', $.s('ytd-watch-flexy').attributes['video-id'].value)
        }
      } catch (ex) {
        setExtra('videoId.exception', ex)
      }
      try {
        if(window.currentVideoInfo) {
          setExtra('videoMimeType', window.currentVideoInfo.mimeType)
        }
      } catch (ex) {
        setExtra('videoMimeType.exception', ex)
      }

      try {
        const videoElem = $.s('video')
        if (videoElem) {
          let keys = []
          for(let i = 0, obj = videoElem; i <= 1; i++) {
            obj = Object.getPrototypeOf(obj)
            keys = keys.concat(Object.getOwnPropertyNames(obj))
          }

          let videoElemInfo = {}
          keys.filter(key => 
              key.indexOf('on') !== 0 && 
              key.indexOf('__') !== 0 && 
              key.indexOf('constructor') !== 0 &&
              typeof videoElem[key] !== 'function')
            .forEach(key => {
              videoElemInfo[key] = videoElem[key]
            })
          
          setExtra('videoElem', videoElemInfo)
        }
      } catch (ex) { 
        setExtra('videoElem.exception', ex)
      }

      try {
        const videoPlayerElem = $.s('#movie_player')
        if (videoPlayerElem) {
          const stats = videoPlayerElem.getStatsForNerds()
          Object.keys(stats)
            .filter(key => (
              key.includes('_style') ||
              key === 'video_id_and_cpn'
            ))
            .forEach(key => delete stats[key])
          setExtra('videoPlayerElem.stats', stats)
        }
      } catch (ex) { 
        setExtra('videoPlayerElem.exception', ex)
      }

      let ambilightExtra = {}
      try {
        ambilightExtra.initialized = (typeof ambilight !== 'undefined')
        if (typeof ambilight !== 'undefined') {
          ambilightExtra = {
            ...ambilightExtra,
            ambilightFrameCount: ambilight.ambilightFrameCount,
            videoFrameCount: ambilight.videoFrameCount,
            skippedFramesCount: ambilight.skippedFramesCount,
            videoFrameRate: ambilight.videoFrameRate,
            displayFrameRate: ambilight.displayFrameRate,
            view: ambilight.view,
            settings: {}
          }

          ;(ambilight.settings || []).forEach(setting => {
            if (!setting || !setting.name) return
            ambilightExtra.settings[setting.name] = setting.value
          })
        }
        setExtra('ambilight', ambilightExtra)
      } catch (ex) {
        setExtra('ambilight.exception', ex)
      }

      try {
        const selectors = {
          'html': $.sa('html'),
          'body': $.sa('body'),
          '#page': $.sa('[id="#page"]'),
          'ytd-app': $.sa('ytd-app'),
          'ytd-watch-flexy': $.sa('ytd-watch-flexy'),
          '#player-theater-container': $.sa('[id="player-theater-container"]'),
          'ytd-miniplayer': $.sa('ytd-miniplayer'),
          '#ytd-player': $.sa('#ytd-player'),
          '#container.ytd-player': $.sa('#container.ytd-player'),
          '.html5-video-container': $.sa('.html5-video-container'),
          '#player-container': $.sa('[id="player-container"]'),
          '#player-api': $.sa('[id="player-api"]'),
          '#player': $.sa('[id="player"]'),
          '.html5-video-player': $.sa('.html5-video-player'),
          '#movie_player': $.sa('#movie_player'),
          '.html5-video-container': $.sa('.html5-video-container'),
          'video': $.sa('video'),
          '.html5-main-video': $.sa('.html5-main-video'),
          '.video-stream': $.sa('.video-stream'),
          'ytd-masthead': $.sa('ytd-masthead'),
          'ytd-toggle-theme-compact-link-renderer': $.sa('ytd-toggle-theme-compact-link-renderer'),
          '#avatar-btn': $.sa('[id="avatar-btn"]'),
          '.ytp-chrome-bottom': $.sa('.ytp-chrome-bottom'),
          '.ytp-chrome-controls': $.sa('.ytp-chrome-controls'),
          '.ytp-right-controls': $.sa('.ytp-right-controls'),
          '.ytp-ambilight-settings-button': $.sa('.ytp-ambilight-settings-button'),
          '.ytp-settings-button': $.sa('.ytp-settings-button'),
          '[class*="ambilight"]': $.sa('[class*="ambilight"]')
        };
        if(window.ambilight) {
          selectors['settingsMenuBtn'] = [window.ambilight.settingsMenuBtn]
          selectors['settingsMenuBtnParent'] = [window.ambilight.settingsMenuBtnParent]
          selectors['settingsMenuElem'] = [window.ambilight.settingsMenuElem]
          selectors['settingsMenuElemParent'] = [window.ambilight.settingsMenuElemParent]
        }
        Object.keys(selectors).forEach((selector) => {
          const nodes = selectors[selector]
          if(!nodes) return
          [...nodes].forEach((node, i) => {
            try {
              let nodeHtml = node ? node.cloneNode(false).outerHTML : ''
              let parentNodeHtml = ((node && node.parentNode) ? node.parentNode.cloneNode(false).outerHTML : '') || ''
              if(navigator.doNotTrack) {
                nodeHtml = nodeHtml.replace(/video-id="(?!^).*?"/gi, '')
                parentNodeHtml = parentNodeHtml.replace(/video-id="(?!^).*?"/gi, '')
              }

              setExtra(`»('${selector}')[${i}]`, {
                node: nodeHtml,
                parentNode: parentNodeHtml,
                childNodes: node ? node.childNodes.length : null
              })
            } catch (ex) { console.warn(ex) }
          })
        })
      } catch (ex) {
        setExtra('$.exception', ex)
      }

      try {
        const selectors = {
          '.ytp-chrome-bottom': $.sa('.ytp-chrome-bottom'),
          '.ytp-chrome-controls': $.sa('.ytp-chrome-controls'),
          '.ytp-right-controls': $.sa('.ytp-right-controls'),
        }
        Object.keys(selectors).forEach((selector) => {
          const nodes = selectors[selector]
          if(!nodes) return
          [...nodes].forEach((node, i) => {
            try {
              const childNodes = !node.children ? null : [...node.children].map(node => node.cloneNode(false).outerHTML.trim()).join('\n')
              setExtra(`»(${selector})[${i}].childNodes`, childNodes)
            } catch (ex) { console.warn(ex) }
          })
        })
      } catch (ex) {
        setExtra('$.childNodes.exception', ex)
      }

      captureException(ex)
      scope.clear()
    })
  }
}

setErrorHandler((ex) => AmbilightSentry.captureExceptionWithDetails(ex))