export const workerFromCode = async (func) => {
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas class is undefined');
    } else if (!OffscreenCanvas.prototype.transferToImageBitmap) {
      throw new Error('OffscreenCanvas.transferToImageBitmap is undefined');
    }

    let created = () => undefined;
    let timeout;
    try {
      const promise = new Promise((resolve, reject) => {
        created = (error) => {
          if (error) return reject(error);
          resolve();
        };
      });

      const worker = new Worker(
        URL.createObjectURL(
          new Blob(['(', func.toString(), ')()'], { type: 'text/javascript' })
        )
      );
      worker.onerror = (e) =>
        created(
          new Error(
            e?.message ??
              'Worker creation failed probably because it violates the worker-src or script-src Content Security Policy'
          )
        );
      worker.onmessage = (e) => {
        if (e.data === false) {
          created();
        }
      };
      worker.postMessage(false);
      timeout = setTimeout(
        () => created(new Error('Worker creation timed-out after 5 seconds')),
        5000
      );
      await promise;

      worker.onerror = undefined;
      worker.onmessage = undefined;
      return worker;
    } finally {
      clearTimeout(timeout);
      created = undefined;
    }
  } catch (error) {
    console.warn(
      `Failed to create a native worker. Creating a fallback worker on the main thread instead (${error.message})`
    );

    class FallbackWorker {
      isFallbackWorker = true;
      constructor(func) {
        const globalScope = (this.globalScope = {
          postMessage: (data) => {
            if (this.onmessage)
              this.onmessage({
                data,
              });
          },
          onmessage: () => console.error('onmessage not implemented'),
          isFallbackWorker: true,
        });
        func.bind(globalScope)();
      }

      onerror = (error) => {
        console.error(error);
      };

      postMessage = (data) => {
        try {
          this.globalScope.onmessage({
            data,
          });
        } catch (error) {
          this.onerror(error);
        }
      };
    }

    return new FallbackWorker(func);
  }
};
