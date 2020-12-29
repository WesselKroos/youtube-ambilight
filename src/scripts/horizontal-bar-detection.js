import { appendErrorStack, SafeOffscreenCanvas, requestIdleCallback } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'
import { workerFromCode } from './libs/worker'

let catchedDetectHorizontalBarSizeError = false

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
    const workerDetectHorizontalBarSize = async (detectColored, offsetPercentage, clipPercentage) => {
      partSize = Math.ceil(canvas.width / 6)
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
      const maxPercentage = 0.25
      const ignoreEdge = 2
    
      for(const line of imageVLines) {
        const largeStep = 20
        let step = largeStep
        let lineLimit = (line.length * maxPercentage) + largeStep
        const iStart = (channels * ignoreEdge)
        for (let i = iStart; i < line.length; i += (channels * step)) {
          if(i < lineLimit) {
            if(
              Math.abs(line[i] - color[0]) <= maxColorDeviation && 
              Math.abs(line[i+1] - color[1]) <= maxColorDeviation && 
              Math.abs(line[i+2] - color[2]) <= maxColorDeviation
            ) continue;
            if(i !== 0 && step === largeStep) {
              i -= (channels * step)
              step = Math.ceil(1, Math.floor(step / 2))
              continue
            }
          }
          const size = i ? (i / channels) : 0
          sizes.push(size)
          break;
        }
        step = largeStep
        lineLimit = (line.length * (1 - maxPercentage)) - largeStep
        const iEnd = (line.length - 1 - (channels * ignoreEdge))
        for (let i = iEnd; i >= 0; i -= (channels * step)) {
          if(i > lineLimit) {
            if(
              Math.abs(line[i-3] - color[0]) <= maxColorDeviation && 
              Math.abs(line[i-2] - color[1]) <= maxColorDeviation && 
              Math.abs(line[i-1] - color[2]) <= maxColorDeviation
            ) continue;
            if(i !== line.length - 1 && step === largeStep) {
              i += (channels * step)
              step = Math.ceil(1, Math.floor(step / 2))
              continue
            }
          }
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
      const valid = (maxDeviation <= allowed)
      
      let size = 0;
      if(!valid) {
        let lowestSize = Math.min(...sizes)
        let lowestPercentage = Math.round((lowestSize / height) * 10000) / 100
        if(lowestPercentage >= clipPercentage - 4) {
          return
        }
    
        size = lowestSize
      } else {
        size = Math.max(...sizes)// (sizes.reduce((a, b) => a + b, 0) / sizes.length)
      }
    
      
      if(size < (height * 0.01)) {
        size = 0
      } else {
        size += (height * 0.004) + (height * (offsetPercentage/100))
      }
      
      let percentage = Math.round((size / height) * 10000) / 100
      percentage = Math.min(percentage, 49) === 49 ? 0 : percentage
    
      const adjustment = (percentage - clipPercentage)
      if(
        (percentage > (maxPercentage * 100)) ||
        (adjustment > -1 && adjustment <= 0)
      ) {
        return
      }
    
      return percentage
    }
    
    this.onmessage = async (e) => {
      id = e.data.id
      try {
        const detectColored = e.data.detectColored
        const offsetPercentage = e.data.offsetPercentage
        const clipPercentage = e.data.clipPercentage
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
          clipPercentage
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

const detectHorizontalBarSize = (buffer, detectColored, offsetPercentage, clipPercentage, callback) => {
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

  requestIdleCallback(async () => {
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
          clipPercentage
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
  }, { timeout: 1000 })
}

export default detectHorizontalBarSize