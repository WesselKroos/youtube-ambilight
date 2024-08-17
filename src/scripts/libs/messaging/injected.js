import { wrapErrorHandler } from '../generic';
import { extensionId, isSameWindowMessage } from './utils';

class InjectedScript {
  globalListener;
  listeners = [];

  addMessageListener(type, handler) {
    // console.log('injected addMessageListener', type)
    if (!this.globalListener) {
      // console.log('injected addMessageListenerGlobal')
      this.globalListener = wrapErrorHandler(
        function injectedScriptMessageListenerGlobal(event) {
          // console.log('injected message? global', event.data?.type)
          if (
            !isSameWindowMessage ||
            event.data?.injectedScript !== extensionId ||
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
      function injectedScriptMessageListener(event) {
        // console.log('injected message?', type, event.data?.type)
        if (event.data.type !== type) return;

        // console.log('injected message!', type)
        handler(event.data?.message);
      }.bind(this)
    );

    this.listeners.push(listener);
    return listener;
  }

  removeMessageListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      // console.log('injected removeMessageListener', index, listener)
      this.listeners.splice(index, 1);
    }

    if (this.globalListener && this.listeners.length === 0) {
      // console.log('injected removeMessageListenerGlobal', this.globalListener)
      window.removeEventListener('message', this.globalListener, true);
      this.globalListener = undefined;
    }
  }

  postMessage(type, message) {
    return window.postMessage(
      {
        message,
        type,
        contentScript: extensionId,
      },
      origin
    );
  }
}
export const injectedScript = new InjectedScript();
