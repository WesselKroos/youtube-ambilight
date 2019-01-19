const utils = {
  getOS: () => {
    try {
      const list = [
        { match: 'window', name: 'Windows' },
        { match: 'mac', name: 'Mac' },
        { match: 'cros', name: 'Chrome+OS' },
        { match: 'ubuntu', name: 'Ubuntu+(Linux)' },
        { match: 'android', name: 'Android' },
        { match: 'ios', name: 'iOS' },
        { match: 'x11', name: 'Linux' },
      ]
      var ua = window.navigator.userAgent
      var os = list.find(os => (ua.toLowerCase().indexOf(os.match) >= 0))
      return (os) ? os.name : ua
    } catch (ex) {
      return null
    }
  },

  getVersion: () => {
    try {
      return (chrome.runtime.getManifest() || {}).version
    } catch (ex) {
      return null
    }
  }
}

const scripts = [
  'scripts/youtube-ambilight.js'
]
scripts.forEach((path) => {
  const s = document.createElement('script')
  s.src = chrome.extension.getURL(path)
  document.head.appendChild(s)
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
})

const setExtensionInfo = () => {
  const version = utils.getVersion() || ''
  const os = utils.getOS() || ''

  document.body.setAttribute('data-ambilight-version', version);
  document.body.setAttribute('data-ambilight-os', os);
}

setExtensionInfo()