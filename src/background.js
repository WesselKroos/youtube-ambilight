chrome.browserAction.onClicked.addListener(function(tab) {
  chrome.runtime.openOptionsPage()
});

const getOS = () => {
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
  var os = list.find(os => (ua.toLowerCase().indexOf(os.match) >= 0 ))
  return (os) ? os.name : ua
}

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason !== 'install' && details.reason !== 'update')
    return

  debugger;
  var version = (chrome.runtime.getManifest() || {}).version || ''
  var os = getOS()

  var feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}`
  if (!chrome.runtime.setUninstallURL)
    return
    
  chrome.runtime.setUninstallURL(feedbackFormLink)
});