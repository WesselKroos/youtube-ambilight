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
          // console.log('received in contentScript', event.detail?.type, event.detail?.injectedScript, event, '|', event.detail?.contentScript);
          if (
            !isSameWindowMessage ||
            event.detail?.injectedScript !== extensionId ||
            !event.detail?.type
          )
            return;

          for (const listener of this.listeners) {
            listener(event);
          }
        }.bind(this),
        true
      );
      document.addEventListener('ytal-message', this.globalListener);
    }

    const listener = wrapErrorHandler(
      function injectedScriptMessageListener(event) {
        // console.log('injected message?', type, event.detail?.type)
        if (event.detail.type !== type) return;

        // console.log('injected message!', type)
        handler(event.detail?.message);
      }.bind(this),
      true
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
      document.documentElement.removeEventListener('ytal-message', this.globalListener);
      this.globalListener = undefined;
    }
  }

  postMessage(type, message) {
    const event = new CustomEvent('ytal-message', {
      // bubbles: true,
      detail: {
        type,
        message,
        contentScript: extensionId,
      },
    });
    // console.log('dispatched from contentScript', type, extensionId);
    return document.dispatchEvent(event);
  }
}
export const injectedScript = new InjectedScript();
