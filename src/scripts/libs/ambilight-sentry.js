import { $, html, on, uuidv4 } from './generic';
import { BrowserClient } from '@sentry/browser/esm/client';
import { Scope, Hub, makeMain, getCurrentHub } from '@sentry/hub';
import { contentScript } from './messaging';

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

let settings;
export const parseSettingsToSentry = (newSettings) => {
  settings = newSettings
}

export class AmbilightError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'AmbilightError'
    this.details = details
  }
}

let version = ''
export const setVersion = (newVersion) => {
  version = newVersion
}

let crashOptions = null
export const setCrashOptions = (newCrashOptions) => {
  crashOptions = newCrashOptions
}

let client;
let hub;
function initClient() {
  client = new BrowserClient({
    enabled: true,
    dsn: 'https://a3d06857fc2d401690381d0878ce3bc3@sentry.io/1524536',
    defaultIntegrations: false,
    release: version || 'pending',
    attachStacktrace: true,
    maxValueLength: 500,
    normalizeDepth: 4,
    beforeSend: (event) => {
      try {
        event.request = {}
        if(navigator.doNotTrack !== '1' && crashOptions?.video) {
          event.request.url = location.href
        }
        if(crashOptions?.technical) {
          event.request.headers = {
            'User-Agent': navigator.userAgent // Add UserAgent
          }
        }
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
  hub = new Hub(client)
}

let userId;
let reports;
const initializeStorageEntries = (async () => {
  try {
    const entries = await contentScript.getStorageEntryOrEntries(['reports', 'crash-reporter-id']) || {}
    userId = entries['crash-reporter-id']
    reports = JSON.parse(entries.reports || '[]')

    try {
      localStorage.removeItem('ambilight-reports')
    } catch {}

    if(!userId) {
      try {
        userId = localStorage.getItem('ambilight-crash-reporter-id')
      } catch {}
      if(userId) {
        // Migrate from localStorage to storage.local
        await contentScript.setStorageEntry('crash-reporter-id', userId)
        localStorage.removeItem('ambilight-crash-reporter-id')
      } else {
        userId = uuidv4()
        await contentScript.setStorageEntry('crash-reporter-id', userId)
      }
    }
  } catch {}
})()

let sessionId;
export default class AmbilightSentry {
  static script = window.yt ? 'injected' : 'content'
  static overflowProtection = 0
  static async captureExceptionWithDetails(ex) {
    try {
      if(!client || !hub) {
        initClient()
      }

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

      if(!crashOptions?.crash) {
        console.warn('Ambient light for YouTube™ | Crash reporting is disabled. If you want this error to be fixed, open the extension options to enable crash reporting. Then refresh the page and reproduce the error again to send a crash report.')
        return
      }

      try {
        await initializeStorageEntries
      } catch {}

      try {
        if(reports) {
          const dayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          reports = reports.filter(report => !version || report.version === version)
          const reportsToday = reports.filter(report => report.time > dayAgo)
          const reportsThisWeek = reports.filter(report => report.time > weekAgo)
          if(reportsToday.length < 4 && reportsThisWeek.length < 5) {
            reportsThisWeek.push({
              time: Date.now(),
              error: ex.message,
              version: version || 'pending'
            })
          } else {
            console.warn('Ambient light for YouTube™ | Dropped error report because too many reports has been sent today or in the last 7 days')
            return
          }
          await contentScript.setStorageEntry('reports', JSON.stringify(reportsThisWeek))
        }
      } catch (ex) { 
        console.warn(ex)
        return
      }

      const scope = new Scope()
      try {
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
        setExtra('CrashOptions', crashOptions)
      } catch (ex) {
        setExtra('CrashOptions (exception)', ex)
      }

      try {
        setExtra('Script', this.script)
      } catch (ex) {
        setExtra('Script (exception)', ex)
      }

      try {
        if(window.yt) {
          const ambilightExtra = {
            initialized: (typeof ambilight !== 'undefined')
          }
          if (ambilightExtra.initialized) {
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
              'levels',
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
              'projector.projectors.length',
              'projector.scale.x',
              'projector.scale.y',
              'projector.lostCount',
              'projector.majorPerformanceCaveat'
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
        }
      } catch (ex) {
        setExtra('Ambilight (exception)', ex)
      }

      try {
        if (settings) {
          const settingsExtra = {}
          ;(settings?.config || []).forEach(setting => {
            if (!setting || !setting.name) return
            settingsExtra[setting.name] = settings[setting.name]
            if (!setting.key) return
            settingsExtra[`${setting.name}-key`] = setting.key
          })
          settingsExtra.webGLExperiment = settings.webGLExperiment
          setExtra('Settings', settingsExtra)
        }
      } catch (ex) { 
        setExtra('Settings (exception)', ex)
      }

      if(crashOptions?.technical) {
        try {
          if(ex && ex.details) {
            setExtra('Details', ex.details)
          }
        } catch (ex) {
          setExtra('Details (exception)', ex)
        }

        try {
          setExtra('YouTube', {
            dark: !!html?.attributes?.dark,
            loggedIn: (window.yt)
              ? !!window.yt?.config_?.LOGGED_IN
              : ($.s('ytd-topbar-menu-button-renderer') ? !!$.s('#avatar-btn') : undefined)
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
          setExtra('Video elements', $.sa('video').length)
        } catch (ex) { 
          setExtra('Video elements (exception)', ex)
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
          const videoPlayerElem = $.s('#movie_player')
          if (videoPlayerElem?.getStatsForNerds) {
            const stats = videoPlayerElem.getStatsForNerds()
            const relevantStats = ['codecs', 'color', 'dims_and_frames', 'drm', 'resolution']
            Object.keys(stats).forEach(key => {
              if(!relevantStats.includes(key))
                delete stats[key]
            })
            setExtra('Player', stats)
          }
        } catch (ex) { 
          setExtra('Player (exception)', ex)
        }
      }

      if(navigator.doNotTrack !== '1' && crashOptions?.video) {
        try {
          const ytdWatchFlexyElem = $.s('ytd-watch-flexy')
          if (ytdWatchFlexyElem) {
            const videoId = ytdWatchFlexyElem?.getAttribute('video-id')
            setExtra('ytd-watch-flexy[video-id]', videoId)
          }
        } catch (ex) { 
          setExtra('ytd-watch-flexy[video-id] (exception)', ex)
        }
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

export class ErrorEvents {
  list = []
  
  constructor() {
    on(window, 'beforeunload', (e) => {
      if(!this.list.length) return
      
      this.add('tab beforeunload')
      this.send()
    }, false)
    
    on(window, 'pagehide', (e) => {
      if(!this.list.length) return
      
      this.add('tab pagehide')
    }, false)
    
    on(document, 'visibilitychange', () => {
      if(document.visibilityState !== 'hidden') return
      if(!this.list.length) return
      
      this.add('tab visibilitychange hidden')
      this.send()
    }, false)
  }

  send = () => {
    const lastEvent = this.list[this.list.length - 1]
    const lastTime = lastEvent.time
    const firstTime =  this.list[0].firstTime || this.list[0].time
    if(lastTime - firstTime < 10) {
      return // Give the site 10 seconds to load the watch page or move the video element
    }

    AmbilightSentry.captureExceptionWithDetails(
      new AmbilightError('Closed or hid the page with pending errors', this.list)
    )
    this.list = []
  }

  add = (type, details = {}) => {
    if(!crashOptions?.technical) {
      if(details['ambilight.videoElem']) details['ambilight.videoElem'] = undefined
      if(details.tree) details.tree = undefined
    }
    const time = Math.round(performance.now()) / 1000
  
    if(this.list.length) {
      const last = this.list.slice(-1)[0]
      const {
        count: lastCount,
        time: lastTime,
        firstTime,
        type: lastType,
        ...lastDetails
      } = last
  
      if(
        lastType === type && 
        JSON.stringify(lastDetails) === JSON.stringify(details)
      ) {
        last.count = last.count ? last.count + 1 : 2
        last.time = time
        last.firstTime = firstTime || lastTime
        return
      }
    }
  
    let event = {
      type,
      time,
      ...details,
    }
    event.time = time
    this.list.push(event)
  }
}