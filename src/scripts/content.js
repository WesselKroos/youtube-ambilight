import { getFeedbackFormLink, getVersion } from './libs/utils'
import { html } from './libs/generic'
import { contentScriptToInjectedScript, fromInjectedScript } from './libs/messaging'
import { defaultCrashOptions, storage } from './libs/storage'

storage.addListener((changes) => {
  if (!changes.crashOptions?.newValue) return

  const crashOptions = changes.crashOptions.newValue
  contentScriptToInjectedScript.postMessage('crashOptions', crashOptions)
})

fromInjectedScript.addMessageListener('getSettings', async (names) => {
  try {
    const data = await storage.get(names.map(name => `setting-${name}`))
    const settings = {}
    for(const name of names) {
      const value = data[`setting-${name}`]
      settings[name] = (value === undefined) ? null : value // Backward compatibility with localStorage
    }
    contentScriptToInjectedScript.postMessage('settings', { settings })
  } catch(error) {
    contentScriptToInjectedScript.postMessage('settings', { names, error })
  }
})

fromInjectedScript.addMessageListener('setSetting', async ({ name, value }) => {
  await storage.set(`setting-${name}`, value)
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
      console.error('Adding script failed:', e.target.src, e)
    }
    document.body.appendChild(s)

    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        return console.error(chrome.runtime.lastError)
      }
      console.log('storage entries', result)
    })
})()