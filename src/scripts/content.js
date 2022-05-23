import { getFeedbackFormLink, getVersion } from './libs/utils'
import { setErrorHandler, wrapErrorHandler } from './libs/generic'
import { injectedScript } from './libs/messaging'
import { defaultCrashOptions, storage } from './libs/storage'
import AmbilightSentry, { setCrashOptions, setVersion } from './libs/ambilight-sentry'

setErrorHandler((ex) => AmbilightSentry.captureExceptionWithDetails(ex))

const version = getVersion()
setVersion(version)

let crashOptions = defaultCrashOptions
const setCrashOptionsPromise = wrapErrorHandler(async function contentSetCrashOptions() {
  crashOptions = await storage.get('crashOptions') || defaultCrashOptions
  setCrashOptions(crashOptions)
})()

storage.addListener(
  function storageListener(changes) {
    if (!changes.crashOptions?.newValue) return

    const crashOptions = changes.crashOptions.newValue
    setCrashOptions(crashOptions)
    injectedScript.postMessage('crashOptions', crashOptions)
  })

injectedScript.addMessageListener('get-storage-entries',
  async function getStorageEntry({ id, nameOrNames }) {
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

injectedScript.addMessageListener('set-storage-entry', 
  async function setStorageEntry({ id, name, value }) {
    try {
      if(!chrome.runtime.id) throw new Error('uninstalled')
      await storage.set(name, value)
      injectedScript.postMessage('set-storage-entry', { id })
    } catch(error) {
      injectedScript.postMessage('set-storage-entry', { id, error })
    }
  })

wrapErrorHandler(async function injectScript() {
  await setCrashOptionsPromise;

  const s = document.createElement('script')
  s.defer = true
  s.src = chrome.extension.getURL('scripts/youtube-ambilight.js')
  s.setAttribute('data-crash-options', JSON.stringify(crashOptions))
  s.setAttribute('data-version', version)
  s.setAttribute('data-feedback-form-link', getFeedbackFormLink())
  s.setAttribute('data-base-url', chrome.extension.getURL('') || '')
  
  s.onload = wrapErrorHandler(function injectScriptOnLoad() {
    s.parentNode.removeChild(s)
  }.bind(this))
  s.onerror = function injectScriptOnError(ex) {
    AmbilightSentry.captureExceptionWithDetails(ex)
  }.bind(this)
  document.body.appendChild(s)
})()