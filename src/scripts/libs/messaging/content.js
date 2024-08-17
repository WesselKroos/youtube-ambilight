import { appendErrorStack, wrapErrorHandler } from '../generic';
import { extensionId, isSameWindowMessage } from './utils';

class ContentScript {
  globalListener;
  listeners = [];

  addMessageListener = (type, handler) => {
    // console.log('content addMessageListener', type)
    if (!this.globalListener) {
      // console.log('content addMessageListenerGlobal')
      this.globalListener = wrapErrorHandler(
        function contentScriptMessageListenerGlobal(event) {
          // console.log('content message? global', event.data?.type)
          if (
            !isSameWindowMessage ||
            event.data?.contentScript !== extensionId ||
            !event.data?.type
          )
            return;

          for (const listener of this.listeners) {
            listener(event);
          }
        }.bind(this),
        true
      );
      window.addEventListener('message', this.globalListener, true);
    }

    const listener = wrapErrorHandler(
      function contentScriptMessageListener(event) {
        // console.log('content message?', type, event.data?.type)
        if (event.data.type !== type) return;

        // console.log('content message!', type)
        handler(event.data?.message);
      }.bind(this)
    );

    this.listeners.push(listener);
    return listener;
  };

  removeMessageListener = (listener) => {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      // console.log('content removeMessageListener', index, listener)
      this.listeners.splice(index, 1);
    }

    if (this.globalListener && this.listeners.length === 0) {
      // console.log('content removeMessageListenerGlobal', this.globalListener)
      window.removeEventListener('message', this.globalListener, true);
      this.globalListener = undefined;
    }
  };

  postMessage = (type, message, transfer) => {
    // console.log('content postMessage', type)
    window.postMessage(
      {
        message,
        type,
        injectedScript: extensionId,
      },
      origin,
      transfer
    );
  };

  getStorageEntriesId = 0;
  async getStorageEntryOrEntries(nameOrNames, throwOnUninstalled) {
    const currentId = this.getStorageEntriesId++;

    const stack = new Error().stack;
    const getStorageEntriesPromise = new Promise(
      function getStorageEntryOrEntries(resolve, reject) {
        let listener;
        try {
          listener = this.addMessageListener(
            'get-storage-entries',
            function getStorageEntryOrEntriesMessageListener({
              id,
              valueOrValues,
              error,
            }) {
              try {
                if (id !== currentId) return;

                this.removeMessageListener(listener);

                if (
                  error &&
                  (throwOnUninstalled ||
                    !(
                      error.message === 'uninstalled' ||
                      error.message?.includes('QuotaExceededError')
                    ))
                )
                  throw error;

                resolve(valueOrValues);
              } catch (ex) {
                reject(appendErrorStack(stack, ex));
              }
            }.bind(this)
          );
        } catch (ex) {
          try {
            if (listener) {
              this.removeMessageListener(listener);
            }
          } catch {}
          reject(appendErrorStack(stack, ex));
        }
      }.bind(this)
    );

    this.postMessage('get-storage-entries', { id: currentId, nameOrNames });
    return await getStorageEntriesPromise;
  }

  setStorageEntryId = 0;
  async setStorageEntry(name, value, throwOnUninstalled) {
    const currentId = this.setStorageEntryId++;
    const stack = new Error().stack;
    const setStorageEntryPromise = new Promise(
      function setStorageEntry(resolve, reject) {
        let listener;
        try {
          listener = this.addMessageListener(
            'set-storage-entry',
            function setStorageEntryMessageListener({ id, error }) {
              try {
                if (id !== currentId) return;

                this.removeMessageListener(listener);

                if (
                  error &&
                  (throwOnUninstalled ||
                    !(
                      error.message === 'uninstalled' ||
                      error.message?.includes('QuotaExceededError')
                    ))
                )
                  throw error;

                resolve();
              } catch (ex) {
                reject(appendErrorStack(stack, ex));
              }
            }.bind(this)
          );
        } catch (ex) {
          try {
            if (listener) {
              this.removeMessageListener(listener);
            }
          } catch {}
          reject(appendErrorStack(stack, ex));
        }
      }.bind(this)
    );

    this.postMessage('set-storage-entry', { id: currentId, name, value });
    return await setStorageEntryPromise;
  }
}
export const contentScript = new ContentScript();
