export const uuidv4 = () => {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export const waitForDomElement = (check, container, timeout) => new Promise((resolve, reject) => {
  if (check()) {
    resolve()
  } else {
    let timeoutId;
    const observer = new MutationObserver((mutationsList, observer) => {
      if (!check()) return

      if(timeoutId) clearTimeout(timeoutId)
      observer.disconnect()
      resolve()
    })
    if(timeout) {
      timeoutId = setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Element not found after ${timeout}ms`))
      })
    }
    observer.observe(container, {
      childList: true,
      subtree: true
    })
    return observer
  }
})

let errorHandler = (ex) => {
  console.error(`Ambient light for YouTube™ |`, ex)
}
export const setErrorHandler = (handler) => {
  errorHandler = handler
}

const wrapErrorHandlerHandleError = (stack, ex, reportOnce, reported) => {
  if(reportOnce) {
    if(reported.includes(ex.message)) return
    reported.push(ex.message)
  }
  appendErrorStack(stack, ex)
  if(errorHandler)
    errorHandler(ex)
}

const withErrorHandler = (callback, reportOnce, stack, reported) =>
  function errorHandler(...args) {
    try {
      return callback(...args)
    } catch(ex) {
      wrapErrorHandlerHandleError(stack, ex, reportOnce, reported)
    }
  }

const withAsyncErrorHandler = (callback, reportOnce, stack, reported) => 
  async function asyncErrorHandler(...args) {
    try {
      return await callback(...args)
    } catch(ex) {
      wrapErrorHandlerHandleError(stack, ex, reportOnce, reported)
    }
  }

export const wrapErrorHandler = (callback, reportOnce = false) =>
  (callback.constructor.name === 'AsyncFunction'
    ? withAsyncErrorHandler 
    : withErrorHandler
  )(callback, reportOnce, new Error().stack, [])

export const setTimeout = (handler, timeout) => {
  return window.setTimeout(wrapErrorHandler(handler), timeout)
}

export function on(elem, eventNames, callback, options, getListenerCallback, reportOnce = false) {
  try {
    const stack = new Error().stack
    const callbacksName = `on_${eventNames.split(' ').join('_')}`
    let reported = [];
    const namedCallbacks = {
      [callbacksName]: async (...args) => {
        try {
          await callback(...args)
        } catch(ex) {
          if(reportOnce) {
            if(reported.includes(ex.message)) return
            reported.push(ex.message)
          }
          
          const e = args.length ? args[0] : {}
          const type = (e.type === 'keydown') ? `${e.type} keyCode: ${e.keyCode}` : e.type;
          ex.message = `${ex.message} \nOn event: ${type}`

          try {
            if(elem) {
              ex.message = `${ex.message} \nElem: ${elem.toString()} ${elem.nodeName || ''}#${elem.id || ''}.${elem.className || ''}`
            }
          } catch(elemEx) {
            ex.details = {
              ...(ex.details || {}),
              elemEx
            }
          }

          try {
            if(e?.target) {
              ex.message = `${ex.message} \nTarget: ${e.target.toString()} ${e.target.nodeName || ''}#${e.target.id || ''}.${e.target.className || ''}`
            }
          } catch(targetEx) {
            ex.details = {
              ...(ex.details || {}),
              targetEx
            }
          }

          try {
            if(e?.currentTarget) {
              ex.message = `${ex.message} \nCurrentTarget: ${e.currentTarget.toString()} ${e.currentTarget.nodeName || ''}#${e.currentTarget.id || ''}.${e.currentTarget.className || ''}`
            }
          } catch(currentTargetEx) {
            ex.details = {
              ...(ex.details || {}),
              currentTargetEx
            }
          }

          ex.details = {
            ...(ex.details || {}),
            eventNames,
            options,
            reportOnce
          }
    
          appendErrorStack(stack, ex)
          if(errorHandler)
            errorHandler(ex)
        }
      }
    }
    const eventListenerCallback = namedCallbacks[callbacksName]

    const list = eventNames.split(' ')
    list.forEach(function eventNamesAddEventListener(eventName) {
      elem.addEventListener(eventName, eventListenerCallback, options)
    })

    if(getListenerCallback)
      getListenerCallback(eventListenerCallback)
  } catch(ex) {
    ex.details = {
      eventNames,
      options,
      reportOnce
    }

    try {
      if(elem) {
        ex.message = `${ex.message} \nFor element: ${elem.toString()} ${elem.nodeName || ''}#${elem.id || ''}.${elem.className || ''}`
      }
    } catch(elemEx) {
      ex.details = {
        ...(ex.details || {}),
        elemEx
      }
    }
    
    console.log('catched', ex)
    throw ex
  }
}

