import { $, setEventErrorHandler } from "./generic";
import { BrowserClient } from '@sentry/browser/esm/client';
import {
  captureException,
  withScope,
  initAndBind
} from "@sentry/core";

initAndBind(BrowserClient, {
  dsn: 'https://a3d06857fc2d401690381d0878ce3bc3@sentry.io/1524536',
  defaultIntegrations: false,
  release: document.querySelector('html').getAttribute('data-ambilight-version') || '?',
  beforeSend: (event) => {
    try {
      event.request = {
        url: (!navigator.doNotTrack) ? location.href : '?',
        headers: {
          "User-Agent": navigator.userAgent
        }
      };
    } catch (ex) { console.warn(ex) }
    return event
  }
})

export default class AmbilightSentry {
  static captureExceptionWithDetails(ex) {
    withScope(scope => {
      const setExtra = (name, value) => {
        try {
          scope.setExtra(name, (value === undefined) ? null : value)
        } catch (ex) { console.warn(ex) }
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
          dark: !!($.s('html').attributes.dark || {}).value,
          lang: ($.s('html').attributes.lang || {}).value,
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
      try {
        pageExtra.isYtmApp = !!$.s('ytm-app')
      } catch (ex) { 
        setExtra('pageExtra.isYtmApp.exception', ex)
      }

      try {
        pageExtra.isYtpChromeControls = !!$.s('.ytp-chrome-controls')
      } catch (ex) {
        setExtra('pageExtra.controls.isYtpChromeControls.exception', ex)
      }
      try {
        pageExtra.isYtmCustomControl = !!$.s('ytm-custom-control')
      } catch (ex) {
        setExtra('pageExtra.controls.isYtmCustomControl.exception', ex)
      }
      try {
        pageExtra.isYtpNativeControls = !!$.s('.html5-video-player.ytp-native-controls')
      } catch (ex) {
        setExtra('pageExtra.controls.isYtpNativeControls.exception', ex)
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
        const videoElem = document.querySelector('video')
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
        var selectors = {
          'html': $.sa('html'),
          'body': $.sa('body'),
          '#page': $.sa('#page'),
          'ytd-app': $.sa('ytd-app'),
          'ytd-watch-flexy': $.sa('ytd-watch-flexy'),
          '#player-theater-container': $.sa('#player-theater-container'),
          'ytd-miniplayer': $.sa('ytd-miniplayer'),
          '#ytd-player': $.sa('#ytd-player'),
          '#container.ytd-player': $.sa('#container.ytd-player'),
          '.html5-video-container': $.sa('.html5-video-container'),
          '#player-container': $.sa('#player-container'),
          '#player-api': $.sa('#player-api'),
          '.html5-video-player': $.sa('.html5-video-player'),
          '#movie_player': $.sa('#movie_player'),
          'video': $.sa('video'),
          'ytm-custom-control': $.sa('ytm-custom-control'),
          '#player-control-overlay': $.sa('#player-control-overlay'),
          '.player-controls-top': $.sa('.player-controls-top'),
          'ytd-masthead': $.sa('ytd-masthead'),
          'ytd-toggle-theme-compact-link-renderer': $.sa('ytd-toggle-theme-compact-link-renderer'),
          '#avatar-btn': $.sa('#avatar-btn'),
          '.ytp-chrome-bottom': $.sa('.ytp-chrome-bottom'),
          '.ytp-chrome-controls': $.sa('.ytp-chrome-controls'),
          '.ytp-right-controls': $.sa('.ytp-right-controls'),
          '.ytp-ambilight-settings-button': $.sa('.ytp-ambilight-settings-button'),
          '.ytp-settings-button': $.sa('.ytp-settings-button'),
          '[class*="ambilight"]': $.sa('[class*="ambilight"]'),
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

      captureException(ex)
      scope.clear()
    })
  }
}

setEventErrorHandler((ex) => AmbilightSentry.captureExceptionWithDetails(ex))