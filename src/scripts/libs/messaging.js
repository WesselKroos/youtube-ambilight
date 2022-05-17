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
    }, true)
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
  getStorageEntryOrEntries(nameOrNames, throwOnUninstalled) {
    const stack = new Error().stack
    return new Promise(function getStorageEntryOrEntries(resolve, reject) {
      try {
        this.getStorageEntriesId++;
        let listener;
        const removeListener = () => this.removeMessageListener(listener)
        listener = this.addMessageListener('get-storage-entries', function getStorageEntryOrEntriesMessageListener({ id, valueOrValues, error }) {
          if(id !== this.getStorageEntriesId) return

          removeListener()
          if(error?.message === 'uninstalled') {
            if(throwOnUninstalled) return reject(error)
          } else if(error) {
            appendErrorStack(stack, error)
            reject(error)
            return
          }

          resolve(valueOrValues)
        }.bind(this))
        this.postMessage('get-storage-entries', { id: this.getStorageEntriesId, nameOrNames })
      } catch (ex) {
        console.error(`Ambient light for YouTube™ | ${ex.message}`)
      }
    }.bind(this))
  }

  setStorageEntryId = 0
  setStorageEntry(name, value, throwOnUninstalled) {
    const stack = new Error().stack
    return new Promise(function setStorageEntry(resolve, reject) {
      try {
        this.setStorageEntryId++;
        let listener;
        const removeListener = function setStorageEntryRemoveMessageListener() {
          this.removeMessageListener(listener)
        }.bind(this)
        listener = this.addMessageListener('set-storage-entry', function setStorageEntryMessageListener({ id, error }) {
          if(id !== this.setStorageEntryId) return

          removeListener()
          if(error?.message === 'uninstalled') {
            if(throwOnUninstalled) return reject(error)
          } else if(error) {
            appendErrorStack(stack, error)
            reject(error)
            return
          }

          resolve()
        }.bind(this))
        this.postMessage('set-storage-entry', { id: this.setStorageEntryId, name, value })
      } catch (ex) {
        console.error(`Ambient light for YouTube™ | ${ex.message}`)
      }
    }.bind(this))
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
    window.postMessage({
      message,
      type,
      contentScript: extensionId
    }, origin)
  }
}
export const injectedScript = new InjectedScript()