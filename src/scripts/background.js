import { updateDeclarativeNetRequestRules } from './libs/csp-patcher';
import { setErrorHandler } from './libs/errors/base';
import SentryReporter from './libs/errors/sentry-reporter';
import { getBrowser, getFeedbackFormLink } from './libs/utils';

setErrorHandler((ex) => SentryReporter.captureException(ex));

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install' && details.reason !== 'update') return;

  if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(getFeedbackFormLink());
  }

  if (details.reason === 'install' && getBrowser() === 'Firefox') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(updateDeclarativeNetRequestRules);

// Update when extension is installed or reloaded
chrome.runtime.onInstalled.addListener(updateDeclarativeNetRequestRules);

// Keep checking for possible changes every 10 minutes
chrome.alarms.create('updateDeclarativeNetRequestRules', {
  periodInMinutes: 30,
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateDeclarativeNetRequestRules') {
    updateDeclarativeNetRequestRules();
  }
});
