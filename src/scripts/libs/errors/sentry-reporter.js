import {
  BrowserClient,
  dedupeIntegration,
  functionToStringIntegration,
  extraErrorDataIntegration,
  defaultStackParser,
  Scope,
  createTransport,
} from '@sentry/browser';

import {
  isEmbedPageUrl,
  mediaErrorToString,
  networkStateToString,
  readyStateToString,
  uuidv4,
  watchSelectors,
} from '../generic';
import SettingsConfig from '../settings-config';
import { storage } from '../storage';

let settings;
export const parseSettingsToSentry = (newSettings) => {
  settings = newSettings;
};

let version = '';
export const setVersion = (newVersion) => {
  version = newVersion;
};

export let crashOptions = null;
export const setCrashOptions = (newCrashOptions) => {
  crashOptions = newCrashOptions;
};

let scope;
function initClientAndScope() {
  // Custom fetch transport to prevent iframe injection by Sentry's makeFetchTransport
  // Copied from: https://docs.sentry.io/platforms/javascript/configuration/transports/#custom-transport
  function makeFetchTransport(options) {
    function makeRequest(request) {
      const requestOptions = {
        body: request.body,
        method: 'POST',
        referrerPolicy: 'origin',
        headers: options.headers,
        ...options.fetchOptions,
      };
      return fetch(options.url, requestOptions).then((response) => {
        return {
          statusCode: response.status,
          headers: {
            'x-sentry-rate-limits': response.headers.get(
              'X-Sentry-Rate-Limits'
            ),
            'retry-after': response.headers.get('Retry-After'),
          },
        };
      });
    }
    return createTransport(options, makeRequest);
  }

  const client = new BrowserClient({
    enabled: true,
    dsn: 'https://a3d06857fc2d401690381d0878ce3bc3@o288593.ingest.us.sentry.io/1524536',
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [
      dedupeIntegration(), // Reduces duplicate reports
      functionToStringIntegration(), // Names functions
      extraErrorDataIntegration(), // Captures all properties of an error object
    ],
    release: version || 'pending',
    attachStacktrace: true,
    maxValueLength: 500,
    normalizeDepth: 5,
    beforeSend: (event) => {
      try {
        event.request = {};
        if (navigator.doNotTrack !== '1' && crashOptions?.video) {
          event.request.url = location.href;
          event.request.headers = {
            Referer: globalThis.window?.document?.referrer,
          };
        }
        if (crashOptions?.technical) {
          event.request.headers = {
            ...(event.request.headers || {}),
            'User-Agent': navigator.userAgent, // Add UserAgent
          };
        }

        // Normalize stacktrace domain of all browsers
        for (const value of event.exception.values) {
          if (value.stacktrace && value.stacktrace.frames) {
            for (const frame of value.stacktrace.frames) {
              // Conversion to app:/// is required to display stacktraces from source on sentry.io
              frame.filename = frame.filename.replace(
                /[a-z]+?-extension:\/\/[a-z|0-9|-]+?\//g,
                'app:///' // chrome-extension://cokcldclnicoojbmfmbeoiajibcoilgn/
              );

              frame.filename = frame.filename.replace(
                /\/[a-z|0-9]+?\/jsbin\//g,
                '/_hash_/jsbin/'
              );
              frame.filename = frame.filename.replace(
                /\/s\/player\/[a-z|0-9]+?\//g,
                '/s/player/_hash_/'
              );
            }
          }
        }
      } catch (ex) {
        console.warn(ex);
      }
      return event;
    },
  });
  scope = new Scope();
  scope.setClient(client);
  client.init();
}

let userId;
let reports;
const initializeStorageEntries = (async () => {
  try {
    const entries = (await storage.get(['reports', 'crash-reporter-id'])) || {};
    userId = entries['crash-reporter-id'];
    reports = JSON.parse(entries.reports || '[]');

    if (!userId) {
      userId = uuidv4();
      await storage.set('crash-reporter-id', userId);
    }
  } catch (ex) {
    console.warn(ex);
  }
})();

