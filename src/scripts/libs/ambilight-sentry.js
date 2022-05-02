import { $, html, setErrorHandler, uuidv4 } from "./generic";
import { BrowserClient } from '@sentry/browser/esm/client';
import { Scope, Hub, makeMain, getCurrentHub } from '@sentry/hub';

const getNodeSelector = (elem) => {
  if(!elem.tagName) return elem.nodeName // Document

  const idSelector = elem.id ? `#${elem.id}` : ''
  const classSelector = elem.classList?.length ? `.${[...elem.classList].sort().join('.')}` : ''
  return `${elem.tagName.toLowerCase()}${idSelector}${classSelector}`
}

const getNodeTree = (elem) => {
  if(!elem) return []

  const tree = [];
  tree.push(elem);
  while(elem.parentNode && elem.parentNode.tagName) {
    tree.unshift(elem.parentNode);
    elem = elem.parentNode;
  }
  return tree
}

export const getNodeTreeString = (elem) => 
  getNodeTree(elem)
    .map((node, i) => `${' '.repeat(i)}${getNodeSelector(node)}`)
    .join('\n')

const createNodeEntry = (node, level) => ({
  level,
  node,
  children: []
})
const findEntry = (node, entry) => {
  if(entry.node === node) return entry
  for (entry of entry.children) {
    const foundEntry = findEntry(node, entry)
    if(foundEntry) return foundEntry
  }
}
const entryToString = (entry) => {
  let lines = [`${' '.repeat(entry.level)}${getNodeSelector(entry.node)}`]
  entry.children.forEach(childEntry => {
    lines.push(entryToString(childEntry))
  })
  return lines.join('\n')
}
export const getSelectorTreeString = (selector) => {
  const trees = [...$.sa(selector)]
    .map(elem => getNodeTree(elem))
  let documentTree;
  trees.forEach(nodeTree => {
    let previousEntry;
    nodeTree.forEach(node => {
      if(!documentTree) {
        documentTree = createNodeEntry(node, 0)
        previousEntry = documentTree
        return
      }
      if(!previousEntry) {
        if(documentTree.node === node) {
          previousEntry = documentTree
          return
        } else {
          throw new Error('Cannot create tree of nodes that are not in the same document.')
        }
      }

      const existingEntry = previousEntry.children.find(entry => entry.node === node)
      if(existingEntry) {
        previousEntry = existingEntry
        return
      }
      
      const entry = createNodeEntry(node, previousEntry.level + 1)
      previousEntry.children.push(entry)
      previousEntry = entry
    })
  })

  return documentTree ? entryToString(documentTree) : `No nodes found for selector: '${selector}'`
}

export class AmbilightError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'AmbilightError'
    this.details = details
  }
}

const client = new BrowserClient({
  enabled: true,
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
const hub = new Hub(client)

let sessionId;
export default class AmbilightSentry {
  static overflowProtection = 0
  static captureExceptionWithDetails(ex) {
    try {
      this.overflowProtection++
      if(this.overflowProtection > 3) {
        return
      }

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

      console.error('Ambient light for YouTube™ | ', ex)
      if(this.overflowProtection === 3) {
        console.warn('Ambient light for YouTube™ | Exception overflow protection enabled')
      }

      try {
        const reports = JSON.parse(localStorage.getItem('ambilight-reports') || '[]')
        const dayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const reportsToday = reports.filter(report => report.time > dayAgo)
        const reportsThisWeek = reports.filter(report => report.time > weekAgo)
        if(reportsToday.length < 4 && reportsThisWeek.length < 5) {
          reportsThisWeek.push({
            time: Date.now(),
            error: ex.message
          })
        } else {
          console.warn('Ambient light for YouTube™ | Dropped error report because too many reports has been sent today or in the last 7 days')
          return
        }
        localStorage.setItem('ambilight-reports', JSON.stringify(reportsThisWeek))
      } catch (ex) { 
        console.warn(ex)
        return
      }

      const scope = new Scope()
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
          setExtra('YTA Exception details', ex.details)
        }
      } catch (ex) {
        setExtra('YTA Exception details (exception)', ex)
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
          dark: !!html?.attributes?.dark,
          lang: html?.attributes?.lang?.value,
          loggedIn: yt?.config_?.LOGGED_IN
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
            'isPageHidden',
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
            'projector.type',
            'projector.webGLVersion',
            'projector.width',
            'projector.height',
            'projector.heightCrop',
            'projector.blurBound',
            'projector.levels',
            'projector.projectors.length',
            'projector.scale.x',
            'projector.scale.y',
            'projector.lostCount',
          ]
          keys.forEach(key => {
            try {
              let value = ambilight
              key.split('.').forEach(key => value = value ? value[key] : undefined) // Find multi depth values
              ambilightExtra[key] = value
            } catch (ex) {}
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
          ;(ambilight.settings?.config || []).forEach(setting => {
            if (!setting || !setting.name) return
            settingsExtra[setting.name] = ambilight.settings[setting.name]
            if (!setting.key) return
            settingsExtra[`${setting.name}-key`] = setting.key
          })
          setExtra('Settings', settingsExtra)
        }
      } catch (ex) { 
        setExtra('Settings (exception)', ex)
      }

      const previousHub = getCurrentHub()
      makeMain(hub)
      const response = client.captureException(ex, {}, scope)
      makeMain(previousHub)
      scope.clear()
    } catch (ex) {
      console.error('Ambient light for YouTube™ | ', ex)
    }
  }
}

setErrorHandler((ex) => AmbilightSentry.captureExceptionWithDetails(ex))