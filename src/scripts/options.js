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


options = {
  restore: () => {
    chrome.storage.sync.get(options.default, (settings) => {
      options.set(settings)
    })
  },
  default: {
    enabled: true,
    'immersive-mode': false,
    brightness: 100,
    contrast: 100,
    saturation: 110,
    size: 5,
    strength: 4
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
  updateRange = () => {
    inputRangeId = `${input.attr('id')}-range`
    $.s(`#${inputRangeId}`).value = input.value
  }
  input.on('keypress', event => {
    var valid = event.charCode >= 48 && event.charCode <= 57
    if(!valid) event.preventDefault()
    updateRange()
  })
  input.on('keyup', event => { 
    options.validate(input)
  })
  input.on('change', updateRange)
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