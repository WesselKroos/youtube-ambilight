export const workerFromCode = (func) => {
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas class is undefined');
    } else if (!OffscreenCanvas.prototype.transferToImageBitmap) {
      throw new Error('OffscreenCanvas.transferToImageBitmap is undefined');
    }
    return new Worker(
      URL.createObjectURL(
        new Blob(['(', func.toString(), ')()'], { type: 'text/javascript' })
      )
    );
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
