import { $ } from "./generic";
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
      if (!navigator.doNotTrack) {
        event.request = {
          url: location.href,
          headers: {
            "User-Agent": navigator.userAgent
          }
        };
      }
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
      } catch (ex) { console.warn(ex) }

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
      } catch (ex) { console.warn(ex) }

      try {
        setExtra('youtube', {
          dark: !!($.s('html').attributes.dark || {}).value,
          lang: ($.s('html').attributes.lang || {}).value,
          loggedIn: !!$.s('#avatar-btn')
        })
      } catch (ex) { console.warn(ex) }

      const pageExtra = {}
      try {
        pageExtra.isVideo = (location.pathname == '/watch')
      } catch (ex) { console.warn(ex) }
      try {
        pageExtra.isYtdApp = !!$.s('ytd-app')
      } catch (ex) { console.warn(ex) }
      setExtra('page', pageExtra)

      try {
        if (!navigator.doNotTrack) {
          setExtra('videoId', $.s('ytd-watch-flexy').attributes['video-id'].value)
        }
      } catch (ex) { console.warn(ex) }
      try {
        if(window.currentVideoInfo) {
          setExtra('videoMimeType', window.currentVideoInfo.mimeType)
        }
      } catch (ex) { console.warn(ex) }

      try {
        if (ambilight.videoElem) {
          const videoElem = ambilight.videoElem
          setExtra('videoElem', {
            videoWidth: videoElem.videoWidth,
            videoHeight: videoElem.videoHeight,
            clientWidth: videoElem.clientWidth,
            clientHeight: videoElem.clientHeight,
            currentTime: videoElem.currentTime,
            duration: videoElem.duration,
            playbackRate: videoElem.playbackRate,
            remoteState: (videoElem.remote || {}).state,
            readyState: videoElem.readyState,
            loop: videoElem.loop,
            seeking: videoElem.seeking,
            paused: videoElem.paused,
            ended: videoElem.ended,
            error: videoElem.error,
            webkitDecodedFrameCount: videoElem.webkitDecodedFrameCount,
            webkitDroppedFrameCount: videoElem.webkitDroppedFrameCount,
            webkitVideoDecodedByteCount: videoElem.webkitVideoDecodedByteCount,
            webkitAudioDecodedByteCount: videoElem.webkitAudioDecodedByteCount
          })
        }
      } catch (ex) { console.warn(ex) }

      let ambilightExtra = {}
      try {
        ambilightExtra.initialized = !!ambilight
        if (ambilight) {
          ambilightExtra = {
            ...ambilightExtra,
            ambilightFrameCount: ambilight.ambilightFrameCount,
            videoFrameCount: ambilight.videoFrameCount,
            skippedFrames: ambilight.skippedFrames,
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
      } catch (ex) { console.warn(ex) }

      try {
        var selectors = {
          'html': $.sa('html'),
          'body': $.sa('body'),
          '#page': $.sa('[id="#page"]'),
          'ytd-app': $.sa('ytd-app'),
          'ytd-watch-flexy': $.sa('ytd-watch-flexy'),
          '#player-theater-container': $.sa('[id="player-theater-container"]'),
          'ytd-miniplayer': $.sa('ytd-miniplayer'),
          '.html5-video-container': $.sa('.html5-video-container'),
          '#player-container': $.sa('[id="player-container"]'),
          '#player-api': $.sa('[id="player-api"]'),
          '.ytp-ambilight-settings-button': $.sa('.ytp-ambilight-settings-button'),
          '.html5-video-player': $.sa('.html5-video-player'),
          'video': $.sa('video'),
          'ytd-masthead': $.sa('ytd-masthead'),
          'ytd-toggle-theme-compact-link-renderer': $.sa('ytd-toggle-theme-compact-link-renderer'),
          '#avatar-btn': $.sa('[id="avatar-btn"]'),
          '.ytp-right-controls': $.sa('.ytp-right-controls'),
          '.ytp-ambilight-settings-button': $.sa('.ytp-ambilight-settings-button'),
          '[class*="ambilight"]': $.sa('[class*="ambilight"]'),
        }
        Object.keys(selectors).forEach((selector) => {
          const nodes = selectors[selector]
          if(!nodes) return
          [...nodes].forEach((node, i) => {
            try {
              setExtra(`selectors[${selector}][${i}]`, {
                node: node ? node.cloneNode(false).outerHTML : null,
                childNodes: node ? node.childNodes.length : null,
                parentNode: (node && node.parentNode) ? node.parentNode.cloneNode(false).outerHTML : null
              })
            } catch (ex) { console.warn(ex) }
          })
        })
      } catch (ex) { console.warn(ex) }

      captureException(ex)
      scope.clear()
    })
  }
}