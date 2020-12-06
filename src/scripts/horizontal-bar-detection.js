import { SafeOffscreenCanvas, safeRequestIdleCallback } from './libs/generic'
import AmbilightSentry from './libs/ambilight-sentry'
import { workerFromCode } from './libs/worker'

let catchedDetectHorizontalBarSizeError = false

const workerCode = function () {
  let catchedWorkerCreationError = false
  try {
    let throttle = 0
    const detectHorizontalBarSize = async (id, buffer, detectColored, offsetPercentage, clipPercentage) => {
      const imageVLines = []
      let partSize = Math.ceil(buffer.canvas.width / 6)
      for (let i = (partSize - 1); i < buffer.canvas.width; i += partSize) {
        await new Promise((resolve, reject) => setTimeout(() => {
          const start = performance.now()
          try {
            imageVLines.push(buffer.ctx.getImageData(i, 0, 1, buffer.canvas.height).data)
            throttle = Math.max(0, Math.pow(performance.now() - start, 1.2) - 10)
            resolve()
          } catch(err) {
            throttle = Math.max(0, Math.pow(performance.now() - start, 1.2) - 10)
            reject(err)
          }
        }, throttle)) // throttle allows 4k60fps with frame blending + video overlay 80fps -> 144fps
      }
    
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
      if(!sizes.length) {
        return
      }
    
      const averageSize = (sizes.reduce((a, b) => a + b, 0) / sizes.length)
      sizes = sizes.sort((a, b) => {
        const aGap = Math.abs(averageSize - a)
        const bGap = Math.abs(averageSize - b)
        return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
      }).splice(0, 6)
      const maxDeviation = Math.abs(Math.min(...sizes) - Math.max(...sizes))
      const height = (imageVLines[0].length / channels)
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
    
    let canvas;
    let ctx;
    
    // let canvas2;
    // let ctx2;
    
    this.onmessage = async (e) => {
      const id = e.data.id
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
        
        const percentage = await detectHorizontalBarSize(
          id,
          {
            canvas,
            ctx
          },
          detectColored, 
          offsetPercentage, 
          clipPercentage
        )
      
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
        console.error('YouTube Ambilight | received detectHorizontalBarSize workerCreation error:', e.data.error)
        AmbilightSentry.captureExceptionWithDetails(e.data.error)
      }
    }
  }

  safeRequestIdleCallback(async () => {
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
      const onMessagePromise = new Promise((resolve, reject) => {
        worker.onerror = (err) => reject(err)
        worker.onmessage = (e) => {
          try {
            if(e.data.id !== workerMessageId) {
              console.warn('Ignoring old percentage:', e.data.id, e.data.percentage)
              return
            }
            if(e.data.error) {
              throw e.data.error
            }
            callback(e.data.percentage)
            resolve()
          } catch(err) {
            reject(err)
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
        console.error('YouTube Ambilight | detectHorizontalBarSize error:', ex)
        AmbilightSentry.captureExceptionWithDetails(ex)
      }
    }
  }, { timeout: 1000 })
}

export default detectHorizontalBarSize