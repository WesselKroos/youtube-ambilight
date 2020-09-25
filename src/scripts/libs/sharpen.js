let gpu;
let convolution;
let width;
let height;

const createConvolutionFromCanvas = (canvas) => {
  width = canvas.width;
  height = canvas.height;

  gpu = new GPU();
  convolution = gpu
    .createKernel(function (src, width, height, kernel, kernelRadius) {
      const kSize = 2 * kernelRadius + 1;
      let r = 0, g = 0, b = 0;

      let i = -kernelRadius;
      while (i <= kernelRadius) {
        const x = this.thread.x + i;
        if (x < 0 || x >= width) {
          i++;
          continue;
        }

        let j = -kernelRadius;
        while (j <= kernelRadius) {
          const y = this.thread.y + j;
          if (y < 0 || y >= height) {
            j++;
            continue;
          }
    
          const kernelOffset = (j + kernelRadius) * kSize + i + kernelRadius;
          const weights = kernel[kernelOffset];
          const pixel = src[y][x];
          r += pixel.r * weights;
          g += pixel.g * weights;
          b += pixel.b * weights;
          j++;
        }
        i++;
      }
      this.color(r, g, b);
    })
    .setOutput([width, height])
    .setGraphical(true);
};

const kernels = {
  sharpen: [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ],
};

// convolution
export default (srcCanvas, srcCtx, opacity) => {
  if(!window.GPU) return;

  if(width !== srcCanvas.width || height !== srcCanvas.height) {
    createConvolutionFromCanvas(srcCanvas);
  }

  const kernel = kernels.sharpen;
  const kernelRadius = (Math.sqrt(kernel.length) - 1) / 2;
  convolution(srcCanvas, srcCanvas.width, srcCanvas.height, kernel, kernelRadius);

  srcCtx.globalAlpha = opacity
  // srcCtx.globalCompositeOperation = 'screen'
  srcCtx.drawImage(convolution.canvas, 1, 1, width - 2, height - 2, 1, 1, width - 2, height - 2)
  srcCtx.globalAlpha = 1
  // srcCtx.globalCompositeOperation = 'source-over'
}