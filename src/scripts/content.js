import { getFeedbackFormLink, getVersion } from './libs/utils'
import { html } from './libs/generic'
import { injectedScript } from './libs/messaging'
import { defaultCrashOptions, storage } from './libs/storage'

storage.addListener(function storageListener(changes) {
  if (!changes.crashOptions?.newValue) return

  const crashOptions = changes.crashOptions.newValue
  injectedScript.postMessage('crashOptions', crashOptions)
})

injectedScript.addMessageListener('get-storage-entries', async function getStorageEntry({ id, nameOrNames }) {
  try {
    if(!chrome.runtime.id) throw new Error('uninstalled')
    let valueOrValues = await storage.get(nameOrNames)
    if(Array.isArray(nameOrNames)) {
      for(const name of nameOrNames) {
        valueOrValues[name] = (valueOrValues[name] === undefined) ? null : valueOrValues[name] // Backward compatibility with localStorage
      }
    } else {
      valueOrValues = (valueOrValues === undefined) ? null : valueOrValues // Backward compatibility with localStorage
    }
    injectedScript.postMessage('get-storage-entries', { id, valueOrValues })
  } catch(error) {
    injectedScript.postMessage('get-storage-entries', { id, error })
  }
})

injectedScript.addMessageListener('set-storage-entry', async function setStorageEntry({ id, name, value }) {
  try {
    if(!chrome.runtime.id) throw new Error('uninstalled')
    await storage.set(name, value)
    injectedScript.postMessage('set-storage-entry', { id })
  } catch(error) {
    injectedScript.postMessage('set-storage-entry', { id, error })
  }
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
    })
})()