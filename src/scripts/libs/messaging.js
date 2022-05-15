const origin = 'https://www.youtube.com'
const extensionId = 'youtube-ambilight'

const isSameWindowMessage = (event) => (
  event.source === window &&
  event.origin === origin
)

export const fromContentScript = {
  addMessageListener: (type, handler) => {
    const listener = (event) => {
      if (
        !isSameWindowMessage ||
        event.data?.contentScript !== extensionId ||
        event.data?.type !== type
      ) return
      handler(event.data?.message)
    }
    window.addEventListener('message', listener, true)
    return listener
  },
  removeMessageListener: (listener) => {
    window.removeEventListener('message', listener)
  }
}

export const fromInjectedScript = {
  addMessageListener: (type, handler) => {
    const listener = (event) => {
      if (
        !isSameWindowMessage ||
        event.data?.injectedScript !== extensionId ||
        event.data?.type !== type
      ) return
      handler(event.data?.message)
    }
    window.addEventListener('message', listener, true)
    return listener
  },
  removeMessageListener: (listener) => {
    window.removeEventListener('message', listener)
  }
}

export const injectedScriptToContentScript = {
  postMessage: (type, message) => {
    window.postMessage({
      message,
      type,
      injectedScript: extensionId
    }, origin)
  }
}

export const contentScriptToInjectedScript = {
  postMessage: (type, message) => {
    window.postMessage({
      message,
      type,
      contentScript: extensionId
    }, origin)
  }
}