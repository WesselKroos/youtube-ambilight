import { wrapErrorHandler } from '../generic';
import { extensionId, isSameWindowMessage } from './utils';

class InjectedScript {
  globalListener;
  listeners = [];

  addMessageListener = (type, handler) => {
    // console.log('injected addMessageListener', type)
    if (!this.globalListener) {
      // console.log('injected addMessageListenerGlobal')
      this.globalListener = wrapErrorHandler(
        function injectedScriptMessageListenerGlobal(event) {
          if (!event.detail || typeof event.detail !== 'string') return;
          const detail = JSON.parse(event.detail);
          // console.log('received in contentScript', event.detail?.type, event.detail?.injectedScript, event, '|', event.detail?.contentScript);
          if (
            !isSameWindowMessage ||
            detail?.injectedScript !== extensionId ||
            !detail?.type
          )
            return;

          for (const listener of this.listeners) {
            listener(detail);
          }
        }.bind(this),
        true
      );
      document.addEventListener('ytal-message', this.globalListener);
    }

    const listener = wrapErrorHandler(
      function injectedScriptMessageListener(detail) {
        // console.log('injected message?', type, event.detail?.type)
        if (detail.type !== type) return;

        // console.log('injected message!', type)
        handler(detail?.message);
      }.bind(this),
      true
    );

    this.listeners.push(listener);
    return listener;
  };

  removeMessageListener = (listener) => {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      // console.log('injected removeMessageListener', index, listener)
      this.listeners.splice(index, 1);
    }

    if (this.globalListener && this.listeners.length === 0) {
      // console.log('injected removeMessageListenerGlobal', this.globalListener)
      document.documentElement.removeEventListener(
        'ytal-message',
        this.globalListener
      );
      this.globalListener = undefined;
    }
  };

  postMessage(type, message) {
    const event = new CustomEvent('ytal-message', {
      // bubbles: true,
      detail: JSON.stringify({
        type,
        message,
        contentScript: extensionId,
      }),
    });
    // console.log('dispatched from contentScript', type, extensionId);
    return document.dispatchEvent(event);
  }

  receiveMessage = (type, timeout = 2000) =>
    new Promise(function receiveMessagePromise(resolve, reject) {
      try {
        const receivedMessage = function reveicedMessage(message) {
          clearTimeout(timeoutId);
          injectedScript.removeMessageListener(changedListener);
          resolve(message);
        }.bind(this);

        const receiveMessageTimeout = function receiveMessageTimeout() {
          console.warn(
            `Never received a response message for "${type}" after ${timeout}ms`
          );
          receivedMessage();
        }.bind(this);

        const timeoutId = setTimeout(receiveMessageTimeout, timeout); // Fallback in case messaging fails
        const changedListener = injectedScript.addMessageListener(
          type,
          receivedMessage
        );
      } catch (ex) {
        reject(ex);
      }
    });

  postAndReceiveMessage = async (type, message, timeout) => {
    const receiveMessagePromise = this.receiveMessage(type, timeout);
    this.postMessage(type, message);
    return await receiveMessagePromise;
  };
}
export const injectedScript = new InjectedScript();
