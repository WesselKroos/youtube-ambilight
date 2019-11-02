import { getOS, getVersion } from './libs/utils'

chrome.browserAction.onClicked.addListener(function (tab) {
  chrome.runtime.openOptionsPage()
});

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install' && details.reason !== 'update')
    return

  const version = getVersion() || ''
  const os = getOS() || ''

  const feedbackFormLink = `https://docs.google.com/forms/d/e/1FAIpQLSe5lenJCbDFgJKwYuK_7U_s5wN3D78CEP5LYf2lghWwoE9IyA/viewform?usp=pp_url&entry.1590539866=${version}&entry.1676661118=${os}`
  if (!chrome.runtime.setUninstallURL)
    return

  chrome.runtime.setUninstallURL(feedbackFormLink)


  // if (details.reason !== 'update') return

  // chrome.notifications.create(
  //   {
  //     type: "list",
  //     title: `YouTube Ambilight updated to ${(chrome.runtime.getManifest() || {}).version} New:`,
  //     message: "Primary message to display",
  //     iconUrl: chrome.extension.getURL("/images/icon-128.png"),
  //     items: [
  //       { title: "1", message: "Added 3 more settings: \nFade out start, curve & edge size." },
  //       { title: "2", message: "Fixed vertical video's spread size." },
  //       { title: "3", message: "Performance improvements" }
  //     ]
  //   }
  // );
});