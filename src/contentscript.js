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
  chrome.extension.getURL('scripts/youtube-ambilight.js')
]
scripts.forEach((path) => {
  const s = document.createElement('script')
  s.src = path
  s.onload = () => {
    s.parentNode.removeChild(s)
  }
  s.onerror = (e) => {
    console.error('Adding script failed:', e.target.src, e);
  }
  document.head.appendChild(s)
})

const setExtensionInfo = () => {
  const version = utils.getVersion() || ''
  const os = utils.getOS() || ''

  document.querySelector('html').setAttribute('data-ambilight-version', version);
  document.querySelector('html').setAttribute('data-ambilight-os', os);
}

setExtensionInfo()