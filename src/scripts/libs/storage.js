export const storage = {
  set: async (name, value) => {
    return await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [name]: value }, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(value);
      });
    });
  },
  get: async (name) => {
    return await new Promise((resolve, reject) => {
      chrome.storage.local.get([name], (result) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(result[name] || null);
      });
    });
  },
  addListener: (handler) => chrome.storage.local.onChanged.addListener(handler)
}

export const defaultCrashOptions = {
  video: false,
  technical: true,
  crash: true
}