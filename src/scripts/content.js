import { getFeedbackFormLink, getVersion } from './libs/utils'
import { setErrorHandler, wrapErrorHandler } from './libs/generic'
import { injectedScript } from './libs/messaging'
import { defaultCrashOptions, storage } from './libs/storage'
import SentryReporter, { setCrashOptions, setVersion } from './libs/sentry-reporter'

setErrorHandler((ex) => SentryReporter.captureException(ex))

;(wrapErrorHandler(async function loadContentScript() {
  const version = getVersion()
  setVersion(version)

  let crashOptions = defaultCrashOptions
  try {
    crashOptions = await storage.get('crashOptions') || defaultCrashOptions
    setCrashOptions(crashOptions)
  } catch(ex) {
    SentryReporter.captureException(ex)
  }

  storage.addListener(function storageListener(changes) {
    if (!changes.crashOptions?.newValue) return

    const crashOptions = changes.crashOptions.newValue
    setCrashOptions(crashOptions)
    injectedScript.postMessage('crashOptions', crashOptions)
  })

  injectedScript.addMessageListener('get-storage-entries',
    async function getStorageEntry({ id, nameOrNames }) {
      try {
        if(!chrome.runtime?.id) throw new Error('uninstalled')
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
        if(!chrome.runtime?.id) throw new Error('uninstalled')
        await storage.set(name, value)
        injectedScript.postMessage('set-storage-entry', { id })
      } catch(error) {
        injectedScript.postMessage('set-storage-entry', { id, error })
      }
    })

  // const addWebGLLint = () => {
  //   const s = document.createElement('script')
  //   s.src = 'https://greggman.github.io/webgl-lint/webgl-lint.js'
  //   s.setAttribute('data-gman-debug-helper', JSON.stringify({
  //     throwOnError: false
  //   }))
  //   s.onerror = function injectScriptOnError(ex) {
  //     console.error(ex)
  //   }.bind(this)
  //   document.body.appendChild(s)
  // }
  // addWebGLLint()

  const s = document.createElement('script')
  s.defer = true
  s.src = chrome.runtime.getURL('scripts/injected.js')
  s.setAttribute('data-crash-options', JSON.stringify(crashOptions))
  s.setAttribute('data-version', version)
  s.setAttribute('data-feedback-form-link', getFeedbackFormLink())
  s.setAttribute('data-base-url', chrome.runtime.getURL('') || '')
  
  s.onload = wrapErrorHandler(function injectScriptOnLoad() {
    if(s.parentNode) s.parentNode.removeChild(s)
  }.bind(this))
  s.onerror = function injectScriptOnError(ex) {
    SentryReporter.captureException(ex)
  }.bind(this)
  document.body.appendChild(s)
}))()