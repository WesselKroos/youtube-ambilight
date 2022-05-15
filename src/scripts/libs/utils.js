const getOS = () => {
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
    return (os) ? os.name : ''
  } catch (ex) {
    return null
  }
}

const browsersUAList = [
  { ua: 'Firefox', name: 'Firefox' },
  { ua: 'OPR', name: 'Opera' },
  { ua: 'Edg', name: 'Edge' },
  { ua: 'Chrome', name: 'Chrome' }
]

export const getBrowser = () => {
  try {
    var ua = window.navigator.userAgent
    var browser = browsersUAList.find(browser => (ua.indexOf(browser.ua) >= 0))
    return (browser) ? browser.name : ''
  } catch (ex) {
    return null
  }
}

const getBrowserVersion = () => {
  try {
    var browserName = getBrowser()
    var browserUA = browsersUAList.find(browser => browserName === browser.name).ua
    var ua = window.navigator.userAgent
    var matches = ua.match(`${browserUA}\/([0-9.]+)`)
    return (matches.length === 2) ? matches[1] : ua
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

export const getFeedbackFormLink = (version) => {
  version = version || getVersion() || ''
  const os = getOS() || ''
  const browser = getBrowser() || ''
  const browserVersion = getBrowserVersion()
  return `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}&entry.964326861=${browser}&entry.908541589=${browserVersion}`
}

const privacyPolicyLinks = {
  Firefox: 'https://addons.mozilla.org/firefox/addon/youtube-ambilight/privacy/'
}
export const getPrivacyPolicyLink = () => {
  const browser = getBrowser()
  return privacyPolicyLinks[browser] || 'https://github.com/WesselKroos/youtube-ambilight#privacy--security'
}