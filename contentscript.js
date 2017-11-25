// Scripts
var scripts = [
  'scripts/generic.js',
  'scripts/youtube-ambilight.js'
]
scripts.forEach((path) => {
  var s = document.createElement('script')
  s.src = chrome.extension.getURL(path)
document.head.appendChild(s)
  s.onload = function() {
    s.parentNode.removeChild(s)
  }
})