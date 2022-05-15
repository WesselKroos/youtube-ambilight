import { getFeedbackFormLink, getVersion } from './libs/utils'
import { html } from './libs/generic'
import { contentScriptToInjectedScript, fromInjectedScript } from './libs/messaging';
import { defaultCrashOptions, storage } from './libs/storage';

storage.addListener((changes) => {
  if (!changes.crashOptions?.newValue) return

  const crashOptions = changes.crashOptions.newValue
  contentScriptToInjectedScript.postMessage('crashOptions', crashOptions)
})

fromInjectedScript.addMessageListener('getSetting', async (name) => {
  try {
    let value = await storage.get(name)
    value = (value === undefined) ? null : value // Backward compatibility with localStorage
    contentScriptToInjectedScript.postMessage('setting', { name, value })
  } catch(error) {
    contentScriptToInjectedScript.postMessage('setting', { name, error })
  }
})

fromInjectedScript.addMessageListener('setSetting', async ({ name, value }) => {
  await storage.set(name, value)
})

;(async () => {
    const s = document.createElement('script')
    s.defer = true
    s.src = chrome.extension.getURL('scripts/youtube-ambilight.js')

    s.setAttribute('data-version', getVersion())
    s.setAttribute('data-feedback-form-link', getFeedbackFormLink())
    s.setAttribute('data-base-url', chrome.extension.getURL('') || '')
    s.setAttribute('data-crash-options', JSON.stringify(await storage.get('crashOptions') || defaultCrashOptions))
    
    s.onload = () => {
      s.parentNode.removeChild(s)
    }
    s.onerror = (e) => {
      console.error('Adding script failed:', e.target.src, e);
    }
    document.body.appendChild(s)
})()