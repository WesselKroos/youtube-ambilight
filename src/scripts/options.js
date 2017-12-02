//// Generic

$ = {
  s: (selector) => { return document.querySelector(selector) },
  sa: (selector) => { return document.querySelectorAll(selector) }
}
HTMLElement.prototype.attr = function(name, value) {
  if(typeof value === 'undefined') {
    return this.getAttribute(name)
  } else {
    this.setAttribute(name, value)
    return this
  }
}
addEventListenerPrototype = function(eventName, callback) {
  this.addEventListener(eventName, callback)
  return this
}
HTMLElement.prototype.on = addEventListenerPrototype

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
    this.className = classList.join(' ')
  }
  return this
}

body = document.body


//// Options

options = {
  restore: () => {
    chrome.storage.sync.get(options.default, (settings) => {
      options.set(settings)
    })
  },
  default: {
    enabled: true,
    'immersive-mode': false,
    strength: 4,
    spread: 23,
    blur: 45,
    contrast: 115,
    saturation: 100,
    brightness: 100
  },
  reset: () => {
    options.set(options.default)
  },
  set: (settings) => {
    Object.keys(settings).forEach((option) => {
      input = $.s(`#${option}`)
      if(input.attr('type') == 'checkbox') {
        input.checked = settings[option]
      } else {
        input.value = settings[option]
      }
      changeEvent = new Event('change');
      input.dispatchEvent(changeEvent)
    })
  },
  validate: (input) => {
    var min = input.attr('min')
    var max = input.attr('max')
    if(parseInt(input.value) < min) input.value = min
    if(parseInt(input.value) > max) input.value = max
  },
  save: (name, value) => {
    chrome.storage.sync.set({[name]: value}, () => {
      console.log(`saved [${name}=${value}]`)
    })
  }
}

$.sa('input[type="number"]').forEach(input => {
  update = () => {
    name = input.attr('id')
    $.s(`#${name}-range`).value = input.value

    const warnFrom = input.attr('data-warn-from')
    if(warnFrom) {
      const warn = $.s(`#${name}-warn`)
      if(parseInt(input.value) > parseInt(warnFrom)) {
        warn.class('warn--show')
      } else {
        warn.removeClass('warn--show')
      }
    } 
  }
  input.on('keypress', event => {
    var valid = event.charCode >= 48 && event.charCode <= 57
    if(!valid) event.preventDefault()
    update()
  })
  input.on('keyup', event => { 
    options.validate(input)
  })
  input.on('change', update)
});
$.sa('input[type="range"]').forEach(input => {
  input.on('change', event => {
    inputNumberId = input.attr('id').substr(0, input.attr('id').indexOf('-'))
    inputNumber = $.s(`#${inputNumberId}`)
    inputNumber.value = input.value
    changeEvent = new Event('change');
    inputNumber.dispatchEvent(changeEvent)
  })
})
$.sa('input:not([type="range"])').forEach(input => {
  input.on('change', event => {
    options.validate(input)
    options.save(input.attr('id'), (input.attr('type') == 'checkbox') ? input.checked : input.value)
  })
})
$.s('#reset').on('click', options.reset)


document.addEventListener('DOMContentLoaded', () => options.restore());


// Info toggle

$.s('#info').on('click', () => {
  if(!body.attr('class') || body.attr('class').indexOf('show-info') === -1)
    body.class('show-info')
  else
    body.removeClass('show-info')
})