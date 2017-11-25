$ = {
  create: (tag) => { return document.createElement(tag) },
  s: (selector) => { return document.querySelector(selector) },
  sa: (selector) => { return document.querySelectorAll(selector) },
  param: (name, url) => {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }
}

HTMLElement.prototype.attr = function(name, value) {
  if(typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
HTMLElement.prototype.append = function(elem) {
  if(typeof elem === 'string')
    elem = document.createTextNode(elem)
  this.appendChild(elem)
  return this
}
HTMLElement.prototype.appendTo = function(elem) {
  elem.append(this)
  return this
}
HTMLElement.prototype.prependTo = function(elem) {
  elem.prepend(this)
  return this
}
HTMLElement.prototype.class = function(className) {
  var existingClasses = this.className.split(' ')
  if(existingClasses.indexOf(className) === -1)
    this.className += ' ' + className
  return this
}
HTMLElement.prototype.removeClass = function(className) {
  var classList = this.className.split(' ')
  var pos = classList.indexOf(className)
  if(pos !== -1) {
    classList.splice(pos, 1)
    this.className = classList
  }
  return this
}
HTMLElement.prototype.text = function(text) {
  this.innerText = text
  return this
}
addEventListenerPrototype = function(eventName, callback) {
  this.addEventListener(eventName, callback)
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype
Window.prototype.on = addEventListenerPrototype

HTMLElement.prototype.offset = function() {
  return this.getBoundingClientRect()
}

Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
  get: function(){
      return !!(this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2);
  }
})

body = document.body
