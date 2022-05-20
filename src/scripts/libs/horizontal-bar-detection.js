import { appendErrorStack, SafeOffscreenCanvas, wrapErrorHandler } from './generic'
import AmbilightSentry from './ambilight-sentry'
import { workerFromCode } from './worker'

const workerCode = function () {
  // Cannot access appendErrorStack in import from a worker
  const appendErrorStack = (stack, ex) => {
    try {
      const stackToAppend = stack.substring(stack.indexOf('\n') + 1)
      const alreadyContainsStack = ((ex.stack || ex.message).indexOf(stackToAppend) !== -1)
      if(alreadyContainsStack) return
  
      ex.stack = `${ex.stack || ex.message}\n${stackToAppend}`
    } catch(ex) { console.warn(ex) }
  }

  let id;
  let catchedWorkerCreationError = false
  let canvas;
  let ctx;
  let imageVLines = []
  let imageVLinesIndex = 0
  let partSize = 1
  let getLineImageDataStack;
  let getLineImageDataResolve;
  let getLineImageDataReject;

  function getLineImageData() {
    try {
      const imageData = imageVLines.push(ctx.getImageData(imageVLinesIndex, 0, 1, canvas.height).data)
      getLineImageDataResolve()
    } catch(ex) {
      appendErrorStack(getLineImageDataStack, ex)
      getLineImageDataReject(ex)
    }
  }

  function getLineImageDataPromise(resolve, reject) {
    getLineImageDataResolve = resolve
    getLineImageDataReject = reject
    getLineImageData()
  }

  let averageSize = 0;
  function sortSizes(a, b) {
    const aGap = Math.abs(averageSize - a)
    const bGap = Math.abs(averageSize - b)
    return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
  }

  try {
    const workerDetectHorizontalBarSize = async (detectColored, offsetPercentage, currentPercentage) => {
      partSize = (canvas.width / 5)
      imageVLines = []
      for (imageVLinesIndex = Math.ceil(partSize / 2) - 1; imageVLinesIndex < canvas.width; imageVLinesIndex += partSize) {
        if(!getLineImageDataStack) {
          getLineImageDataStack = new Error().stack
        }
        await new Promise(getLineImageDataPromise) // throttle allows 4k60fps with frame blending + video overlay 80fps -> 144fps
      }
      getLineImageDataResolve = undefined
      getLineImageDataReject = undefined
    
      const channels = 4
      let sizes = []
      const colorIndex = (channels * 4)
      let color = detectColored ?
        [imageVLines[0][colorIndex], imageVLines[0][colorIndex + 1], imageVLines[0][colorIndex + 2]] :
        [2,2,2]
      const maxColorDeviation = 8
      const ignoreEdge = 2
      const lineLimit = (imageVLines[0].length / 2)
      const largeStep = 20
    
      for(const line of imageVLines) {
        let step = largeStep
        const iStart = (channels * ignoreEdge)
        // From the top down
        for (let i = iStart; i < line.length; i += (channels * step)) {
          if(
            // Above the top limit
            i < lineLimit &&
            // Within the color deviation
            Math.abs(line[i] - color[0]) <= maxColorDeviation && 
            Math.abs(line[i+1] - color[1]) <= maxColorDeviation && 
            Math.abs(line[i+2] - color[2]) <= maxColorDeviation
          ) continue;
          // Change the step from large to 1 pixel
          if(i !== 0 && step === largeStep) {
            i = Math.max(-channels, i - (channels * step))
            step = Math.ceil(1, Math.floor(step / 2))
            continue
          }
          // Found the first video pixel, add to sizes
          const size = i ? (i / channels) : 0
          sizes.push(size)
          break;
        }
        step = largeStep
        const iEnd = (line.length - 1 - (channels * ignoreEdge))
        // From the bottom up
        for (let i = iEnd; i >= 0; i -= (channels * step)) {
          if(
            // Below the bottom limit
            i > lineLimit &&
            // Within the color deviation
            Math.abs(line[i-3] - color[0]) <= maxColorDeviation && 
            Math.abs(line[i-2] - color[1]) <= maxColorDeviation && 
            Math.abs(line[i-1] - color[2]) <= maxColorDeviation
          ) continue;
          // Change the step from large to 1 pixel
          if(i !== line.length - 1 && step === largeStep) {
            i = Math.min((line.length - 1 + channels) , i + (channels * step))
            step = Math.ceil(1, Math.floor(step / 2))
            continue
          }
          // Found the first video pixel, add to sizes
          const j = (line.length - 1) - i;
          const size = j ? (j / channels) : 0
          sizes.push(size)
          break;
        }
      }
      const height = (imageVLines[0].length / channels)
      imageVLines.length = 0

      if(!sizes.length) {
        return
      }

      let closestSizes = sizes
      while(closestSizes.length > 6) {
        averageSize = (closestSizes.reduce((a, b) => a + b, 0) / closestSizes.length)
        closestSizes = closestSizes.sort(sortSizes).slice(0, closestSizes.length - 1)
      }
      const maxDeviation = Math.abs(Math.max(...closestSizes) - Math.min(...closestSizes))
      const allowed = height * 0.01
      const deviationAllowed = (maxDeviation <= allowed)
      const baseOffsetPercentage = 0.4
      const maxPercentage = 30

      let size = 0;
      if(!deviationAllowed) {
        let lowestSize = Math.min(...closestSizes)
        let lowestPercentage = Math.round((lowestSize / height) * 10000) / 100
        if(lowestPercentage >= currentPercentage - 4) {
          return
        }
    
        size = lowestSize
        if(size < (height * 0.012)) {
          size = 0
        } else {
          size += (height * (offsetPercentage/100))
        }
      } else {
        size = Math.max(...closestSizes)
        if(size < (height * 0.012)) {
          size = 0
        } else {
          size += (height * ((baseOffsetPercentage + offsetPercentage)/100))
        }
      }

      if(size > (height * 0.49)) {
        let lowestSize = Math.min(...sizes)
        if(lowestSize >= (height * 0.01)) {
          lowestSize += (height * (offsetPercentage/100))
        }
        let lowestPercentage = Math.round((lowestSize / height) * 10000) / 100
        if(lowestPercentage < currentPercentage) {
          return lowestPercentage // Almost filled with a single color but found content outside the current detected percentage
        }
        return // Filled with a almost single color
      }
      
      let percentage = Math.round((size / height) * 10000) / 100
      percentage = Math.min(percentage, maxPercentage)

      const adjustment = (percentage - currentPercentage)
      if(adjustment > -1 && adjustment <= 0) {
        return
      }

      if(percentage > maxPercentage) {
        return maxPercentage
      }
      return percentage
    }
    
    this.onmessage = async (e) => {
      id = e.data.id
      try {
        const detectColored = e.data.detectColored
        const offsetPercentage = e.data.offsetPercentage
        const currentPercentage = e.data.currentPercentage
        const canvasInfo = e.data.canvasInfo
      
        if(canvasInfo.bitmap) {
          const bitmap = canvasInfo.bitmap
          if(!canvas) {
            canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
            ctx = canvas.getContext('2d', {
              alpha: false,
              desynchronized: true
            })
            ctx.imageSmoothingEnabled = false

            // canvas2 = new SafeOffscreenCanvas(bitmap.width, bitmap.height)
            // ctx2 = canvas2.getContext("bitmaprenderer")
          } else if(
            canvas.width !== bitmap.width ||
            canvas.height !== bitmap.height
          ) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            ctx = canvas.getContext('2d', {
              alpha: false
            })
            ctx.imageSmoothingEnabled = false

            // canvas2.width = bitmap.width
            // canvas2.height = bitmap.height
            // ctx2 = canvas2.getContext("bitmaprenderer")
          } 
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
        } else {
          canvas = canvasInfo.canvas
          ctx = canvasInfo.ctx
        }

        // ctx2.transferFromImageBitmap(bitmap)
        // ctx.drawImage(canvas2, 0, 0)
        
        const percentage = await workerDetectHorizontalBarSize(
          detectColored, 
          offsetPercentage, 
          currentPercentage
        )
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      
        this.postMessage({ 
          id,
          percentage
        })
      } catch(ex) {
        this.postMessage({
          id,
          error: ex
        })
      }
    }
  } catch(ex) {
    if (!catchedWorkerCreationError) {
      catchedWorkerCreationError = true
      this.postMessage({
        id: -1,
        error: ex
      })
    }
  }
}

