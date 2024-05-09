import { wrapErrorHandler } from '../generic'
import { extensionId, isSameWindowMessage } from './utils'

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
    return window.postMessage({
      message,
      type,
      contentScript: extensionId
    }, origin)
  }
}
export const injectedScript = new InjectedScript()