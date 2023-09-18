import { appendErrorStack, requestIdleCallback, SafeOffscreenCanvas, wrapErrorHandler } from './generic'
import SentryReporter from './sentry-reporter'
import { workerFromCode } from './worker'

const workerCode = function () {
  let catchedWorkerCreationError = false
  let canvas;
  let ctx;
  let workerMessageId = 0;

  async function getLineImageData(imageLines, yLength, index) {
    const params = yLength === 'height' 
      ? [index, 0, 1, canvas.height]
      : [0, index, canvas.width, 1]

    const start = performance.now()
    imageLines.push(ctx.getImageData(...params).data)
    const duration = performance.now() - start

    // Give the GPU cores breathing time to decode the video or prepaint other elements in between
    // Allows 4k60fps with frame blending + video overlay 80fps -> 144fps
    await new Promise(resolve => setTimeout(resolve, duration < 1 ? 0 : 1)) // Math.min(1000/24, duration / 2))
  }

  function sortSizes(averageSize, a, b) {
    const aGap = Math.abs(averageSize - a)
    const bGap = Math.abs(averageSize - b)
    return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
  }

  const partSizeBorderMultiplier = 1
  try {
    const workerDetectBarSize = async (id, xLength, yLength, scale, detectColored, offsetPercentage, currentPercentage) => {
      const partSize = Math.floor(canvas[xLength] / (5 + (partSizeBorderMultiplier * 2)))
      const imageLines = []
      for (let index = Math.ceil(partSize / 2) - 1 + (partSizeBorderMultiplier * partSize); index < canvas[xLength] - (partSizeBorderMultiplier * partSize); index += partSize) {
        if(id < workerMessageId) return
        await getLineImageData(imageLines, yLength, index)
      }
      if(id < workerMessageId) return

      const channels = 4
      const colorIndex = (channels * 4)
      let color = detectColored ?
        [imageLines[0][colorIndex], imageLines[0][colorIndex + 1], imageLines[0][colorIndex + 2]] :
        [2,2,2]
      const maxColorDeviation = 16
      const ignoreEdge = 2
      const lineLimit = (imageLines[0].length / 2)
      const largeStep = 20
      const topSizes = []
      const bottomSizes = []
    
      for(const line of imageLines) {
        let step = largeStep
        // From the top down
        for (let i = (channels * ignoreEdge); i < line.length; i += (channels * step)) {
          if(
            // Above the top limit
            i < lineLimit &&
            // Within the color deviation
            (Math.abs(line[i] - color[0]) + Math.abs(line[i+1] - color[1]) + Math.abs(line[i+2] - color[2])) <= maxColorDeviation
          ) continue;

          // Change the step from large to 1 pixel
          if(i !== 0 && step === largeStep) {
            i = Math.max(-channels, i - (channels * step))
            step = Math.ceil(1, Math.floor(step / 2))
            continue
          }

          // Found the first video pixel, add to topSizes
          topSizes.push(i / channels)
          break;
        }

        step = largeStep
        // From the bottom up
        for (let i = (line.length - 1 - (channels * ignoreEdge)); i >= 0; i -= (channels * step)) {
          if(
            // Below the bottom limit
            i > lineLimit &&
            // Within the color deviation
            (Math.abs(line[i-3] - color[0]) + Math.abs(line[i-2] - color[1]) + Math.abs(line[i-1] - color[2])) <= maxColorDeviation
          ) continue;

          // Change the step from large to 1 pixel
          if(i !== line.length - 1 && step === largeStep) {
            i = Math.min((line.length - 1 + channels) , i + (channels * step))
            step = Math.ceil(1, Math.floor(step / 2))
            continue
          }

          // Found the first video pixel, add to bottomSizes
          bottomSizes.push(((line.length - 1) - i) / channels)
          break;
        }
      }

      const maxSize = (imageLines[0].length / channels)
      imageLines.length = 0

      if(!topSizes.length || !bottomSizes.length) {
        return
      }

      // Calculate averages and deviations

      const maxAllowedDeviation = maxSize * (0.0125 * scale)
      let sizes = [...topSizes, ...bottomSizes]
      let closestSizes = sizes
      while(closestSizes.length > 7) {
        const averageSize = (closestSizes.reduce((a, b) => a + b, 0) / closestSizes.length)
        closestSizes = closestSizes.sort((a, b) => sortSizes(averageSize, a, b)).slice(0, closestSizes.length - 1)
      }
      const maxDeviation = Math.abs(Math.max(...closestSizes) - Math.min(...closestSizes))
      let deviationIsAllowed = (maxDeviation <= maxAllowedDeviation)

      if(!deviationIsAllowed) {
        const maxAllowedSideDeviation = maxSize * (0.0125 * scale)

        let closestTopSizes = topSizes
        while(closestTopSizes.length > 4) {
          const averageTopSize = (closestTopSizes.reduce((a, b) => a + b, 0) / closestTopSizes.length)
          closestTopSizes = closestTopSizes.sort((a, b) => sortSizes(averageTopSize, a, b)).slice(0, closestTopSizes.length - 1)
        }
        const maxTopDeviation = Math.abs(Math.max(...closestTopSizes) - Math.min(...closestTopSizes))
        const topDeviationIsAllowed = (maxTopDeviation <= maxAllowedSideDeviation)

        if(topDeviationIsAllowed) {
          let closestBottomSizes = bottomSizes
          while(closestBottomSizes.length > 4) {
            const averageBottomSize = (closestBottomSizes.reduce((a, b) => a + b, 0) / closestBottomSizes.length)
            closestBottomSizes = closestBottomSizes.sort((a, b) => sortSizes(averageBottomSize, a, b)).slice(0, closestBottomSizes.length - 1)
          }
          const maxBottomDeviation = Math.abs(Math.max(...closestBottomSizes) - Math.min(...closestBottomSizes))
          const bottomDeviationIsAllowed = (maxBottomDeviation <= maxAllowedSideDeviation)

          if(bottomDeviationIsAllowed) {
            const maxAllowedCombinedSidesDeviation = maxSize * (0.035 * scale)
            deviationIsAllowed = (maxDeviation <= maxAllowedCombinedSidesDeviation)
          }
        }
      }

      // Check if calculated percentages are allowed

      const minSize = maxSize * (0.012 * scale)
      const baseOffsetPercentage = (0.6 * ((1 + scale) / 2))

      let size = 0;
      if(!deviationIsAllowed) {
        let lowestSize = Math.min(...sizes)
        let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
        if(lowestPercentage >= currentPercentage - 4) {
          return // Detected percentage is close to the current percentage, but the detected points deviate too much
        }
    
        size = lowestSize
        if(size < minSize) {
          size = 0
        } else {
          size += (maxSize * (offsetPercentage/100))
        }
      } else {
        size = Math.max(...closestSizes)
        if(size < minSize) {
          size = 0
        } else {
          size += (maxSize * ((baseOffsetPercentage + offsetPercentage)/100))
        }
      }

      if(size > (maxSize * 0.49)) {
        let lowestSize = Math.min(...sizes)
        if(lowestSize >= minSize) {
          lowestSize += (maxSize * (offsetPercentage/100))
        }
        let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
        if(lowestPercentage < currentPercentage) {
          return lowestPercentage // Almost filled with a single color but found content outside the current detected percentage
        }
        return // Filled with a almost single color
      }
      
      let percentage = Math.round((size / maxSize) * 10000) / 100
      const maxPercentage = 36
      percentage = Math.min(percentage, maxPercentage)
      return percentage
    }
    
    this.onmessage = async (e) => {
      const id = e.data.id
      try {
        if(e.data.type === 'cancellation') {
          workerMessageId = id
          return
        }

        const detectColored = e.data.detectColored
        const offsetPercentage = e.data.offsetPercentage
        const detectHorizontal = e.data.detectHorizontal
        const currentHorizontalPercentage = e.data.currentHorizontalPercentage
        const detectVertical = e.data.detectVertical
        const currentVerticalPercentage = e.data.currentVerticalPercentage
        const canvasInfo = e.data.canvasInfo
        const ratio = e.data.ratio
      
        if(canvasInfo.bitmap) {
          const bitmap = canvasInfo.bitmap
          if(!canvas) {
            canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
            ctx = canvas.getContext('2d', {
              alpha: false,
              desynchronized: true
            })
            ctx.imageSmoothingEnabled = false
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
          } 
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
        } else {
          canvas = canvasInfo.canvas
          ctx = canvasInfo.ctx
        }
        
        let horizontalPercentage = detectHorizontal
          ? await workerDetectBarSize(
              id, 'width', 'height', 1, detectColored, offsetPercentage, currentHorizontalPercentage
          )
          : undefined
          let verticalPercentage = detectVertical
          ? await workerDetectBarSize(
              id, 'height', 'width', ratio, detectColored, offsetPercentage, currentVerticalPercentage
          )
          : undefined
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      
        if(id < workerMessageId) {
          horizontalPercentage = undefined
          verticalPercentage = undefined
        }
        this.postMessage({ 
          id,
          horizontalPercentage,
          verticalPercentage
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

export default class BarDetection {
  worker
  workerMessageId = 0
  run = null
  cleared = true
  canvas;
  ctx;
  catchedDetectBarSizeError = false;
  lastChange;
  history = {
    horizontal: [],
    vertical: []
  }

  constructor(ambientlight) {
    this.ambientlight = ambientlight
  }

  clear = () => {
    this.workerMessageId++; // invalidate current worker processes
    if(this.worker) {
      this.worker.postMessage({
        id: this.workerMessageId,
        type: 'cancellation'
      })
    }

    this.run = null
    this.history = {
      horizontal: [],
      vertical: []
    }
  }

  detect = (buffer, detectColored, offsetPercentage,
    detectHorizontal, currentHorizontalPercentage,
    detectVertical, currentVerticalPercentage,
    ratio, allowedToTransfer, averageHistorySize, callback) => {
    if(this.run) {
      this.continueAfterRun = true
      return
    }

    const run = this.run = {}

    if(!this.worker) {
      this.worker = workerFromCode(workerCode)
      this.worker.onmessage = (e) => {
        if(e.data.id !== -1) {
          // console.warn('Ignoring old bar detection message:', e.data)
          return
        }
        if(e.data.error) {
          SentryReporter.captureException(e.data.error)
        }
      }
    }

    this.idleHandlerArguments = {
      buffer, detectColored, offsetPercentage,
      detectHorizontal, currentHorizontalPercentage,
      detectVertical, currentVerticalPercentage,
      ratio, allowedToTransfer, averageHistorySize,
      callback
    }

    requestIdleCallback(async () => await this.idleHandler(run), { timeout: 1 }, true)
  }

  averagePercentage(percentage, currentPercentage, history, averageHistorySize) {
    if(percentage === undefined) return

    const detectedPercentage = percentage

    // Detected a small adjustment in percentages but could be caused by an artifact in the video. Pick the largest of the last 5 percentages
    percentage = [...history, detectedPercentage].sort((a, b) => b - a)[Math.floor(history.length / 2)]

    let adjustment = (percentage - currentPercentage)
    if(adjustment > -1.5 && adjustment <= 0) {
      // Ignore small adjustments
      adjustment = (detectedPercentage - currentPercentage)
      if(adjustment > -1.5 && adjustment <= 0) {
        percentage = undefined
      } else {
        percentage = currentPercentage // Disable throttling
      }
    }

    history.push(detectedPercentage)
    if(history.length > averageHistorySize) history.splice(0, history.length - averageHistorySize)

    return percentage
  }

  idleHandler = async (run) => {
    if(this.run !== run) return

    const {
      buffer, detectColored, offsetPercentage,
      detectHorizontal, currentHorizontalPercentage,
      detectVertical, currentVerticalPercentage,
      ratio, allowedToTransfer, averageHistorySize,
      callback
    } = this.idleHandlerArguments

    let canvasInfo;
    let bufferCtx;
    try {
      const start = performance.now()

      if(this.worker.isFallbackWorker || !allowedToTransfer || !buffer.transferToImageBitmap || !buffer.getContext) {
        if(!this.canvas) {
          this.canvas = new SafeOffscreenCanvas(512, 512) // Smallest size to prevent many garbage collections caused by transferToImageBitmap
          this.ctx = undefined
        }

        if(!this.ctx || (this.ctx?.isContextLost && this.ctx.isContextLost())) {
          this.ctx = this.canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
          })
          this.ctx.imageSmoothingEnabled = true
        }

        this.ctx.drawImage(buffer, 0, 0, this.canvas.width, this.canvas.height)
        canvasInfo = (this.worker.isFallbackWorker || !this.canvas.transferToImageBitmap)
          ? {
            canvas: this.canvas,
            ctx: this.ctx
          } 
          : {
            bitmap: this.canvas.transferToImageBitmap()
          }
      } else {
        bufferCtx = buffer.getContext('2d')
        if(bufferCtx instanceof Promise) bufferCtx = await bufferCtx
        if(bufferCtx && (!bufferCtx.isContextLost || !bufferCtx.isContextLost())) {
          canvasInfo = {
            bitmap: buffer.transferToImageBitmap()
          }
        }
      }

      if(!canvasInfo) {
        this.run = null
        return
      }
      
      if(this.run !== run) {
        if(canvasInfo.bitmap) {
          canvasInfo.bitmap.close()
        }
        return
      }

      this.workerMessageId++;
      const stack = new Error().stack
      const onMessagePromise = new Promise(function onMessagePromise(resolve, reject) {
        this.worker.onerror = (err) => reject(err)
        this.worker.onmessage = (e) => {
          try {
            if(
              this.run !== run || 
              e.data.id !== this.workerMessageId
            ) {
              // console.warn('Ignoring old bar detection percentage:', 
              //   this.workerMessageId, e.data.id, e.data.horizontalPercentage,  e.data.verticalPercentage)
              resolve()
              return
            }
            if(e.data.error) {
              // Readable name for the worker script
              e.data.error.stack = e.data.error.stack.replace(/blob:.+?:\/.+?:/g, 'extension://scripts/bar-detection-worker.js:')
              appendErrorStack(stack, e.data.error)
              throw e.data.error
            }

            const horizontalPercentage = this.averagePercentage(e.data.horizontalPercentage, currentHorizontalPercentage || 0, this.history.horizontal, averageHistorySize)
            const verticalPercentage = this.averagePercentage(e.data.verticalPercentage, currentVerticalPercentage || 0, this.history.vertical, averageHistorySize)

            if(
              horizontalPercentage !== undefined || verticalPercentage !== undefined ||
              (e.data.horizontalPercentage !== undefined && Math.abs(e.data.horizontalPercentage - currentHorizontalPercentage) > 0.5) || 
              (e.data.verticalPercentage !== undefined && Math.abs(e.data.verticalPercentage - currentVerticalPercentage) > 0.5)
            ) {
              if(
                (horizontalPercentage !== undefined && horizontalPercentage !== currentHorizontalPercentage) || 
                (verticalPercentage !== undefined && verticalPercentage !== currentVerticalPercentage)
              ) {
                callback(horizontalPercentage, verticalPercentage)
              }
              this.lastChange = performance.now()
            }

            resolve()
          } catch(ex) {
            reject(ex)
          }
        }
      }.bind(this))
      this.worker.postMessage(
        {
          id: this.workerMessageId,
          canvasInfo,
          detectColored, offsetPercentage,
          detectHorizontal, currentHorizontalPercentage,
          detectVertical, currentVerticalPercentage,
          ratio
        },
        canvasInfo.bitmap ? [canvasInfo.bitmap] : undefined
      )
      await onMessagePromise;
      if(canvasInfo.bitmap) {
        canvasInfo.bitmap.close()
      }
      if(this.run !== run) return
      
      const now = performance.now()
      const minThrottle = (!this.lastChange || this.lastChange + 15000 < now)
        ? 1000
        : ((this.lastChange + 3000 < now)
          ? 500
          : 0
        )
      const throttle = Math.max(minThrottle, Math.min(5000, Math.pow(now - start, 1.2) - 250))

      setTimeout(wrapErrorHandler(() => {
        if(this.run !== run) return

        this.run = null
        if(!this.continueAfterRun) return
        
        this.continueAfterRun = false
        this.ambientlight.scheduleBarSizeDetection()
      }), throttle)
    } catch(ex) {
       // Happens when the video has been emptied or canvas is cleared before the idleCallback has been executed
      const isKnownError = (
        ex.message?.includes('ImageBitmap construction failed') || // Chromium
        ex.name === 'DataCloneError' // Firefox
      )
      if(!isKnownError) {
        ex.details = {
          detectColored,
          offsetPercentage,
          detectHorizontal,
          currentHorizontalPercentage,
          detectVertical,
          currentVerticalPercentage,
          ratio, 
          allowedToTransfer,
          buffer: buffer ? {
            width: buffer.width,
            height: buffer.height,
            ctx: buffer.ctx?.constructor?.name,
            type: buffer.constructor?.name
          } : undefined,
          bufferCtx: bufferCtx?.constructor?.name,
          canvasInfo: canvasInfo ? {
            canvas: canvasInfo?.canvas ? {
              width: canvasInfo.canvas.width,
              height: canvasInfo.canvas.height,
              type: canvasInfo.canvas.constructor?.name
            } : undefined,
            ctx: canvasInfo.ctx?.constructor?.name,
            bitmap: canvasInfo?.bitmap ? {
              width: canvasInfo.bitmap.width,
              height: canvasInfo.bitmap.height,
              type: canvasInfo.bitmap.constructor?.name
            } : undefined
          } : undefined
        }
      }

      if(canvasInfo?.bitmap) {
        canvasInfo.bitmap.close()
      }
      this.run = null
      if (this.catchedDetectBarSizeError || isKnownError) return

      this.catchedDetectBarSizeError = true
      throw ex
    }
  }
}