export default class HorizontalBarDetection {
  worker
  workerMessageId = 0
  cancellable = true
  run = null
  canvas;
  ctx;
  catchedDetectHorizontalBarSizeError = false;
  lastChange;

  clear = () => {
    if(!this.run || !this.cancellable) return

    this.run = null
  }

  detect = (buffer, detectColored, offsetPercentage, currentPercentage, callback) => {
    if(this.run) return

    const run = this.run = {}

    if(!this.worker) {
      this.worker = workerFromCode(workerCode)
      this.worker.onmessage = (e) => {
        if(e.data.id !== -1) {
          console.warn('Ambient light for YouTube™ | Ignoring old worker message:', e.data)
          return
        }
        if(e.data.error) {
          AmbilightSentry.captureExceptionWithDetails(e.data.error)
        }
      }
    }

    this.idleHandlerArguments = {
      buffer,
      detectColored,
      offsetPercentage,
      currentPercentage,
      callback
    }

    requestIdleCallback(() => this.idleHandler(run), { timeout: 1000 })
  }

  idleHandler = wrapErrorHandler(async (run) => {
    if(this.run !== run) return
    this.cancellable = false

    const {
      buffer,
      detectColored,
      offsetPercentage,
      currentPercentage,
      callback
    } = this.idleHandlerArguments
    let canvasInfo;
    try {
      const start = performance.now()

      if(!this.canvas) {
        this.canvas = new SafeOffscreenCanvas(5, 512) // Smallest size to prevent many garbage collections caused by transferToImageBitmap
        this.ctx = this.canvas.getContext('2d', {
          alpha: false,
          desynchronized: true
        })
        this.ctx.imageSmoothingEnabled = true
      }

      this.ctx.drawImage(buffer, 0, 0, this.canvas.width, this.canvas.height)
      canvasInfo = this.worker.isFallbackWorker ? {
        canvas: this.canvas,
        ctx: this.ctx
      } : {
        bitmap: this.canvas.transferToImageBitmap()
      }

      this.workerMessageId++;
      const stack = new Error().stack
      let newPercentage;
      const onMessagePromise = new Promise((resolve, reject) => {
        this.worker.onerror = (err) => reject(err)
        this.worker.onmessage = (e) => {
          try {
            if(
              this.run !== run || 
              e.data.id !== this.workerMessageId
            ) {
              console.warn('Ambient light for YouTube™ | Ignoring old percentage:', e.data.id, e.data.percentage)
              return
            }
            if(e.data.error) {
              // Readable name for the worker script
              e.data.error.stack = e.data.error.stack.replace(/blob:.+?:\/.+?:/g, 'extension://scripts/horizontal-bar-detection-worker.js:')
              appendErrorStack(stack, e.data.error)
              throw e.data.error
            }
            callback(e.data.percentage)
            newPercentage = e.data.percentage
            if(newPercentage !== undefined) {
              this.lastChange = performance.now()
            }
            resolve()
          } catch(ex) {
            reject(ex)
          }
        }
      })
      this.worker.postMessage(
        {
          id: this.workerMessageId,
          canvasInfo,
          detectColored,
          offsetPercentage,
          currentPercentage
        }, 
        canvasInfo.bitmap ? [canvasInfo.bitmap] : undefined
      )
      await onMessagePromise;
      if(canvasInfo.bitmap) {
        canvasInfo.bitmap.close()
      }
      if(this.run !== run) return
      
      this.cancellable = true
      const now = performance.now()
      const minThrottle = (!this.lastChange || this.lastChange + 15000 < now)
        ? 1000
        : ((this.lastChange + 3000 < now)
          ? 500
          : 0
        )
      const throttle = Math.max(minThrottle, Math.min(5000, Math.pow(now - start, 1.2) - 250))

      setTimeout(() => {
        if(this.run !== run) return

        this.run = null
      }, throttle)
    } catch(ex) {
      if(canvasInfo?.bitmap) {
        canvasInfo.bitmap.close()
      }
      this.cancellable = true
      this.run = null
      if (!this.catchedDetectHorizontalBarSizeError) {
        this.catchedDetectHorizontalBarSizeError = true
        throw ex
      }
    }
  }, true)
}