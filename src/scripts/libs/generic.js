let eventErrorHandler;
export const setEventErrorHandler = (handler) => {
  eventErrorHandler = handler
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
const addEventListenerPrototype = function (eventNames, callback, getListenerCallback) {
  const reportedCallback = (...args) => {
    try {
      callback(...args)
    } catch(ex) {
      const e = args[0]
      const elem = e.currentTarget.cloneNode(false)
      ex.message = `${ex.message} \nOn event: ${e.type} \nAnd element: ${elem.outerHTML || elem.nodeName}`

      console.error(ex)
      if(eventErrorHandler)
        eventErrorHandler(ex)
    }
  }

  const list = eventNames.split(' ')
  list.forEach((eventName) => {
    this.addEventListener(eventName, reportedCallback)
  })

  if(getListenerCallback)
    getListenerCallback(reportedCallback)

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

export const raf = (requestAnimationFrame || webkitRequestAnimationFrame)

export const ctxOptions = {
  alpha: false,
  // desynchronized: false,
  imageSmoothingQuality: 'low'
}

export const $ = {
  create: (tag) => { return document.createElement(tag) },
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
    const observer = new MutationObserver((mutationsList, observer) => {
      if (!check()) return
      observer.disconnect()
      callback()
    })
    observer.observe($.s(containerSelector), {
      childList: true,
      subtree: true
    })
    return observer
  }
}