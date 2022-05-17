import { appendErrorStack } from "./generic"

class Storage {
  async set(name, value) {
    const stack = new Error().stack
    return await new Promise(function storageSet(resolve, reject) {
      chrome.storage.local.set({ [name]: value }, function setCallback() {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError
          appendErrorStack(stack, error)
          return reject(error)
        }
        resolve()
      })
    })
  }

  async get(nameOrNames) {
    const multiple = Array.isArray(nameOrNames)
    const names = multiple ? nameOrNames : [nameOrNames]
    const stack = new Error().stack
    return await new Promise(function storageGet(resolve, reject) {
      chrome.storage.local.get(names, function getCallback(result) {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError
          appendErrorStack(stack, error)
          return reject(error)
        }
        resolve(multiple ? result : (
          result[nameOrNames] === undefined ? null : result[nameOrNames]
        ))
      })
    })
  }

  addListener(handler) {
    chrome.storage.local.onChanged.addListener(handler)
  }
}

export const storage = new Storage()

export const defaultCrashOptions = {
  video: false,
  technical: true,
  crash: true
}