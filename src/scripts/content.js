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
    const {
      crashOptions: crashOptionsChange,
      ...settingsChanges
    } = changes

    if (crashOptionsChange?.newValue) {
      const crashOptions = crashOptionsChange.newValue
      setCrashOptions(crashOptions)
      injectedScript.postMessage('crashOptions', crashOptions)
    }

    if(settingsChanges && Object.keys(settingsChanges).length) {
      injectedScript.postMessage('settings', settingsChanges)
    }
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

  const script = document.createElement('script')
  script.defer = true
  script.src = chrome.runtime.getURL('scripts/injected.js')
  script.setAttribute('data-crash-options', JSON.stringify(crashOptions))
  script.setAttribute('data-version', version)
  script.setAttribute('data-feedback-form-link', getFeedbackFormLink())
  script.setAttribute('data-base-url', chrome.runtime.getURL('') || '')
  script.onerror = function injectScriptOnError(ex) {
    SentryReporter.captureException(ex)
  }.bind(this)
  document.head.appendChild(script)

  
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = chrome.runtime.getURL('styles/content.css')
  style.onerror = function injectStyleOnError(ex) {
    SentryReporter.captureException(ex)
  }.bind(this)
  document.head.appendChild(style)
}))()