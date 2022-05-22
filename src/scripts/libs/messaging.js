import { appendErrorStack, wrapErrorHandler } from './generic'

const origin = 'https://www.youtube.com'
const extensionId = 'youtube-ambilight'

const isSameWindowMessage = (event) => (
  event.source === window &&
  event.origin === origin
)

class ContentScript {
  addMessageListener(type, handler) {
    const listener = wrapErrorHandler(function contentScriptMessageListener(event) {
      if (
        !isSameWindowMessage ||
        event.data?.contentScript !== extensionId ||
        event.data?.type !== type
      ) return
      handler(event.data?.message)
    })
    window.addEventListener('message', listener, true)
    return listener
  }

  removeMessageListener(listener) {
    window.removeEventListener('message', listener)
  }

  postMessage(type, message) {
    window.postMessage({
      message,
      type,
      injectedScript: extensionId
    }, origin)
  }

  getStorageEntriesId = 0
  async getStorageEntryOrEntries(nameOrNames, throwOnUninstalled) {
    this.getStorageEntriesId++;
    let listener;
    const removeListener = function removeGetStorageEntryOrEntriesMessageListener() {
      this.removeMessageListener(listener)
    }.bind(this)

    const stack = new Error().stack
    const getStorageEntriesPromise = new Promise(function getStorageEntryOrEntries(resolve, reject) {
      try {
        listener = this.addMessageListener('get-storage-entries',
          function getStorageEntryOrEntriesMessageListener({ id, valueOrValues, error }) {
            try {
              if(id !== this.getStorageEntriesId) return

              removeListener()
              if(error &&
                (throwOnUninstalled || error.message !== 'uninstalled')
              ) throw error

              resolve(valueOrValues)
            } catch(ex) {
              reject(appendErrorStack(stack, ex))
            }
          }.bind(this))
      } catch(ex) {
        reject(appendErrorStack(stack, ex))
      }
    }.bind(this))

    this.postMessage('get-storage-entries', { id: this.getStorageEntriesId, nameOrNames })
    return await getStorageEntriesPromise
  }

  setStorageEntryId = 0
  async setStorageEntry(name, value, throwOnUninstalled) {
    this.setStorageEntryId++;
    let listener;
    const removeListener = function removeSetStorageEntryMessageListener() {
      this.removeMessageListener(listener)
    }.bind(this)

    const stack = new Error().stack
    const setStorageEntryPromise = new Promise(function setStorageEntry(resolve, reject) {
      try {
        listener = this.addMessageListener('set-storage-entry', 
          function setStorageEntryMessageListener({ id, error }) {
            try {
              if(id !== this.setStorageEntryId) return

              removeListener()
              if(error &&
                (throwOnUninstalled || error.message !== 'uninstalled')
              ) throw error

              resolve()
            } catch(ex) {
              reject(appendErrorStack(stack, ex))
            }
          }.bind(this))
      } catch(ex) {
        reject(appendErrorStack(stack, ex))
      }
    }.bind(this))

    this.postMessage('set-storage-entry', { id: this.setStorageEntryId, name, value })
    return await setStorageEntryPromise
  }
}
export const contentScript = new ContentScript()

class InjectedScript {
  addMessageListener(type, handler) {
    const listener = wrapErrorHandler(function InjectedScriptMessageListener(event) {
      if (
        !isSameWindowMessage ||
        event.data?.injectedScript !== extensionId ||
        event.data?.type !== type
      ) return
      handler(event.data?.message)
    }.bind(this), true)
    window.addEventListener('message', listener, true)
    return listener
  }

  removeMessageListener(listener) {
    window.removeEventListener('message', listener)
  }

  postMessage(type, message) {
    return window.postMessage({
      message,
      type,
      contentScript: extensionId
    }, origin)
  }
}
export const injectedScript = new InjectedScript()