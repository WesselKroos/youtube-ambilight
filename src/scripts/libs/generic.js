let errorHandler;
export const setErrorHandler = (handler) => {
  errorHandler = handler
}

const wrapErrorHandlerHandleError = (stack, ex) => {
  appendErrorStack(stack, ex)
  if(errorHandler)
    errorHandler(ex)
}

export const wrapErrorHandler = (callback) => {
  const stack = new Error().stack
  return (callback.constructor.name === 'AsyncFunction')
    ? async function withAsyncErrorHandler(...args) {
      try {
        return await callback(...args)
      } catch(ex) {
        wrapErrorHandlerHandleError(stack, ex)
      }
    }
    : function withErrorHandler(...args) {
      try {
        return callback(...args)
      } catch(ex) {
        wrapErrorHandlerHandleError(stack, ex)
      }
    }
}

export const setTimeout = (handler, timeout) => {
  return window.setTimeout(wrapErrorHandler(handler), timeout)
}

HTMLElement.prototype.attr = function (name, value) {
  if (typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
HTMLElement.prototype.append = function (elem) {
  if (typeof elem === 'string')
    elem = document.createTextNode(elem)
  this.appendChild(elem)
  return this
}
HTMLElement.prototype.appendTo = function (elem) {
  elem.append(this)
  return this
}
HTMLElement.prototype.prependChild = function (elem) {
  this.prepend(elem)
  return this
}
HTMLElement.prototype.prependTo = function (elem) {
  elem.prepend(this)
  return this
}
HTMLElement.prototype.class = function (className) {
  const existingClasses = this.className.split(' ')
  if (existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function (className) {
  const classList = this.className.split(' ')
  const pos = classList.indexOf(className)
  if (pos !== -1) {
    classList.splice(pos, 1)
    this.className = classList.join(' ')
  }
  return this
}
const addEventListenerPrototype = function (eventNames, callback, options, getListenerCallback) {
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
    this.addEventListener(eventName, eventListenerCallback, options)
  })

  if(getListenerCallback)
    getListenerCallback(eventListenerCallback)

  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype
HTMLDocument.prototype.on = addEventListenerPrototype

const removeEventListenerPrototype = function (eventNames, callback) {
  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.removeEventListener(eventName, callback)
  })
  return this
}
HTMLElement.prototype.off = removeEventListenerPrototype
Window.prototype.off = removeEventListenerPrototype

HTMLElement.prototype.offset = function () {
  return this.getBoundingClientRect()
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