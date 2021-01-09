export const uuidv4 = () => {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

let errorHandler;
export const setErrorHandler = (handler) => {
  errorHandler = handler
}

const wrapErrorHandlerHandleError = (stack, ex) => {
  appendErrorStack(stack, ex)
  if(errorHandler)
    errorHandler(ex)
}

export const wrapErrorHandler = (callback, reportOnce = false) => {
  const stack = new Error().stack
  let reported = false
  return (callback.constructor.name === 'AsyncFunction')
    ? async function withAsyncErrorHandler(...args) {
      try {
        return await callback(...args)
      } catch(ex) {
        if(reportOnce && reported) return
        reported = true
        wrapErrorHandlerHandleError(stack, ex)
      }
    }
    : function withErrorHandler(...args) {
      try {
        return callback(...args)
      } catch(ex) {
        if(reportOnce && reported) return
        reported = true
        wrapErrorHandlerHandleError(stack, ex)
      }
    }
}

export const setTimeout = (handler, timeout) => {
  return window.setTimeout(wrapErrorHandler(handler), timeout)
}

export const on = (elem, eventNames, callback, options, getListenerCallback) => {
  const stack = new Error().stack
  const eventListenerCallback = (...args) => {
    try {
      callback(...args)
    } catch(ex) {
      const e = args[0]
      let elem = {}
      if(e && e.currentTarget) {
        if(e.currentTarget.cloneNode) {
          elem = e.currentTarget.cloneNode(false)
        } else {
          elem.nodeName = e.currentTarget.toString()
        }
      }
      const type = (e.type === 'keydown') ? `${e.type} keyCode: ${e.keyCode}` : e.type;
      ex.message = `${ex.message} \nOn event: ${type} \nAnd element: ${elem.outerHTML || elem.nodeName || 'Unknown'}`

      appendErrorStack(stack, ex)
      if(errorHandler)
        errorHandler(ex)
    }
  }

  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    elem.addEventListener(eventName, eventListenerCallback, options)
  })

  if(getListenerCallback)
    getListenerCallback(eventListenerCallback)
}

export const off = (elem, eventNames, callback) => {
  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    elem.removeEventListener(eventName, callback)
  })
}

export const html = document.querySelector('html')
export const body = document.body

export const raf = (callback) => (requestAnimationFrame || webkitRequestAnimationFrame)(wrapErrorHandler(callback))

export const ctxOptions = {
  alpha: false, // false allows 8k60fps with frame blending + video overlay 30fps -> 144fps
  // desynchronized: true,
  imageSmoothingQuality: 'low'
}

export const $ = {
  s: (selector) => { return document.querySelector(selector) },
  sa: (selector) => { return document.querySelectorAll(selector) },
  param: (name, url) => {
    url = url ? url : window.location.href
    name = name.replace(/[\[\]]/g, "\\$&")
    const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)")
    const results = regex.exec(url)
    if (!results) return null
    if (!results[2]) return ''
    return decodeURIComponent(results[2].replace(/\+/g, " "))
  }
}

export const waitForDomElement = (check, containerSelector, callback) => {
  if (check()) {
    callback()
  } else {
    const observer = new MutationObserver(wrapErrorHandler((mutationsList, observer) => {
      if (!check()) return
      observer.disconnect()
      callback()
    }))
    observer.observe($.s(containerSelector), {
      childList: true,
      subtree: true
    })
    return observer
  }
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

export const requestIdleCallback = function requestIdleCallback(callback, options) {
  return window.requestIdleCallback(wrapErrorHandler(callback), options)
}

export const appendErrorStack = (stack, ex) => {
  try {
    const stackToAppend = stack.substring(stack.indexOf('\n') + 1)
    const stackToSearch = stackToAppend.substring(stackToAppend.indexOf('\n') + 1) // The first line in the stack trace can contain an extra function name
    const alreadyContainsStack = ((ex.stack || ex.message).indexOf(stackToSearch) !== -1)
    if(alreadyContainsStack) return

    ex.stack = `${ex.stack || ex.message}\n${stackToAppend}`
  } catch(ex) { console.warn(ex) }
}