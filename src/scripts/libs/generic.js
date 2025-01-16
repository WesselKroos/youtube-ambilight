export const uuidv4 = () => {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
};

export const waitForDomElement = (check, container, timeout) =>
  new Promise((resolve, reject) => {
    if (check()) {
      resolve();
    } else {
      let timeoutId;
      const observer = new MutationObserver((mutationsList, observer) => {
        if (!check()) return;

        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
        resolve();
      });
      if (timeout) {
        timeoutId = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Element not found after ${timeout}ms`));
        });
      }
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
      return observer;
    }
  });

let errorHandler = (ex) => {
  console.error(ex);
};
export const setErrorHandler = (handler) => {
  errorHandler = handler;
};

let displayErrorHandler;
export const setDisplayErrorHandler = (handler) => {
  displayErrorHandler = handler;
};

const wrapErrorHandlerHandleError = (stack, ex, reportOnce, reported) => {
  if (reportOnce) {
    if (reported.includes(ex.message)) return;
    reported.push(ex.message);
  }
  appendErrorStack(stack, ex);
  if (errorHandler) errorHandler(ex);
  if (displayErrorHandler) displayErrorHandler(ex);
};

const withErrorHandler = (callback, reportOnce, stack, reported) => {
  const callbackName = callback.name || 'anonymous';
  const container = {
    [callbackName]: (...args) => {
      try {
        return callback(...args);
      } catch (ex) {
        wrapErrorHandlerHandleError(stack, ex, reportOnce, reported);
      }
    },
  };
  return container[callbackName];
};

const withAsyncErrorHandler = (callback, reportOnce, stack, reported) => {
  const callbackName = callback.name || 'anonymous';
  const container = {
    [callbackName]: async (...args) => {
      try {
        return await callback(...args);
      } catch (ex) {
        wrapErrorHandlerHandleError(stack, ex, reportOnce, reported);
      }
    },
  };
  return container[callbackName];
};

export const wrapErrorHandler = (callback, reportOnce = false) =>
  (callback.constructor.name === 'AsyncFunction'
    ? withAsyncErrorHandler
    : withErrorHandler)(callback, reportOnce, new Error().stack, []);

export const setTimeout = (handler, timeout) => {
  return window.setTimeout(wrapErrorHandler(handler), timeout);
};

const eventListenerCallbacks = [];
export function on(elem, eventNames, callback, options, reportOnce = false) {
  try {
    const stack = new Error().stack;
    const callbacksName = `on_${eventNames.split(' ').join('_')}`;
    let reported = [];
    const namedCallbacks = {
      [callbacksName]: async (...args) => {
        try {
          await callback(...args);
        } catch (ex) {
          if (reportOnce) {
            if (reported.includes(ex.message)) return;
            reported.push(ex.message);
          }

          const e = args.length ? args[0] : {};
          const type =
            e.type === 'keydown' ? `${e.type} keyCode: ${e.keyCode}` : e.type;
          ex.message = `${ex.message} \nOn event: ${type}`;

          try {
            if (elem) {
              ex.message = `${ex.message} \nElem: ${elem.toString()} ${
                elem.nodeName || ''
              }#${elem.id || ''}.${elem.className || ''}`;
            }
          } catch (elemEx) {
            ex.details = {
              ...(ex.details || {}),
              elemEx,
            };
          }

          try {
            if (e?.target) {
              ex.message = `${ex.message} \nTarget: ${e.target.toString()} ${
                e.target.nodeName || ''
              }#${e.target.id || ''}.${e.target.className || ''}`;
            }
          } catch (targetEx) {
            ex.details = {
              ...(ex.details || {}),
              targetEx,
            };
          }

          try {
            if (e?.currentTarget) {
              ex.message = `${
                ex.message
              } \nCurrentTarget: ${e.currentTarget.toString()} ${
                e.currentTarget.nodeName || ''
              }#${e.currentTarget.id || ''}.${e.currentTarget.className || ''}`;
            }
          } catch (currentTargetEx) {
            ex.details = {
              ...(ex.details || {}),
              currentTargetEx,
            };
          }

          ex.details = {
            ...(ex.details || {}),
            eventNames,
            options,
            reportOnce,
          };

          appendErrorStack(stack, ex);
          if (errorHandler) errorHandler(ex);
        }
      },
    };
    const eventListenerCallback = namedCallbacks[callbacksName];
    const eventNamesList = eventNames.split(' ');

    const existingEventListenerCallback = eventListenerCallbacks.find(
      (e) =>
        e.args.elem === elem &&
        e.args.callback === callback &&
        JSON.stringify(e.args.options) === JSON.stringify(options)
    );

    eventNamesList.forEach(function eventNamesAddEventListener(eventName) {
      if (existingEventListenerCallback) {
        if (
          existingEventListenerCallback.args.eventNamesList.includes(eventName)
        ) {
          return;
        } else {
          existingEventListenerCallback.args.eventNamesList.push(eventName);
        }
      }
      elem.addEventListener(eventName, eventListenerCallback, options);
    });

    if (!existingEventListenerCallback) {
      eventListenerCallbacks.push({
        args: {
          elem,
          eventNamesList,
          callback,
          options,
        },
        callback: eventListenerCallback,
      });
    }
  } catch (ex) {
    ex.details = {
      eventNames,
      options,
      reportOnce,
    };

    try {
      if (elem) {
        ex.message = `${ex.message} \nFor element: ${elem.toString()} ${
          elem.nodeName || ''
        }#${elem.id || ''}.${elem.className || ''}`;
      }
    } catch (elemEx) {
      ex.details = {
        ...(ex.details || {}),
        elemEx,
      };
    }

    console.log('catched', ex);
    throw ex;
  }
}

