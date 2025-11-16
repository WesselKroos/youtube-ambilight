let errorHandler = (ex) => {
  console.error(ex);
};
export const setErrorHandler = (handler) => {
  errorHandler = handler;
};
export const getErrorHandler = () => errorHandler;

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

export const appendErrorStack = (stack, ex) => {
  try {
    const stackToAppend = stack?.substring(stack?.indexOf('\n') + 1);
    const stackToSearch = stackToAppend?.substring(
      stackToAppend?.indexOf('\n') + 1
    ); // The first line in the stack trace can contain an extra function name
    const alreadyContainsStack =
      (ex?.stack || ex?.message || ex?.toString())?.indexOf(stackToSearch) !==
      -1;
    if (!alreadyContainsStack) {
      ex.stack = `${ex.stack || ex.message || ex.toString()}\n${stackToAppend}`;
    }
  } catch (ex) {
    console.warn(ex);
  }
};

export const setTimeout = (handler, timeout) => {
  return globalThis.setTimeout(wrapErrorHandler(handler), timeout);
};

export function requestIdleCallback(callback, options, reportOnce = false) {
  return globalThis.requestIdleCallback
    ? globalThis.requestIdleCallback(
        wrapErrorHandler(callback, reportOnce),
        options
      )
    : globalThis.setTimeout(wrapErrorHandler(callback, reportOnce), 1); // Safari (not supported but there are users that try)
}

export const raf = (callback) =>
  requestAnimationFrame(wrapErrorHandler(callback));

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

export const webGLErrorToString = (value) =>
  (({
    1280: 'GL_INVALID_ENUM',
    1281: 'GL_INVALID_VALUE',
    1282: 'GL_INVALID_OPERATION',
    1285: 'GL_OUT_OF_MEMORY',
    1286: 'GL_INVALID_FRAMEBUFFER_OPERATION',
    1287: 'GL_CONTEXT_LOST_WEBGL',
  }[value] ||
    value) ??
  'UNKNOWN');

export const isNetworkError = (ex) =>
  ex?.message === 'Failed to fetch' || // Chromium
  ex?.message === 'NetworkError when attempting to fetch resource.'; // Firefox

export const watchSelectors = [
  'ytd-watch-flexy',
  'ytd-watch-fixie',
  'ytd-watch-grid',
];

export const isEmbedPageUrl = () =>
  globalThis?.location?.pathname?.startsWith('/embed/');

export const isWatchPageUrl = () =>
  ['/watch', '/live/'].some((path) =>
    globalThis?.location?.pathname.startsWith(path)
  ) || isEmbedPageUrl();

let _supportsWebGL;
export const supportsWebGL = () => {
  if (_supportsWebGL === undefined) {
    try {
      _supportsWebGL =
        !!globalThis.WebGLRenderingContext &&
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
      _supportsColorMix =
        globalThis.CSS?.supports?.(
          'background-color: color-mix(in srgb, #000 0%, #000)'
        ) ?? false;
    } catch {
      _supportsColorMix = false;
    }
  }
  return _supportsColorMix;
};
