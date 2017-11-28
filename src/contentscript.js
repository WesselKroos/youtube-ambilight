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

window.addEventListener("message", function(event) {
  if (event.source != window) return
  if (event.data.type && event.data.type == "GET_SETTINGS") {
    chrome.storage.sync.get({
      enabled: true,
      'immersive-mode': false,
      brightness: 100,
      contrast: 100,
      saturation: 110,
      size: 5,
      strength: 3
    }, (settings) => {
      window.postMessage({ type: "RECEIVE_SETTINGS", settings: settings }, "*")
    })
  }
})

queuedSettingsChangedEvent = null
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(queuedSettingsChangedEvent)
    clearTimeout(queuedSettingsChangedEvent)

    queuedSettingsChangedEvent = setTimeout(() => {
    window.postMessage({ type: "GET_SETTINGS" }, "*");
  }, 100)
})