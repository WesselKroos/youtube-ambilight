export const getOS = () => {
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
}

export const getBrowser = () => {
  try {
    const list = [
      { match: 'Firefox', name: 'Firefox' },
      { match: 'OPR', name: 'Opera' },
      { match: 'Edg', name: 'Edge' },
      { match: 'Chrome', name: 'Chrome' }
    ]
    var ua = window.navigator.userAgent
    var browser = list.find(browser => (ua.indexOf(browser.match) >= 0))
    return (browser) ? browser.name : ua
  } catch (ex) {
    return null
  }
}

export const getVersion = () => {
  try {
    return (chrome.runtime.getManifest() || {}).version
  } catch (ex) {
    return null
  }
}