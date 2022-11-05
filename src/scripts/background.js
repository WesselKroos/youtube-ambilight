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

chrome.contextMenus.create({
  id: 'donate',
  title: '💳 Donate',
  contexts: ['browser_action']
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.tabs.create({
    url: 'https://ko-fi.com/G2G59EK8L'
  })
})