import { appendErrorStack, wrapErrorHandler } from './generic'

class Storage {
  async set(name, value) {
    const stack = new Error().stack
    return await new Promise(function storageSet(resolve, reject) {
      try {
        chrome.storage.local.set({ [name]: value }, function setCallback() {
          try {
            if (chrome.runtime.lastError) throw chrome.runtime.lastError
            resolve()
          } catch(ex) {
            reject(appendErrorStack(stack, ex))
          }
        })
      } catch(ex) {
        reject(appendErrorStack(stack, ex))
      }
    })
  }

  async get(nameOrNames) {
    const multiple = Array.isArray(nameOrNames)
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
    chrome.storage.local.onChanged.addListener(wrapErrorHandler(handler, true))
  }
}

export const storage = new Storage()

export const defaultCrashOptions = {
  video: false,
  technical: true,
  crash: true
}