export function off(elem, eventNames, callback) {
  try {
    const list = eventNames.split(' ');
    list.forEach(function eventNamesRemoveEventListener(eventName) {
      const eventListenerCallback = eventListenerCallbacks.find(
        (e) =>
          e.args.elem === elem &&
          e.args.callback === callback &&
          e.args.eventNamesList.includes(eventName)
      );
      if (!eventListenerCallback) return;

      eventListenerCallback.args.eventNamesList.splice(
        eventListenerCallback.args.eventNamesList.indexOf(eventName),
        1
      );

      if (eventListenerCallback.args.eventNamesList.length === 0) {
        eventListenerCallbacks.splice(
          eventListenerCallbacks.indexOf(eventListenerCallback),
          1
        );
      }

      elem.removeEventListener(
        eventName,
        eventListenerCallback.callback,
        eventListenerCallback.args.options
      );
    });
  } catch (ex) {
    ex.details = {
      eventNames,
    };

    try {
      if (elem) {
        ex.message = `${ex.message} \nFor element: ${elem.toString()} ${
          elem.nodeName || ''
        }#${elem.id || ''}.${elem.className || ''}`;
      }
    } catch (elemEx) {
      ex.details = {
        ...(ex.details || {}),
        elemEx,
      };
    }

    throw ex;
  }
}

export const raf = (callback) =>
  requestAnimationFrame(wrapErrorHandler(callback));

const colorSpace =
  // rec2020 in canvas is not yet supported
  // window.matchMedia('(color-gamut: rec2020)').matches
  //   ? 'rec2020'
  //   : (
  window.matchMedia('(color-gamut: p3)').matches ? 'display-p3' : 'srgb';
//  )

const extendedColorSpace =
  // rec2020 in canvas is not yet supported
  window.matchMedia('(color-gamut: rec2020)').matches
    ? 'rec2020'
    : window.matchMedia('(color-gamut: p3)').matches
    ? 'display-p3'
    : 'srgb';

export const ctxOptions = {
  // alpha: false, // Decreases performance on some platforms
  // desynchronized: true,
  imageSmoothingQuality: 'low',
  colorSpace,
  extendedColorSpace,
};

export class Canvas {
  constructor(width, height, pixelated) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    if (pixelated) {
      canvas.style.imageRendering = 'pixelated';
    }
    return canvas;
  }
}

export class SafeOffscreenCanvas {
  constructor(width, height, pixelated) {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      if (pixelated) {
        canvas.style.imageRendering = 'pixelated';
      }
      return canvas;
    }
  }
}

export function requestIdleCallback(callback, options, reportOnce = false) {
  return window.requestIdleCallback
    ? window.requestIdleCallback(
        wrapErrorHandler(callback, reportOnce),
        options
      )
    : window.setTimeout(wrapErrorHandler(callback, reportOnce), 1); // Safari (not supported but there are users that try)
}

export const appendErrorStack = (stack, ex) => {
  try {
    const stackToAppend = stack.substring(stack.indexOf('\n') + 1);
    const stackToSearch = stackToAppend.substring(
      stackToAppend.indexOf('\n') + 1
    ); // The first line in the stack trace can contain an extra function name
    const alreadyContainsStack =
      (ex.stack || ex.message).indexOf(stackToSearch) !== -1;
    if (!alreadyContainsStack) {
      ex.stack = `${ex.stack || ex.message}\n${stackToAppend}`;
    }
  } catch (ex) {
    console.warn(ex);
  }
  return ex;
};

let _supportsWebGL;
export const supportsWebGL = () => {
  if (_supportsWebGL === undefined) {
    try {
      _supportsWebGL =
        !!window.WebGLRenderingContext &&
        (!!document.createElement('canvas')?.getContext('webgl') ||
          !!document.createElement('canvas')?.getContext('webgl2'));
    } catch {
      _supportsWebGL = false;
    }
  }
  return _supportsWebGL;
};

let _supportsColorMix;
export const supportsColorMix = () => {
  if (_supportsColorMix === undefined) {
    try {
      _supportsColorMix = CSS.supports(
        'background-color: color-mix(in srgb, #000 0%, #000)'
      );
    } catch {
      _supportsColorMix = false;
    }
  }
  return _supportsColorMix;
};

export const isWatchPageUrl = () =>
  ['/watch', '/live/'].some((path) => location.pathname.startsWith(path)) ||
  isEmbedPageUrl();

