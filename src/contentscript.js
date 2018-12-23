var scripts = [
  'scripts/youtube-ambilight.js'
]
scripts.forEach((path) => {
  var s = document.createElement('script')
  s.src = chrome.extension.getURL(path)
  document.head.appendChild(s)
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
})