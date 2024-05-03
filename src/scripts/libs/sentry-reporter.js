import { BrowserClient, defaultStackParser, makeFetchTransport } from '@sentry/browser/esm';
import { Dedupe as DedupeIntegration } from "@sentry/browser/esm/integrations/dedupe";
import { Hub, makeMain, getCurrentHub } from '@sentry/core/esm/hub';
import { Scope } from '@sentry/core/esm/scope';

import { html, isEmbedPageUrl, mediaErrorToString, networkStateToString, on, readyStateToString, uuidv4, watchSelectors } from './generic';
import { contentScript } from './messaging';
import SettingsConfig from './settings-config';

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
// const findEntry = (node, entry) => {
//   if(entry.node === node) return entry
//   for (entry of entry.children) {
//     const foundEntry = findEntry(node, entry)
//     if(foundEntry) return foundEntry
//   }
// }
const entryToString = (entry) => {
  let lines = [`${' '.repeat(entry.level)}${getNodeSelector(entry.node)}`]
  entry.children.forEach(childEntry => {
    lines.push(entryToString(childEntry))
  })
  return lines.join('\n')
}
export const getSelectorTreeString = (selector) => {
  const trees = [...document.querySelectorAll(selector)]
    .map(elem => getNodeTree(elem))

  const documentTrees = []
  trees.forEach(nodeTree => {
    let documentTree;
    let previousEntry;
    nodeTree.forEach(node => {
      if(!previousEntry) {
        documentTree = documentTrees.find(dt => dt.node === node)
        if(!documentTree) {
          documentTree = createNodeEntry(node, 0)
          documentTrees.push(documentTree)
        }
        previousEntry = documentTree
        return
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

  return documentTrees
    .map(documentTree => documentTree 
      ? entryToString(documentTree) 
      : `No nodes found for selector: '${selector}'`
    )
    .join('\n')
}

let settings;
export const parseSettingsToSentry = (newSettings) => {
  settings = newSettings
}

export class AmbientlightError extends Error {
  constructor(message, details) {
    super(message)
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
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [new DedupeIntegration()],
    release: version || 'pending',
    attachStacktrace: true,
    maxValueLength: 500,
    normalizeDepth: 5,
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
export default class SentryReporter {
  static script = window.yt ? 'injected' : 'content'
  static overflowProtection = 0
  static async captureException(ex) {
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

      console.error(ex)
      if(ex.details) {
        console.error(ex.details)
      }

      if(this.overflowProtection === 3) {
        console.warn('Exception overflow protection enabled')
      }

      // Ignore errors we cannot fix
      if(ex.message?.includes(`can't access dead object`)) // Firefox has destroyed the webpage but the extensions javascript not yet
        return


      if(!crashOptions?.crash) {
        console.warn('Crash reporting is disabled. If you want this error to be fixed, open the extension options to enable crash reporting. Then refresh the page and reproduce the error again to send a crash report.')
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
            console.warn('Dropped error report because too many reports has been sent today or in the last 7 days')
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
          const ambientlightExtra = {
            initialized: (typeof ambientlight !== 'undefined')
          }
          if (ambientlightExtra.initialized) {
            ambientlightExtra.now = performance.now()
            const keys = [
              'initializedTime',
              'ambientlightFrameCount',
              'ambientlightFrameRate',
              'displayFrameCount',
              'displayFrameRate',
              'videoFrameCount',
              'videoFrameRate',
              'ambientlightVideoDroppedFrameCount',
              'droppedVideoFramesCorrection',
              'averageVideoFramesDifference',
              'previousDrawTime',
              'previousFrameTime',
              'buffersCleared',
              'canvassesInvalidated',
              'sizesInvalidated',
              'sizesChanged',
              'delayedUpdateSizesChanged',
              'requestVideoFrameCallbackId',
              'videoFrameCallbackReceived',
              'scheduledNextFrame',
              'view',
              'isOnVideoPage',
              'atTop',
              'isFillingFullscreen',
              'isHidden',
              'isAmbientlightHiddenOnWatchPage',
              'videoIsHidden',
              'videoIsPictureInPicture',
              'isVideoHiddenOnWatchPage',
              'isPageHidden',
              'pageHiddenTime',
              'pageHiddenClearTime',
              'pageShownTime',
              'clearTime',
              'isVrVideo',
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
              'enableMozillaBugReadPixelsWorkaround',
              'enableMozillaBug1606251Workaround',
              'enableChromiumBug1142112Workaround',
              'enableChromiumBug1123708Workaround',
              'enableChromiumBug1092080Workaround',
              'enableChromiumBugDirectVideoOverlayWorkaround',
              'enableChromiumBugVideoJitterWorkaround',
              'getImageDataAllowed',
              'projectorBuffer.elem.width',
              'projectorBuffer.elem.height',
              'projectorBuffer.ctx.initializedTime',
              'projectorBuffer.ctx.lost',
              'projectorBuffer.ctx.lostCount',
              'projectorBuffer.ctx.webGLVersion',
              'projectorBuffer.ctx.webglcontextcreationerrors',
              'projectorBuffer.ctx.ctx.drawingBufferColorSpace',
              'projectorBuffer.ctx.ctx.unpackColorSpace',
              'projector.initializedTime',
              'projector.type',
              'projector.webGLVersion',
              'projector.width',
              'projector.height',
              'projector.blurBound',
              'projector.projectors.length',
              'projector.scale.x',
              'projector.scale.y',
              'projector.lost',
              'projector.lostCount',
              'projector.blurLost',
              'projector.blurLostCount',
              'projector.majorPerformanceCaveat',
              'projector.webglcontextcreationerrors',
              'projector.ctx.drawingBufferColorSpace',
              'projector.ctx.unpackColorSpace'
            ]
            keys.forEach(key => {
              try {
                let value = ambientlight
                key.split('.').forEach(key => value = value ? value[key] : undefined) // Find multi depth values
                ambientlightExtra[key] = value
              } catch (ex) {}
            })
          }
          setExtra('Ambientlight', ambientlightExtra)
        }
      } catch (ex) {
        setExtra('Ambientlight (exception)', ex)
      }

      try {
        if (settings) {
          const settingsExtra = {}
          SettingsConfig.forEach(setting => {
            if (!setting || !setting.name) return
            settingsExtra[setting.name] = settings[setting.name]
            if (!setting.key) return
            settingsExtra[`${setting.name}-key`] = setting.key
          })
          settingsExtra.webGLCrashDate = settings.webGLCrashDate
          settingsExtra.webGLCrashVersion = settings.webGLCrashVersion
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
              : (document.querySelector('ytd-topbar-menu-button-renderer') ? !!document.querySelector('#avatar-btn') : undefined)
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
          pageExtra.isEmbed = isEmbedPageUrl()
        } catch (ex) {
          setExtra('Page .isEmbed (exception)', ex)
        }
        try {
          pageExtra.isYtdApp = !!document.querySelector('ytd-app')
        } catch (ex) { 
          setExtra('Page .isYtdApp (exception)', ex)
        }
        setExtra('Page', pageExtra)

        try {
          setExtra('Video elements', document.querySelectorAll('video').length)
        } catch (ex) { 
          setExtra('Video elements (exception)', ex)
        }

        try {
          const videoElem = window.ambientlight?.videoElem;
          if(videoElem) {
            setExtra('Video state', {
              mediaError: videoElem.error ? {
                code: mediaErrorToString(videoElem.error.code),
                message: videoElem.error.message || 'Unknown'
              } : undefined,
              networkState: networkStateToString(videoElem?.networkState),
              readyState: readyStateToString(videoElem?.readyState)
            })
          }
        } catch (ex) { 
          setExtra('Video state (exception)', ex)
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
          const videoPlayerElem = document.querySelector('#movie_player, .html5-video-player')
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

        try {
          const ytdAppElem = document.querySelector('ytd-app')
          if (ytdAppElem) {
            const elementFunctionNames = ['querySelector', 'querySelectorAll', 'closest', 'prepend', 'append', 'appendChild', 'contains']
            const componentFunctionsAreNative = elementFunctionNames.reduce((list, name) => {
              list[name] = document.documentElement[name] === ytdAppElem[name]
              return list
            }, {})
            componentFunctionsAreNative.example = document.documentElement.closest?.toString()?.substring(0, 36)
            setExtra('ComponentFunctionsAreNative', componentFunctionsAreNative)
          }
        } catch (ex) { 
          setExtra('ComponentFunctionsAreNative (exception)', ex)
        }
      }

      if(navigator.doNotTrack !== '1' && crashOptions?.video) {
        try {
          const ytdWatchElem = document.querySelector(`${watchSelectors.join(', ')}, .ytd-page-manager`)
          if (ytdWatchElem) {
            const videoId = ytdWatchElem?.getAttribute('video-id')
            setExtra('ytd-watch-...[video-id]', videoId)
          }
        } catch (ex) { 
          setExtra('ytd-watch-...[video-id] (exception)', ex)
        }
      }

      const previousHub = getCurrentHub()
      makeMain(hub)
      client.captureException(ex, {}, scope)
      makeMain(previousHub)
      scope.clear()
    } catch (ex) {
      console.error(ex)
    }
  }
}

export class ErrorEvents {
  list = []
  
  constructor() {
    on(window, 'beforeunload', () => {
      if(!this.list.length) return
      
      this.add('tab beforeunload')
      this.send()
    }, false)
    
    on(window, 'pagehide', () => {
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
    if(lastTime - firstTime < 5) {
      return // Give the site 5 seconds to load the watch page or move the video element
    }

    const firstEvent = this.list.splice(0, 1)
    const details = {
      firstEvent,
      events: [...this.list.reverse()]
    }
    this.list = []

    SentryReporter.captureException(
      new AmbientlightError('Closed or hid the page with pending errors', details)
    )
  }

  add = (type, details = {}) => {
    if(!(crashOptions?.technical)) {
      details = undefined
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
        last.count = lastCount ? lastCount + 1 : 2
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