import { appendErrorStack, wrapErrorHandler } from '../generic'
import { extensionId, isSameWindowMessage } from './utils'

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
    const currentId = this.getStorageEntriesId++;

    const stack = new Error().stack
    const getStorageEntriesPromise = new Promise(function getStorageEntryOrEntries(resolve, reject) {
      let listener;
      try {
        listener = this.addMessageListener('get-storage-entries',
          function getStorageEntryOrEntriesMessageListener({ id, valueOrValues, error }) {
            try {
              if(id !== currentId) return

              this.removeMessageListener(listener)
              
              if(error &&
                (throwOnUninstalled || !(error.message === 'uninstalled' || error.message.includes('QuotaExceededError')))
              ) throw error

              resolve(valueOrValues)
            } catch(ex) {
              reject(appendErrorStack(stack, ex))
            }
          }.bind(this))
      } catch(ex) {
        try {
          if(listener) {
            this.removeMessageListener(listener)
          }
        } catch {}
        reject(appendErrorStack(stack, ex))
      }
    }.bind(this))

    this.postMessage('get-storage-entries', { id: currentId, nameOrNames })
    return await getStorageEntriesPromise
  }

  setStorageEntryId = 0
  async setStorageEntry(name, value, throwOnUninstalled) {
    const currentId = this.setStorageEntryId++;
    const stack = new Error().stack
    const setStorageEntryPromise = new Promise(function setStorageEntry(resolve, reject) {
      let listener;
      try {
        listener = this.addMessageListener('set-storage-entry', 
          function setStorageEntryMessageListener({ id, error }) {
            try {
              if(id !== currentId) return

              this.removeMessageListener(listener)

              if(error &&
                (throwOnUninstalled || !(error.message === 'uninstalled' || error.message.includes('QuotaExceededError')))
              ) throw error

              resolve()
            } catch(ex) {
              reject(appendErrorStack(stack, ex))
            }
          }.bind(this)
        )
      } catch(ex) {
        try {
          if(listener) {
            this.removeMessageListener(listener)
          }
        } catch {}
        reject(appendErrorStack(stack, ex))
      }
    }.bind(this))

    this.postMessage('set-storage-entry', { id: currentId, name, value })
    return await setStorageEntryPromise
  }
}
export const contentScript = new ContentScript()