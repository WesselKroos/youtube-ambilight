import { appendErrorStack, wrapErrorHandler } from './generic'

class Storage {
  async set(nameOrNamesAndValues, value = undefined) {
    const multiple = typeof nameOrNamesAndValues !== 'string'
    const namesAndValues = multiple ? nameOrNamesAndValues : { [nameOrNamesAndValues]: value }

    const stack = new Error().stack
    return await new Promise(function storageSet(resolve, reject) {
      try {
        const setCallback = () => {
          try {
            if (chrome.runtime.lastError) throw chrome.runtime.lastError
            resolve()
          } catch(ex) {
            reject(appendErrorStack(stack, ex))
          }
        }
        if(!multiple && value === undefined) {
          chrome.storage.local.remove([nameOrNamesAndValues], setCallback)
        } else {
          chrome.storage.local.set(namesAndValues, setCallback)
        }
      } catch(ex) {
        reject(appendErrorStack(stack, ex))
      }
    })
  }

  async get(nameOrNames) {
    const multiple = typeof nameOrNames !== 'string'
    const names = multiple ? nameOrNames : [nameOrNames]
    const stack = new Error().stack
    return await new Promise(function storageGet(resolve, reject) {
      try {
        chrome.storage.local.get(names, function getCallback(result) {
          try {
            if (chrome.runtime.lastError) throw chrome.runtime.lastError
            resolve(multiple ? result : (
              result[nameOrNames] === undefined ? null : result[nameOrNames]
            ))
          } catch(ex) {
            reject(appendErrorStack(stack, ex))
          }
        })
      } catch(ex) {
        reject(appendErrorStack(stack, ex))
      }
    })
  }

  addListener(handler) {
    try {
      chrome.storage.local.onChanged.addListener(wrapErrorHandler(handler, true))
    } catch(ex) {
      console.warn('Failed to listen to storage changes. If any settings change you\'ll have to refresh the page to update them.')
    }
  }
}

export const storage = new Storage()

export const defaultCrashOptions = {
  video: false,
  technical: true,
  crash: true
}