const origin = 'https://www.youtube.com'
const extensionId = 'youtube-ambilight'

const isSameWindowMessage = (event) => (
  event.source === window &&
  event.origin === origin
)

export const contentScript = {
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
  },
  postMessage: (type, message) => {
    window.postMessage({
      message,
      type,
      injectedScript: extensionId
    }, origin)
  }
}

export const injectedScript = {
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
  },
  postMessage: (type, message) => {
    window.postMessage({
      message,
      type,
      contentScript: extensionId
    }, origin)
  }
}