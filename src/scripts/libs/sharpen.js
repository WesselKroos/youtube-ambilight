let gpu
let convolutionKernel
let width
let height
let kernelCreatedAt
let kernelMaxDuration = 10000

const createConvolutionKernelFromCanvas = (canvas) => {
  width = canvas.width
  height = canvas.height
  kernelCreatedAt = performance.now()
  // console.log('new kernel', kernelCreatedAt, width, height)

  if(convolutionKernel) {
    convolutionKernel.destroy()
    convolutionKernel = undefined
  }
  if(gpu) {
    gpu.destroy()
    gpu = undefined
  }
  gpu = new GPU()

  convolutionKernel = gpu
    .createKernel(function (src, width, height, kernel, kernelRadius) {
      const kSize = 2 * kernelRadius + 1
      let r = 0, g = 0, b = 0

      let i = -kernelRadius
      while (i <= kernelRadius) {
        const x = this.thread.x + i
        if (x < 0 || x >= width) {
          i++
          continue
        }

        let j = -kernelRadius
        while (j <= kernelRadius) {
          const y = this.thread.y + j
          if (y < 0 || y >= height) {
            j++
            continue
          }
    
          const kernelOffset = (j + kernelRadius) * kSize + i + kernelRadius
          const weights = kernel[kernelOffset]
          const pixel = src[y][x]
          r += pixel.r * weights
          g += pixel.g * weights
          b += pixel.b * weights
          j++
        }
        i++
      }
      this.color(r, g, b)
    })
    .setOutput([width, height])
    .setGraphical(true)
}

const multiplier = 4
const kernels = {
  sharpen: (strength) => {
    strength = strength * multiplier
    const e = -strength
    const c = 1 + (strength * 4)
    return [
      0, e, 0,
      e, c, e,
      0, e, 0
    ]
  }
}

export default (srcCanvas, srcCtx, strength) => {
  if(!window.GPU) return

  if(
    !convolutionKernel || 
    width !== srcCanvas.width || 
    height !== srcCanvas.height || 
    kernelCreatedAt < performance.now() - kernelMaxDuration
  ) {
    createConvolutionKernelFromCanvas(srcCanvas)
  }

  const kernel = kernels.sharpen(strength)
  const kernelRadius = (Math.sqrt(kernel.length) - 1) / 2
  convolutionKernel(srcCanvas, srcCanvas.width, srcCanvas.height, kernel, kernelRadius)

  srcCtx.drawImage(convolutionKernel.canvas, 1, 1, width - 2, height - 2, 1, 1, width - 2, height - 2)
}