let sessionId;
export default class SentryReporter {
  static script = globalThis.yt ? 'injected' : 'content';
  static overflowProtection = 0;
  static async captureException(ex) {
    try {
      // Ignore errors we cannot fix
      if (ex?.message?.includes?.(`can't access dead object`))
        // Firefox has destroyed the webpage but the extensions javascript not yet
        return;

      this.overflowProtection++;
      if (this.overflowProtection > 3) {
        return;
      }

      try {
        // Include stack trace in report (ex.name = 'SecurityError')
        if (
          ex.stack &&
          (Object.prototype.toString.call(ex) === '[object DOMException]' ||
            Object.prototype.toString.call(ex) === '[object DOMError]')
        ) {
          const exWithStack = new Error(ex.message);
          exWithStack.code = ex.code;
          exWithStack.stack = ex.stack;
          exWithStack.name = ex.name;
          ex = exWithStack;
        }
      } catch (ex) {
        console.warn(ex);
      }

      if (ex.details) {
        console.error(ex, ex.details);
      } else {
        console.error(ex);
      }

      if (this.overflowProtection === 3) {
        console.warn('Exception overflow protection enabled');
      }

      if (!crashOptions?.crash) {
        console.warn(
          'Crash reporting is disabled. If you want this error to be fixed, open the extension options to enable crash reporting. Then refresh the page and reproduce the error again to send a crash report.'
        );
        return;
      }

      try {
        await initializeStorageEntries;
      } catch (ex) {
        console.warn(ex);
      }

      try {
        if (reports) {
          const dayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          reports = reports.filter(
            (report) => !version || report.version === version
          );
          const reportsToday = reports.filter((report) => report.time > dayAgo);
          const reportsThisWeek = reports.filter(
            (report) => report.time > weekAgo
          );
          if (reportsToday.length < 4 && reportsThisWeek.length < 5) {
            reportsThisWeek.push({
              time: Date.now(),
              error: ex.message,
              version: version || 'pending',
            });
          } else {
            console.warn(
              'Dropped error report because too many reports has been sent today or in the last 7 days'
            );
            return;
          }
          await storage.set('reports', JSON.stringify(reportsThisWeek));
        }
      } catch (ex) {
        console.warn(ex);
        return;
      }

      if (!scope) initClientAndScope();
      scope.clear();

      try {
        scope.setUser({ id: userId });
      } catch {
        console.warn(ex);
      }

      try {
        if (!sessionId) {
          sessionId = uuidv4();
        }
        scope.setTag('session', sessionId);
      } catch {
        console.warn(ex);
      }

      const setExtra = (name, value) => {
        try {
          scope.setExtra(name, value === undefined ? null : value);
        } catch (ex) {
          console.warn(ex);
        }
      };

      try {
        setExtra('CrashOptions', crashOptions);
      } catch (ex) {
        setExtra('CrashOptions (exception)', ex);
      }

      try {
        setExtra('Script', this.script);
      } catch (ex) {
        setExtra('Script (exception)', ex);
      }

      try {
        if (globalThis.yt) {
          const ambientlightExtra = {
            initialized: typeof ambientlight !== 'undefined',
          };
          if (ambientlightExtra.initialized) {
            ambientlightExtra.now = performance.now();
            const propertyNames = [
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
              'projector.ctx.unpackColorSpace',
            ];
            for (const propertyName of propertyNames) {
              try {
                let value = ambientlight;
                const propertyPath = propertyName.split('.');
                for (const propertyName of propertyPath) {
                  value = value ? value[propertyName] : undefined; // Find multi depth values
                }
                ambientlightExtra[propertyName] = value;
              } catch {}
            }
          }
          setExtra('Ambientlight', ambientlightExtra);
        }
      } catch (ex) {
        setExtra('Ambientlight (exception)', ex);
      }

      try {
        if (settings) {
          const settingsExtra = {};
          for (const setting of SettingsConfig) {
            if (!setting || !setting.name) continue;
            settingsExtra[setting.name] = settings[setting.name];
            if (!setting.key) continue;
            settingsExtra[`${setting.name}-key`] = setting.key;
          }
          settingsExtra.webGLCrashDate = settings.webGLCrashDate;
          settingsExtra.webGLCrashVersion = settings.webGLCrashVersion;
          setExtra('Settings', settingsExtra);
        }
      } catch (ex) {
        setExtra('Settings (exception)', ex);
      }

      if (crashOptions?.technical) {
        try {
          if (ex && ex.details) {
            setExtra('Details', ex.details);
          }
        } catch (ex) {
          setExtra('Details (exception)', ex);
        }

        try {
          setExtra('YouTube', {
            dark: !!document.documentElement?.attributes?.dark,
            loggedIn: globalThis.yt
              ? !!globalThis.yt?.config_?.LOGGED_IN
              : document.querySelector('ytd-topbar-menu-button-renderer')
              ? !!document.querySelector('#avatar-btn')
              : undefined,
          });
        } catch (ex) {
          setExtra('YouTube (exception)', ex);
        }

        const pageExtra = {};
        try {
          pageExtra.isVideo = location.pathname == '/watch';
        } catch (ex) {
          setExtra('Page .isVideo (exception)', ex);
        }
        try {
          pageExtra.isEmbed = isEmbedPageUrl();
        } catch (ex) {
          setExtra('Page .isEmbed (exception)', ex);
        }
        try {
          pageExtra.isYtdApp = !!document.querySelector('ytd-app');
        } catch (ex) {
          setExtra('Page .isYtdApp (exception)', ex);
        }
        setExtra('Page', pageExtra);

        try {
          setExtra('Video elements', document.querySelectorAll('video').length);
        } catch (ex) {
          setExtra('Video elements (exception)', ex);
        }

        try {
          const videoElem = globalThis.ambientlight?.videoElem;
          if (videoElem) {
            setExtra('Video state', {
              mediaError: videoElem.error
                ? {
                    code: mediaErrorToString(videoElem.error.code),
                    message: videoElem.error.message || 'Unknown',
                  }
                : undefined,
              networkState: networkStateToString(videoElem?.networkState),
              readyState: readyStateToString(videoElem?.readyState),
            });
          }
        } catch (ex) {
          setExtra('Video state (exception)', ex);
        }

        try {
          if (globalThis.window) {
            try {
              setExtra('Window', {
                width: window.innerWidth,
                height: window.innerHeight,
                scrollY: window.scrollY,
                devicePixelRatio: window.devicePixelRatio,
                fullscreen: document.fullscreen,
              });
            } catch (ex) {
              setExtra('Window (exception)', ex);
            }

            try {
              if (window.screen) {
                setExtra('Screen', {
                  width: screen.width,
                  height: screen.height,
                  availWidth: screen.availWidth,
                  availHeight: screen.availHeight,
                  colorDepth: screen.colorDepth,
                  pixelDepth: screen.pixelDepth,
                });
              }
            } catch (ex) {
              setExtra('Screen (exception)', ex);
            }
          }
        } catch (ex) {
          setExtra('Window (exception)', ex);
        }

        try {
          const videoPlayerElem = document.querySelector(
            '#movie_player, .html5-video-player'
          );
          if (videoPlayerElem?.getStatsForNerds) {
            const stats = videoPlayerElem.getStatsForNerds();
            const relevantStats = [
              'codecs',
              'color',
              'dims_and_frames',
              'drm',
              'resolution',
            ];
            for (const key of Object.keys(stats)) {
              if (!relevantStats.includes(key)) delete stats[key];
            }
            setExtra('Player', stats);
          }
        } catch (ex) {
          setExtra('Player (exception)', ex);
        }

        try {
          const ytdAppElem = document.querySelector('ytd-app');
          if (ytdAppElem) {
            const elementFunctionNames = [
              'querySelector',
              'querySelectorAll',
              'closest',
              'prepend',
              'append',
              'appendChild',
              'contains',
            ];
            const componentFunctionsAreNative = elementFunctionNames.reduce(
              (list, name) => {
                list[name] =
                  document.documentElement[name] === ytdAppElem[name];
                return list;
              },
              {}
            );
            componentFunctionsAreNative.example =
              document.documentElement.closest?.toString()?.substring(0, 36);
            setExtra(
              'ComponentFunctionsAreNative',
              componentFunctionsAreNative
            );
          }
        } catch (ex) {
          setExtra('ComponentFunctionsAreNative (exception)', ex);
        }
      }

      if (navigator.doNotTrack !== '1' && crashOptions?.video) {
        try {
          const ytdWatchElem = document.querySelector(
            `${watchSelectors.join(', ')}, .ytd-page-manager`
          );
          if (ytdWatchElem) {
            const videoId = ytdWatchElem?.getAttribute('video-id');
            setExtra('ytd-watch-...[video-id]', videoId);
          }
        } catch (ex) {
          setExtra('ytd-watch-...[video-id] (exception)', ex);
        }
      }

      scope.captureException(ex);
      scope.clear();
    } catch (ex) {
      console.error(ex);
    }
  }
}
