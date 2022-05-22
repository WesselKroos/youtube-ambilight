import { getBrowser, getFeedbackFormLink } from './libs/utils'

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install' && details.reason !== 'update') return

  if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(getFeedbackFormLink())
  }

  if (details.reason !== 'install' || getBrowser() !== 'Firefox') return
  
  chrome.runtime.openOptionsPage()
})

chrome.browserAction.onClicked.addListener(function (tab) {
  chrome.runtime.openOptionsPage()
})