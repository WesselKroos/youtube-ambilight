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

export const getBrowserVersion = () => {
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