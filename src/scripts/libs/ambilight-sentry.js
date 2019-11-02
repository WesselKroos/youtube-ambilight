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
    } catch (ex) { }
    return event
  }
})

export default class AmbilightSentry {
  static captureExceptionWithDetails(ex) {
    withScope(scope => {
      const setExtra = (name, value) => {
        try {
          scope.setExtra(name, (value === undefined) ? null : value)
        } catch (ex) { }
      }

      try {
        setExtra(`window.width`, window.innerWidth)
        setExtra(`window.height`, window.innerHeight)
        setExtra(`window.scrollY`, window.scrollY)
        setExtra(`window.devicePixelRatio`, window.devicePixelRatio)
        setExtra(`document.fullscreen`, document.fullscreen)
      } catch (ex) { }

      try {
        if (window.screen) {
          setExtra(`screen.width`, screen.width)
          setExtra(`screen.height`, screen.height)
          setExtra(`screen.availWidth`, screen.availWidth)
          setExtra(`screen.availHeight`, screen.availHeight)
          setExtra(`screen.colorDepth`, screen.colorDepth)
          setExtra(`screen.pixelDepth`, screen.pixelDepth)
        }
      } catch (ex) { }

      try {
        setExtra(`youtube.dark`, !!($.s('html').attributes.dark || {}).value)
        setExtra(`youtube.lang`, ($.s('html').attributes.lang || {}).value)
        setExtra(`youtube.loggedIn`, !!$.s('#avatar-btn'))
        setExtra(`player.classes`, [$.s('.html5-video-player').classList].join(' '))
      } catch (ex) { }

      try {
        setExtra(`page.isVideo`, location.pathname == '/watch')
      } catch (ex) { }
      try {
        setExtra(`page.isYtdApp`, !!$.s('ytd-app'))
      } catch (ex) { }

      try {
        if (!navigator.doNotTrack) {
          setExtra(`video.id`, $.s('ytd-watch-flexy').attributes['video-id'].value)
        }
      } catch (ex) { }

      try {
        const videos = $.sa('video')
        videos.forEach((video, i) => {
          try {
            setExtra(`videoTags[${i}].classes`, [video.classList].join(' '))
            setExtra(`videoTags[${i}].style.width`, video.style.width)
            setExtra(`videoTags[${i}].style.height`, video.style.height)
            setExtra(`videoTags[${i}].style.top`, video.style.top)
            setExtra(`videoTags[${i}].style.left`, video.style.left)
            setExtra(`videoTags[${i}].offsetParent`,
              `${video.offsetParent.tagName.toLowerCase()}.${[video.offsetParent.classList].join('.')}`)
          } catch (ex) { }
        })
      } catch (ex) { }

      try {
        setExtra('ambilight.initialized', !!window.ambilight)
        if (window.ambilight) {
          const ambilight = window.ambilight || {}

          setExtra(`ambilight.ambilightFrameCount`, ambilight.ambilightFrameCount)
          setExtra(`ambilight.videoFrameCount`, ambilight.videoFrameCount)
          setExtra(`ambilight.skippedFrames`, ambilight.skippedFrames)
          setExtra(`ambilight.videoFrameRate`, ambilight.videoFrameRate)
          setExtra(`ambilight.displayFrameRate`, ambilight.displayFrameRate);

          (ambilight.settings || []).forEach(setting => {
            if (!setting || !setting.name) return
            setExtra(`settings.${setting.name}`, setting.value)
          })

          if (ambilight.videoPlayer) {
            setExtra(`video.videoWidth`, ambilight.videoPlayer.videoWidth)
            setExtra(`video.videoHeight`, ambilight.videoPlayer.videoHeight)
            setExtra(`video.clientWidth`, ambilight.videoPlayer.clientWidth)
            setExtra(`video.clientHeight`, ambilight.videoPlayer.clientHeight)
            setExtra(`video.currentTime`, ambilight.videoPlayer.currentTime)
            setExtra(`video.duration`, ambilight.videoPlayer.duration)
            setExtra(`video.playbackRate`, ambilight.videoPlayer.playbackRate)
            setExtra(`video.remote.state`, (ambilight.videoPlayer.remote || {}).state)
            setExtra(`video.readyState`, ambilight.videoPlayer.readyState)
            setExtra(`video.loop`, ambilight.videoPlayer.loop)
            setExtra(`video.seeking`, ambilight.videoPlayer.seeking)
            setExtra(`video.paused`, ambilight.videoPlayer.paused)
            setExtra(`video.ended`, ambilight.videoPlayer.ended)
            setExtra(`video.error`, ambilight.videoPlayer.error)
            setExtra(`video.webkitDecodedFrameCount`, ambilight.videoPlayer.webkitDecodedFrameCount)
            setExtra(`video.webkitDroppedFrameCount`, ambilight.videoPlayer.webkitDroppedFrameCount)
            setExtra(`video.webkitVideoDecodedByteCount`, ambilight.videoPlayer.webkitVideoDecodedByteCount)
            setExtra(`video.webkitAudioDecodedByteCount`, ambilight.videoPlayer.webkitAudioDecodedByteCount)
          }
        }
      } catch (ex) { }

      captureException(ex)
      scope.clear()
    })
  }
}