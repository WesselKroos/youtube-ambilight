import { wrapErrorHandler } from '../generic';
import { extensionId, isSameWindowMessage } from './utils';

class ContentScript {
  globalListener;
  listeners = [];

  addMessageListener = (type, handler) => {
    // console.log('content addMessageListener', type)
    if (!this.globalListener) {
      // console.log('content addMessageListenerGlobal')
      this.globalListener = wrapErrorHandler(
        function contentScriptMessageListenerGlobal(event) {
          // console.log('content message? global', event.data?.type)
          if (
            !isSameWindowMessage ||
            event.data?.contentScript !== extensionId ||
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
      function contentScriptMessageListener(event) {
        // console.log('content message?', type, event.data?.type)
        if (event.data.type !== type) return;

        // console.log('content message!', type)
        handler(event.data?.message);
      }.bind(this),
      true
    );

    this.listeners.push(listener);
    return listener;
  };

  removeMessageListener = (listener) => {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      // console.log('content removeMessageListener', index, listener)
      this.listeners.splice(index, 1);
    }

    if (this.globalListener && this.listeners.length === 0) {
      // console.log('content removeMessageListenerGlobal', this.globalListener)
      window.removeEventListener('message', this.globalListener, true);
      this.globalListener = undefined;
    }
  };

  postMessage = (type, message, transfer) => {
    // console.log('content postMessage', type)
    window.postMessage(
      {
        message,
        type,
        injectedScript: extensionId,
      },
      origin,
      transfer
    );
  };
}
export const contentScript = new ContentScript();
