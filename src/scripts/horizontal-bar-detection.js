import { appendErrorStack, SafeOffscreenCanvas, requestIdleCallback, wrapErrorHandler } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'
import { workerFromCode } from './libs/worker'

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
  let throttle = 0
  let getLineImageDataStack;
  let getLineImageDataResolve;
  let getLineImageDataReject;

  function getLineImageData() {
    const start = performance.now()
    try {
      imageVLines.push(ctx.getImageData(imageVLinesIndex, 0, 1, canvas.height).data)
      throttle = Math.max(0, Math.pow(performance.now() - start, 1.2) - 10)
      getLineImageDataResolve()
    } catch(ex) {
      throttle = Math.max(0, Math.pow(performance.now() - start, 1.2) - 10)
      appendErrorStack(getLineImageDataStack, ex)
      getLineImageDataReject(ex)
    }
  }

  function getLineImageDataPromise(resolve, reject) {
    getLineImageDataResolve = resolve
    getLineImageDataReject = reject
    setTimeout(getLineImageData, throttle)
  }

  let averageSize = 0;
  function sortSizes(a, b) {
    const aGap = Math.abs(averageSize - a)
    const bGap = Math.abs(averageSize - b)
    return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
  }

  try {
    const workerDetectHorizontalBarSize = async (detectColored, offsetPercentage, currentPercentage) => {
      partSize = 1
      for (imageVLinesIndex = (partSize - 1); imageVLinesIndex < canvas.width; imageVLinesIndex += partSize) {
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
            i -= (channels * step)
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
            i += (channels * step)
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
    
      averageSize = (sizes.reduce((a, b) => a + b, 0) / sizes.length)
      sizes = sizes.sort(sortSizes).splice(0, 6)

      const maxDeviation = Math.abs(Math.min(...sizes) - Math.max(...sizes))
      const allowed = height * 0.01
      const deviationAllowed = (maxDeviation <= allowed)
      const baseOffsetPercentage = 0.4
      const maxPercentage = 30

      let size = 0;
      if(!deviationAllowed) {
        let lowestSize = Math.min(...sizes)
        let lowestPercentage = Math.round((lowestSize / height) * 10000) / 100
        if(lowestPercentage >= currentPercentage - 4) {
          return
        }
    
        size = lowestSize
      } else {
        size = Math.max(...sizes)// (sizes.reduce((a, b) => a + b, 0) / sizes.length)
      }

      if(size > (height * 0.49)) {
        return 0 // Filled with a single color
      } else if(size < (height * 0.01)) {
        size = 0
      } else {
        size += (height * ((baseOffsetPercentage + offsetPercentage)/100))
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

let worker
let workerMessageId = 0
let busy = false
let canvas;
let ctx;
let catchedDetectHorizontalBarSizeError = false
let detectHorizontalBarSizeArguments;

const detectHorizontalBarSize = (buffer, detectColored, offsetPercentage, currentPercentage, callback) => {
  if(busy) return
  busy = true

  if(!worker) {
    worker = workerFromCode(workerCode)
    worker.onmessage = (e) => {
      if(e.data.id !== -1) {
        console.warn('Ignoring worker message:', e.data)
        return
      }
      if(e.data.error) {
        AmbilightSentry.captureExceptionWithDetails(e.data.error)
      }
    }
  }

  detectHorizontalBarSizeArguments = {
    buffer,
    detectColored,
    offsetPercentage,
    currentPercentage,
    callback
  }

  requestIdleCallback(wrapErrorHandler(detectHorizontalBarSizeCallback), { timeout: 1000 })
}

const detectHorizontalBarSizeCallback = async () => {
  const {
    buffer,
    detectColored,
    offsetPercentage,
    currentPercentage,
    callback
  } = detectHorizontalBarSizeArguments

  try {
    const start = performance.now()

    if(!canvas) {
      canvas = new SafeOffscreenCanvas(5, 512) // Smallest size to prevent many garbage collections caused by transferToImageBitmap
      ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      })
      ctx.imageSmoothingEnabled = false
    }

    ctx.drawImage(buffer.elem, 0, 0, canvas.width, canvas.height)
    const canvasInfo = worker.isFallbackWorker ? {
      canvas,
      ctx
    } : {
      bitmap: canvas.transferToImageBitmap()
    }

    workerMessageId++;
    const stack = new Error().stack
    const onMessagePromise = new Promise((resolve, reject) => {
      worker.onerror = (err) => reject(err)
      worker.onmessage = (e) => {
        try {
          if(e.data.id !== workerMessageId) {
            console.warn('Ignoring old percentage:', e.data.id, e.data.percentage)
            return
          }
          if(e.data.error) {
            // Readable name for the worker script
            e.data.error.stack = e.data.error.stack.replace(/blob:.+?:\/.+?:/g, 'extension://scripts/horizontal-bar-detection-worker.js:')
            appendErrorStack(stack, e.data.error)
            throw e.data.error
          }
          callback(e.data.percentage)
          resolve()
        } catch(ex) {
          reject(ex)
        }
      }
    })
    worker.postMessage(
      {
        id: workerMessageId,
        canvasInfo,
        detectColored,
        offsetPercentage,
        currentPercentage
      }, 
      canvasInfo.bitmap ? [canvasInfo.bitmap] : undefined
    )
    await onMessagePromise;

    const throttle = Math.max(0, Math.pow(performance.now() - start, 1.2) - 30)
    setTimeout(() => {
      busy = false
    }, throttle)
  } catch(ex) {
    if (!catchedDetectHorizontalBarSizeError) {
      catchedDetectHorizontalBarSizeError = true
      throw ex
    }
  }
}

export default detectHorizontalBarSize