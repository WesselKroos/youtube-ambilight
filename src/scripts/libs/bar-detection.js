import { appendErrorStack, requestIdleCallback, SafeOffscreenCanvas, wrapErrorHandler } from './generic'
import SentryReporter from './sentry-reporter'
import { workerFromCode } from './worker'

const workerCode = function () {
  let catchedWorkerCreationError = false
  let canvas;
  let canvasIsCreatedInWorker = false
  let ctx;
  let workerMessageId = 0;
  let globalXOffsetIndex = 0;
  const scanlinesAmount = 5 // 10 // 40 // 5

  const postError = (ex) => {
    if (!catchedWorkerCreationError) {
      catchedWorkerCreationError = true
      this.postMessage({
        id: -1,
        error: ex
      })
    }
  }

  let getLineImageDataStart
  async function getLineImageData(imageLines, yLength, xIndex) {
    if(!getLineImageDataStart) {
      getLineImageDataStart = performance.now()
    } else if(performance.now() - getLineImageDataStart > 4) {
      // Give the CPU breathing time to execute other javascript code/internal browser code in between on single core instances
      // (or GPU cores breathing time to decode the video or prepaint other elements in between)
      // Allows 4k60fps with frame blending + video overlay 80fps -> 144fps
      
      // const delayStart = performance.now()
      await new Promise(resolve => setTimeout(resolve, 1)) // 0/1 = 13.5ms in Firefox & 0/1.5 ms in Chromium
      // console.log(`was busy for ${(delayStart - getLineImageDataStart).toFixed(2)}ms | delayed by ${(performance.now() - delayStart).toFixed(2)}ms`)
      getLineImageDataStart = performance.now()
    }

    const params = yLength === 'height' 
      ? [xIndex, 0, 1, canvas.height]
      : [0, xIndex, canvas.width, 1]

    // const start = performance.now()
    // const duration = performance.now() - start
    imageLines.push({
      xIndex,
      yLength,
      data: ctx.getImageData(...params).data
    })
  }

  function sortSizes(averageSize, a, b) {
    const aGap = Math.abs(averageSize - a)
    const bGap = Math.abs(averageSize - b)
    return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
  }

  function sortColors(averageColor, a, b) {
    const aDiff = Math.abs(averageColor[0] - a[0]) + Math.abs(averageColor[1] - a[1]) + Math.abs(averageColor[2] - a[2])
    const bDiff = Math.abs(averageColor[0] - b[0]) + Math.abs(averageColor[1] - b[1]) + Math.abs(averageColor[2] - b[2])
    return (aDiff === bDiff) ? 0 : (aDiff > bDiff) ? 1 : -1
  }

  function getAverageColor(imageLines, channels) {
    const edgeOffset = 4
    const topOffsetIndex = channels * edgeOffset
    const bottomOffsetIndex = imageLines[0].data.length - channels - topOffsetIndex

    let colors = []
    let i = 0
    for(const line of imageLines) {
      i = topOffsetIndex + (Math.round((edgeOffset * 2 * Math.random())) - edgeOffset) * channels
      colors.push([line[i], line[i + 1], line[i + 2]])
      i = bottomOffsetIndex + (Math.round((edgeOffset * 2 * Math.random())) - edgeOffset) * channels
      colors.push([line[i], line[i + 1], line[i + 2]])
    }
    // const oldColor = colors[0]

    let averageColor = [
      colors.reduce((average, color) => average + color[0], 0) / colors.length,
      colors.reduce((average, color) => average + color[1], 0) / colors.length,
      colors.reduce((average, color) => average + color[2], 0) / colors.length
    ]
    colors.sort((a, b) => sortColors(averageColor, a, b))
    // const droppedColors = 
    colors.splice(Math.floor(colors.length / 2))

    averageColor = [
      colors.reduce((average, color) => average + color[0], 0) / colors.length,
      colors.reduce((average, color) => average + color[1], 0) / colors.length,
      colors.reduce((average, color) => average + color[2], 0) / colors.length
    ]
    // colors.sort((a, b) => sortColors(averageColor, a, b))

    // console.log(oldColor, averageColor)

    // const color = colors[0]
    colors.length = 0
    return averageColor
  }

  try {
    const workerDetectBarSize = async (id, xLength, yLength, scale, detectColored, offsetPercentage, currentPercentage, allowedAnomaliesPercentage, xOffset) => {
      
      const partSizeBorderMultiplier = allowedAnomaliesPercentage > 20 ? 1 : 0
      const partSize = Math.floor(canvas[xLength] / (scanlinesAmount + (partSizeBorderMultiplier * 2)))
      const imageLines = []
      for (let index = Math.ceil(partSize / 2) - 1 + (partSizeBorderMultiplier * partSize); index < canvas[xLength] - (partSizeBorderMultiplier * partSize); index += partSize) {
        if(id < workerMessageId) {
          imageLines.length = 0
          return
        }
        // await getLineImageData(imageLines, yLength, index)
        await getLineImageData(imageLines, yLength, 
          Math.min(Math.max(0,
            index + Math.round(xOffset * (partSize / 2) - partSize / 4)
          ), canvas[xLength] - 1))
      }
      // console.log(`scanned ${imageLines.length} lines`)
      if(id < workerMessageId) {
        imageLines.length = 0
        return
      }

      const channels = 4
      const color = getAverageColor(imageLines, channels)
      if(!detectColored && (
        color[0] + color[1] + color[2] > 8 ||
        Math.abs(color[0] - color[1]) > 3 ||
        Math.abs(color[1] - color[2]) > 3 ||
        Math.abs(color[2] - color[0]) > 3
      )) {
        imageLines.length = 0
        return 0
      }

      const maxColorDeviation = 8 // 16
      const maxBrightnessDeviation = 8
      const maxColorAndBrightnessDeviationSum = 16
      const ignoreEdge = 2
      const middleIndex = (imageLines[0].data.length / 2)
      const largeStep = 20
      const topSizes = []
      const bottomSizes = []
    
      for(const imageLine of imageLines) {
        const data = imageLine.data
        let step = largeStep
        // From the top down
        for (let i = (channels * ignoreEdge); i < data.length; i += (channels * step)) {
          const colorDeviation = Math.abs(data[i] - color[0]) + Math.abs(data[i+1] - color[1]) + Math.abs(data[i+2] - color[2])
          const brightnessDeviation = Math.abs(data[i] + data[i+1] + data[i+2] - (color[0] + color[1] + color[2]))
          if(
            // Above the top limit
            i < middleIndex &&
            // Within the color and brightness deviation
            (colorDeviation <= maxColorDeviation || brightnessDeviation <= maxBrightnessDeviation) && 
            colorDeviation + brightnessDeviation <= maxColorAndBrightnessDeviationSum
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
        for (let i = (data.length - 1 - (channels * ignoreEdge)); i >= 0; i -= (channels * step)) {
          const colorDeviation = Math.abs(data[i-3] - color[0]) + Math.abs(data[i-2] - color[1]) + Math.abs(data[i-1] - color[2])
          const brightnessDeviation = Math.abs(data[i-3] + data[i-2] + data[i-1] - (color[0] + color[1] + color[2]))
          // (Math.abs(data[i-3] - color[0]) + Math.abs(data[i-2] - color[1]) + Math.abs(data[i-1] - color[2])) <= maxColorDeviation
          if(
            // Below the bottom limit
            i > middleIndex &&
            // Within the color deviation
            // Within the color and brightness deviation
            (colorDeviation <= maxColorDeviation || brightnessDeviation <= maxBrightnessDeviation) && 
            colorDeviation + brightnessDeviation <= maxColorAndBrightnessDeviationSum
          ) continue;

          // Change the step from large to 1 pixel
          if(i !== data.length - 1 && step === largeStep) {
            i = Math.min((data.length - 1 + channels) , i + (channels * step))
            step = Math.ceil(1, Math.floor(step / 2))
            continue
          }

          // Found the first video pixel, add to bottomSizes
          bottomSizes.push(((data.length - 1) - i) / channels)
          break;
        }
      }

      const maxSize = (imageLines[0].data.length / channels)
      imageLines.length = 0

      // console.log(JSON.stringify(topSizes), JSON.stringify(bottomSizes))

      // console.log(topSizes, bottomSizes)
      if(!topSizes.length || !bottomSizes.length) {
        if(topSizes.length) topSizes.length = 0
        if(bottomSizes.length) bottomSizes.length = 0
        return
      }

      // Calculate averages and deviations

      const maxAllowedDeviation = maxSize * (0.0125 * scale)
      let sizes = [...topSizes, ...bottomSizes]
      topSizes.length = 0
      bottomSizes.length = 0
      const threshold = sizes.length * (1 - ((allowedAnomaliesPercentage - 10) / 100))
      let closestSizes = sizes
      while(closestSizes.length > threshold) {
        const averageSize = (closestSizes.reduce((a, b) => a + b, 0) / closestSizes.length)
        closestSizes = closestSizes.sort((a, b) => sortSizes(averageSize, a, b)).slice(0, closestSizes.length - 1)
      }
      const maxDeviation = Math.abs(Math.max(...closestSizes) - Math.min(...closestSizes))
      let deviationIsAllowed = (maxDeviation <= maxAllowedDeviation)

      // console.log(JSON.stringify(closestSizes))

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

    const createContext = () => {
      ctx = canvas.getContext('2d', {
        // alpha: false, // Decreases performance on some platforms
        desynchronized: true,
        willReadFrequently: true
      })
      ctx.imageSmoothingEnabled = false
    }

    const createCanvas = (width, height) => {
      canvas = new OffscreenCanvas(width, height)
      canvas.addEventListener('contextlost', () => {
        try {
          // Free GPU memory
          canvas.width = 1
          canvas.height = 1
        } catch(ex) {
          postError(ex)
        }
      })
      canvas.addEventListener('contextrestored', () => {
        try {
          canvas.width = 1
          canvas.height = 1
        } catch(ex) {
          postError(ex)
        }
      })

      canvasIsCreatedInWorker = true

      createContext()
    }
    
    this.onmessage = async (e) => {
      const id = e.data.id
      try {
        if(e.data.type === 'cancellation') {
          workerMessageId = id
          globalXOffsetIndex = 0
          return
        }
        // contextlost/contextrestored are never fired in our worker. Keeping our context lost
        if(e.data.type === 'clear') {
          workerMessageId = id
          globalXOffsetIndex = 0
          if(canvas && canvasIsCreatedInWorker && canvas.width !== 1 && canvas.height !== 1) createCanvas(1, 1)
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
        const allowedAnomaliesPercentage = e.data.allowedAnomaliesPercentage
        const xOffsetSize = e.data.xOffsetSize

        getLineImageDataStart = performance.now()
      
        if(canvasInfo.bitmap) {
          const bitmap = canvasInfo.bitmap
          if(!canvas) {
            createCanvas(bitmap.width, bitmap.height)
          } else if(
            canvas.width !== bitmap.width ||
            canvas.height !== bitmap.height
          ) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height

            createContext()
          }
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
        } else {
          canvas = canvasInfo.canvas
          canvasIsCreatedInWorker = false
          ctx = canvasInfo.ctx
        }
        
        globalXOffsetIndex++
        if(globalXOffsetIndex >= xOffsetSize) globalXOffsetIndex = 0
        const xOffset = xOffsetSize === 1 ? .5 : (
          (Math.ceil(globalXOffsetIndex / 2) + (globalXOffsetIndex % 2))
          / (xOffsetSize - 1)
        )
        // console.log(xOffsetSize, globalXOffsetIndex, xOffset)
        let horizontalPercentage = detectHorizontal
          ? await workerDetectBarSize(
              id, 'width', 'height', 1, detectColored, offsetPercentage, currentHorizontalPercentage,
              allowedAnomaliesPercentage, xOffset
          )
          : undefined
        let verticalPercentage = detectVertical
          ? await workerDetectBarSize(
              id, 'height', 'width', ratio, detectColored, offsetPercentage, currentVerticalPercentage,
              allowedAnomaliesPercentage, xOffset
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
      } finally {
        getLineImageDataStart = 0
      }
    }
  } catch(ex) {
    postError(ex)
  }
}

export default class BarDetection {
  worker
  workerMessageId = 0
  run = null
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
        type: 'clear'
      })
    }

    this.run = null
    this.history = {
      horizontal: [],
      vertical: []
    }
  }

  cancel = () => {
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
    ratio, allowedToTransfer, averageHistorySize, allowedAnomaliesPercentage,
    callback) => {
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
      ratio, allowedToTransfer, averageHistorySize, allowedAnomaliesPercentage,
      callback
    }

    requestIdleCallback(async () => await this.idleHandler(run), { timeout: 1 }, true)
  }

  averagePercentage(percentage, currentPercentage, history, averageHistorySize) {
    if(percentage === undefined) return

    const detectedPercentage = percentage

    // Detected a small adjustment in percentages but could be caused by an artifact in the video. Pick the largest of the last 5 percentages
    // percentage = [...history, detectedPercentage].sort((a, b) => b - a)[Math.floor(history.length / 2)]
    const percentagesOccurrence = [...history, detectedPercentage]
      .reduce((percentages, precentage) => {
        percentages[precentage] = (percentages[precentage] ?? 0) + 1
        return percentages
      }, {})
    percentage = Object.keys(percentagesOccurrence).reduce(
      (a, b) => percentagesOccurrence[a] > percentagesOccurrence[b] ? a : b)
        
    // Is the difference less than 2 occurences? Then prevent flickering
    if(percentage !== currentPercentage && Math.abs(percentagesOccurrence[percentage] - percentagesOccurrence[currentPercentage]) <= history.length / 2) {
      percentage = currentPercentage
    }
    // console.log(percentage, percentagesOccurrence, history)

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
      ratio, allowedToTransfer, averageHistorySize, allowedAnomaliesPercentage,
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
            // alpha: false, // Decreases performance on some platforms
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

            const barsFound = horizontalPercentage !== undefined || verticalPercentage !== undefined
            if(
              barsFound ||
              (e.data.horizontalPercentage !== undefined && Math.abs(e.data.horizontalPercentage - currentHorizontalPercentage) > 0.5) || 
              (e.data.verticalPercentage !== undefined && Math.abs(e.data.verticalPercentage - currentVerticalPercentage) > 0.5)
            ) {
              const barsChanged = (
                (horizontalPercentage !== undefined && horizontalPercentage !== currentHorizontalPercentage) || 
                (verticalPercentage !== undefined && verticalPercentage !== currentVerticalPercentage)
              )
              if(barsChanged) {
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
          ratio,
          allowedAnomaliesPercentage,
          xOffsetSize: averageHistorySize
        },
        canvasInfo.bitmap ? [canvasInfo.bitmap] : undefined
      )
      await onMessagePromise;
      if(canvasInfo.bitmap) {
        canvasInfo.bitmap.close()
      }
      if(this.run !== run) return
      
      const now = performance.now()
      const duration = now - start
      this.ambientlight.stats.addBarDetectionDuration(duration)

      const minThrottle = (!this.lastChange || this.lastChange + 15000 < now)
        ? 1000
        : ((this.lastChange + 3000 < now)
          ? 500
          : 0
        )
      const throttle = Math.max(minThrottle, Math.min(5000, Math.pow(duration, 1.2) - 250))

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