export function off(elem, eventNames, callback) {
  try {
    const list = eventNames.split(' ')
    list.forEach(function eventNamesRemoveEventListener(eventName) {
      elem.removeEventListener(eventName, callback)
    })
  } catch(ex) {
    ex.details = {
      eventNames
    }

    try {
      if(elem) {
        ex.message = `${ex.message} \nFor element: ${elem.toString()} ${elem.nodeName || ''}#${elem.id || ''}.${elem.className || ''}`
      }
    } catch(elemEx) {
      ex.details = {
        ...(ex.details || {}),
        elemEx
      }
    }
    
    throw ex
  }
}

export const html = document.documentElement
export const body = document.body

export const raf = (callback) => requestAnimationFrame(wrapErrorHandler(callback))

const colorSpace = (
  // rec2020 in canvas is not yet supported 
  // window.matchMedia('(color-gamut: rec2020)').matches
  //   ? 'rec2020'
  //   : (
      window.matchMedia('(color-gamut: p3)').matches
      ? 'display-p3'
      : 'srgb'
  //  )
)

const extendedColorSpace = (
  // rec2020 in canvas is not yet supported 
  window.matchMedia('(color-gamut: rec2020)').matches
    ? 'rec2020'
    : (
      window.matchMedia('(color-gamut: p3)').matches
      ? 'display-p3'
      : 'srgb'
  )
)

export const ctxOptions = {
  alpha: false,
  // desynchronized: true,
  imageSmoothingQuality: 'low',
  colorSpace,
  extendedColorSpace
}

export class Canvas {
  constructor(width, height, pixelated) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    if (pixelated) {
      canvas.style.imageRendering = 'pixelated'
    }
    return canvas
  }
}

export class SafeOffscreenCanvas {
  constructor(width, height, pixelated) {
    if(typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height)
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      if (pixelated) {
        canvas.style.imageRendering = 'pixelated'
      }
      return canvas
    }
  }
}

export function requestIdleCallback(callback, options, reportOnce = false) {
  return window.requestIdleCallback
    ? window.requestIdleCallback(wrapErrorHandler(callback, reportOnce), options)
    : window.setTimeout(wrapErrorHandler(callback, reportOnce), 1) // Safari (not supported but there are users that try)
}

export const appendErrorStack = (stack, ex) => {
  try {
    const stackToAppend = stack.substring(stack.indexOf('\n') + 1)
    const stackToSearch = stackToAppend.substring(stackToAppend.indexOf('\n') + 1) // The first line in the stack trace can contain an extra function name
    const alreadyContainsStack = ((ex.stack || ex.message).indexOf(stackToSearch) !== -1)
    if(!alreadyContainsStack) {
      ex.stack = `${ex.stack || ex.message}\n${stackToAppend}`
    }
  } catch(ex) { console.warn(ex) }
  return ex
}

let _supportsWebGL;
export const supportsWebGL = () => {
  if(_supportsWebGL === undefined) {
    try {
      _supportsWebGL = (
        !!window.WebGLRenderingContext && (
          !!document.createElement('canvas')?.getContext('webgl') ||
          !!document.createElement('canvas')?.getContext('webgl2')
      ))
    } catch {
      _supportsWebGL = false
    }
  }
  return _supportsWebGL
}

export const isWatchPageUrl = () => (location.pathname === '/watch')

export const getCookie = async (name) => 
  window.cookieStore
    ? await cookieStore.get(name)
    : document.cookie.split('; ')
      .map(cookie => {
        const nameValue = cookie.split(/=(.*)/s);
        return {
          name: nameValue[0],
          value: nameValue[1]
        }
      })
      .find(cookie => cookie.name === name)

export const networkStateToString = (value) => (({
  0: 'NETWORK_EMPTY',
  1: 'NETWORK_IDLE',
  2: 'NETWORK_LOADING',
  3: 'NETWORK_NO_SOURCE'
})[value] || value) ?? 'UNKNOWN'

export const readyStateToString = (value) => (({
  0: 'HAVE_NOTHING',
  1: 'HAVE_METADATA',
  2: 'HAVE_CURRENT_DATA',
  3: 'HAVE_FUTURE_DATA',
  4: 'HAVE_ENOUGH_DATA'
})[value] || value) ?? 'UNKNOWN'

export const mediaErrorToString = (value) => (({
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
})[value] || value) ?? 'UNKNOWN'