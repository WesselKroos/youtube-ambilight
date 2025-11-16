import { appendErrorStack, wrapErrorHandler } from './errors/base';

class SyncStorage {
  async set(nameOrNamesAndValues, value = undefined) {
    const multiple = typeof nameOrNamesAndValues !== 'string';
    const namesAndValues = multiple
      ? nameOrNamesAndValues
      : { [nameOrNamesAndValues]: value };

    const stack = new Error().stack;
    return await new Promise(function storageSet(resolve, reject) {
      try {
        const setCallback = () => {
          try {
            if (chrome.runtime.lastError) throw chrome.runtime.lastError;
            resolve();
          } catch (ex) {
            appendErrorStack(stack, ex);
            reject(ex);
          }
        };
        if (!multiple && value === undefined) {
          chrome.storage.sync.remove([nameOrNamesAndValues], setCallback);
        } else {
          chrome.storage.sync.set(namesAndValues, setCallback);
        }
      } catch (ex) {
        appendErrorStack(stack, ex);
        reject(ex);
      }
    });
  }

  async get(nameOrNames) {
    const multiple = typeof nameOrNames !== 'string';
    const names = multiple ? nameOrNames : [nameOrNames];
    const stack = new Error().stack;
    return await new Promise(function storageGet(resolve, reject) {
      try {
        chrome.storage.sync.get(names, function getCallback(result) {
          try {
            if (chrome.runtime.lastError) throw chrome.runtime.lastError;
            resolve(
              multiple
                ? result
                : result[nameOrNames] === undefined
                ? null
                : result[nameOrNames]
            );
          } catch (ex) {
            appendErrorStack(stack, ex);
            reject(ex);
          }
        });
      } catch (ex) {
        appendErrorStack(stack, ex);
        reject(ex);
      }
    });
  }

  onChangedListeners = [];

  addListener(handler) {
    try {
      const wrappedHandler = wrapErrorHandler(handler, true);
      chrome.storage.sync.onChanged.addListener(wrappedHandler);
      this.onChangedListeners.push({ handler, wrappedHandler });
    } catch (ex) {
      console.warn(
        "Failed to listen to sync-storage changes. If any setting changes you'll have to manually refresh the page to update them."
      );
      console.debug(ex);
    }
  }

  removeListener(handler) {
    try {
      const entry = this.onChangedListeners.find(
        (entry) => entry.handler === handler
      );
      if (!entry)
        throw new Error(
          'Cannot remove a storage.sync.onChange listener that has never been added'
        );

      chrome.storage.sync.onChanged.removeListener(entry.wrappedHandler);

      this.onChangedListeners.splice(this.onChangedListeners.indexOf(entry), 1);
    } catch {
      console.warn(
        "Failed to listen to sync-storage changes. If any setting changes you'll have to manually refresh the page to update them."
      );
    }
  }
}

export const syncStorage = new SyncStorage();
