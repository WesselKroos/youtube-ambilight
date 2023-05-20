import { storage } from './libs/storage'
import { getBrowser, getFeedbackFormLink, getVersion } from './libs/utils'

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install' && details.reason !== 'update') return

  if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(getFeedbackFormLink())
  }

  if (details.reason === 'install' && getBrowser() === 'Firefox') {
    chrome.runtime.openOptionsPage()
  }

  if(details.reason === 'update' && details.previousVersion) {
    if(getVersion() !== details.previousVersion) {
      storage.set('setting-showUpdates', true)
    }
  }
})

chrome.browserAction.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage()
})