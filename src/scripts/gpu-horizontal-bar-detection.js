import { appendErrorStack, SafeOffscreenCanvas, requestIdleCallback, wrapErrorHandler } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'
import { detectViaGPU } from './libs/horizontal-bar-detection'

export class HorizontalBarDetection {
  worker
  workerMessageId = 0
  cancellable = true
  run = null
  canvas;
  ctx;
  catchedDetectHorizontalBarSizeError = false

  clear = () => {
    if(!this.run || !this.cancellable) return

    this.run = null
  }

  detect = (buffer, detectColored, offsetPercentage, currentPercentage, callback) => {
    if(this.run) return

    const run = this.run = {}

    this.idleHandlerArguments = {
      buffer,
      detectColored,
      offsetPercentage,
      currentPercentage,
      callback
    }

    // this.idleHandler(run)
    requestIdleCallback(wrapErrorHandler(() => this.idleHandler(run)), { timeout: 1000 })
  }

  idleHandler = async (run) => {
    if(this.run !== run) return
    this.cancellable = false

    const {
      buffer,
      detectColored,
      offsetPercentage,
      currentPercentage,
      callback
    } = this.idleHandlerArguments

    try {
      const start = performance.now()

      if(!this.canvas) {
        this.canvas = document.createElement('canvas')
        this.canvas.width = 5
        this.canvas.height = 512
        // this.canvas = new SafeOffscreenCanvas(5, 512) // Smallest size to prevent many garbage collections caused by transferToImageBitmap
        this.ctx = this.canvas.getContext('2d', {
          alpha: false,
          desynchronized: true
        })
        this.ctx.imageSmoothingEnabled = false
        // document.body.appendChild(this.canvas)
        // this.canvas.style.position = 'fixed'
        // this.canvas.style.zIndex = 100
        // this.canvas.style.top = 0
        // this.canvas.style.left = 0
      }

      this.ctx.drawImage(buffer.elem, 0, 0, this.canvas.width, this.canvas.height)

      await detectViaGPU(
        {
          canvas: this.canvas,
          // ctx: this.ctx,
          detectColored,
          offsetPercentage,
          currentPercentage
        },
        callback
      )
      
      if(this.run !== run) return
      
      this.cancellable = true

      // const throttle = 1000 // Math.max(0, Math.pow(performance.now() - start, 1.2) - 30)
      // setTimeout(() => {
      //   if(this.run !== run) return

      //   this.run = null
      // }, throttle)
      this.run = null
    } catch(ex) {
      this.cancellable = true
      this.run = null
      if (!this.catchedDetectHorizontalBarSizeError) {
        this.catchedDetectHorizontalBarSizeError = true
        throw ex
      }
    }
  }
}

export default detectHorizontalBarSize