chrome.browserAction.onClicked.addListener(function(tab) {
  chrome.runtime.openOptionsPage()
});

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason !== "install")
    return

  var feedbackFormLink = 'https://docs.google.com/forms/d/1OU7e3fOXk2NJSppCj4hrAE0lUgi8utccdooX1rUnycU'

  if (!chrome.runtime.setUninstallURL)
    return
    
  chrome.runtime.setUninstallURL(feedbackFormLink)
});