export const isEmbedPageUrl = () => location.pathname?.startsWith('/embed/');

export const getCookie = async (name) =>
  window.cookieStore
    ? await cookieStore.get(name)
    : document.cookie
        .split('; ')
        .map((cookie) => {
          const nameValue = cookie.split(/=(.*)/s);
          return {
            name: nameValue[0],
            value: nameValue[1],
          };
        })
        .find((cookie) => cookie.name === name);

export const networkStateToString = (value) =>
  (({
    0: 'NETWORK_EMPTY',
    1: 'NETWORK_IDLE',
    2: 'NETWORK_LOADING',
    3: 'NETWORK_NO_SOURCE',
  }[value] ||
    value) ??
  'UNKNOWN');

export const readyStateToString = (value) =>
  (({
    0: 'HAVE_NOTHING',
    1: 'HAVE_METADATA',
    2: 'HAVE_CURRENT_DATA',
    3: 'HAVE_FUTURE_DATA',
    4: 'HAVE_ENOUGH_DATA',
  }[value] ||
    value) ??
  'UNKNOWN');

export const mediaErrorToString = (value) =>
  (({
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
  }[value] ||
    value) ??
  'UNKNOWN');

export const VIEW_DISABLED = 'DISABLED';
export const VIEW_DETACHED = 'DETACHED';
export const VIEW_SMALL = 'SMALL';
export const VIEW_THEATER = 'THEATER';
export const VIEW_FULLSCREEN = 'FULLSCREEN';
export const VIEW_POPUP = 'POPUP';

export const watchSelectors = [
  'ytd-watch-flexy',
  'ytd-watch-fixie',
  'ytd-watch-grid',
];

let warningElem;
let warningElemText;
export const setWarning = (text) => {
  if (!warningElem) {
    const elem = document.createElement('div');
    elem.style.position = 'fixed';
    elem.style.zIndex = 999999;
    elem.style.left = 0;
    elem.style.bottom = 0;
    elem.style.padding = '5px 8px';
    elem.style.background = 'rgba(0,0,0,.99)';
    elem.style.color = '#fff';
    elem.style.border = '1px solid #f80';
    elem.style.borderTopRightRadius = '3px';
    elem.style.whiteSpace = 'pre-wrap';
    elem.style.fontSize = '15px';
    elem.style.lineHeight = '18px';
    elem.style.fontFamily = 'sans-serif';
    elem.style.overflowWrap = 'anywhere';
    elem.style.overflow = 'hidden';
    warningElem = elem;

    const closeButton = document.createElement('button');
    closeButton.style.position = 'absolute';
    closeButton.style.zIndex = 2;
    closeButton.style.right = 0;
    closeButton.style.top = 0;
    closeButton.style.border = 'none';
    closeButton.style.borderBottomLeftRadius = '3px';
    closeButton.style.padding = '0px 8px';
    closeButton.style.background = '#f80';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.fontFamily = 'inherit';
    closeButton.style.lineHeight = '20px';
    closeButton.style.fontSize = '22px';
    closeButton.style.color = '#000';
    closeButton.style.cursor = 'pointer';
    closeButton.textContent = 'x';
    on(closeButton, 'click', () => setWarning(''));
    elem.appendChild(closeButton);

    const titleElem = document.createElement('div');
    titleElem.style.fontWeight = 'bold';
    titleElem.style.color = '#008cff';
    titleElem.style.fontSize = '22px';
    titleElem.style.lineHeight = '28px';
    titleElem.textContent = 'Ambient light for YouTube™\n';
    elem.appendChild(titleElem);

    const textElem = document.createElement('div');
    warningElemText = textElem;
    elem.appendChild(textElem);
  }

  const elem = warningElem;
  if (text) {
    warningElemText.textContent = text;
    document.documentElement.appendChild(elem);
  } else {
    warningElemText.textContent = '';
    elem.remove();
  }
};

export const isNetworkError = (ex) =>
  ex?.message === 'Failed to fetch' || // Chromium
  ex?.message === 'NetworkError when attempting to fetch resource.'; // Firefox

export const setStyleProperty = (elem, name, value, priority = '') => {
  const currentValue = elem.style.getPropertyValue(name) ?? '';
  const currentPriority = elem.style.getPropertyPriority(name) ?? '';
  if (currentValue === value && currentPriority === priority) return; // Prevent MutationObservers from firing

  elem.style.setProperty(name, value, priority);
};

export const canvas2DCrashTips = `

Reload the webpage to try it again.

Possible causes:
- The memory of your GPU is fully used by another application.
- You have to many YouTube webpages visible at the same time. You GPU can only render a limit amount of ambient lights at the same time.
- You have changed a setting to a value that is incompatible with your GPU. Undo your last change and refresh the webpage. Or reset all settings with the reset button at the top right.`;

export const canvasWebGLCrashTips = `${canvas2DCrashTips}

Another possible workaround could be to turn off the "Quality" > "WebGL renderer" setting (This is an advanced setting). But if you do so, know that the legacy renderer requires more power.`;
