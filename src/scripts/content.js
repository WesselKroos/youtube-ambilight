import { getFeedbackFormLink, getVersion } from './libs/utils'
import { setErrorHandler, setWarning, wrapErrorHandler } from './libs/generic'
import { injectedScript } from './libs/messaging'
import { defaultCrashOptions, storage } from './libs/storage'
import SentryReporter, { setCrashOptions, setVersion } from './libs/sentry-reporter'

setErrorHandler((ex) => SentryReporter.captureException(ex))

const waitForHtmlElement = async () => {
  if(document.documentElement) return

  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(() => {
        if(!document.documentElement) return;

        observer.disconnect()
        resolve()
      })
      observer.observe(document, { childList: true })
    } catch(ex) {
      reject(ex)
    }
  })
}

const waitForHeadElement = async () => {
  if(document.head) return

  await new Promise((resolve, reject) => {
    try {
      const observer = new MutationObserver(() => {
        if(!document.head) return;

        observer.disconnect()
        resolve()
      })
      observer.observe(document.documentElement, { childList: true })
    } catch(ex) {
      reject(ex)
    }
  })
}

const captureResourceLoadingException = async (url, event) => {
  let error
  try {
    await new Promise((resolve, reject) => {
      try {
        const req = new XMLHttpRequest()
        req.onreadystatechange = () => {
          try {
            if (req.readyState == XMLHttpRequest.DONE) {
              error = new Error(`Cannot load ${url} (Status: ${req.statusText} ${req.status})`)
              resolve()
            }
          } catch(ex) {
            reject(ex)
          }
        }
        req.open("GET", url, true)
        req.send()
      } catch(ex) {
        reject(ex)
      }
    })
  } catch(ex) {
    error = ex
  } finally {
    error = error ?? new Error(`Cannot load ${url} (Status: unknown)`)
    error.details = event
    SentryReporter.captureException(error)
    
    setWarning(`Failed to load a resource. Reload the webpage to reload the extension. ${'\n\n'
      }Or if this happens often, view the error in your browser's DevTools javascript console panel and report it to the developer. ${'\n'
      }Tip: Look for errors about the url: ${url}`
    )
  }
}

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

  await waitForHtmlElement()
  await waitForHeadElement()

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

  const loaded = await new Promise(resolve => {
    const style = document.createElement('link')
    style.rel = 'stylesheet'
    style.href = chrome.runtime.getURL('styles/content.css')
    style.onerror = async function injectStyleOnError(event) {
      await captureResourceLoadingException(style.href, event)
      resolve(false)
    }.bind(this)
    style.onload = function injectStyleOnLoad() {
      resolve(true)
    }.bind(this)
    document.head.appendChild(style)
  })
  if(!loaded) return

  const script = document.createElement('script')
  script.async = true
  script.src = chrome.runtime.getURL('scripts/injected.js')
  script.setAttribute('data-crash-options', JSON.stringify(crashOptions))
  script.setAttribute('data-version', version)
  script.setAttribute('data-feedback-form-link', getFeedbackFormLink())
  script.setAttribute('data-base-url', chrome.runtime.getURL('') || '')
  script.onerror = async function injectScriptOnError(event) {
    await captureResourceLoadingException(script.src, event)
  }.bind(this)
  document.head.appendChild(script)
}))()