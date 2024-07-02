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
  async function getLineImageData(imageLines, yAxis, xIndex) {
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

    const params = yAxis === 'height' 
      ? [xIndex, 0, 1, canvas.height]
      : [0, xIndex, canvas.width, 1]

    // const start = performance.now()
    // const duration = performance.now() - start
    imageLines.push({
      xIndex,
      data: ctx.getImageData(...params).data
    })
  }

  const sortSizes = (averageSize) => (a, b) => {
    const aGap = Math.abs(averageSize - a.yIndex)
    const bGap = Math.abs(averageSize - b.yIndex)
    return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
  }

  function sortAverageColors(averageColor, a, b) {
    const aDiff = Math.abs(averageColor[0] - a[0]) + Math.abs(averageColor[1] - a[1]) + Math.abs(averageColor[2] - a[2])
    const bDiff = Math.abs(averageColor[0] - b[0]) + Math.abs(averageColor[1] - b[1]) + Math.abs(averageColor[2] - b[2])
    return (aDiff === bDiff) ? 0 : (aDiff > bDiff) ? 1 : -1
  }

  function getAverageColor(imageLines, channels) {
    const topOffsetIndex = channels * 2
    const bottomOffsetIndex = imageLines[0].data.length - channels - topOffsetIndex

    let colors = []
    for(const imageLine of imageLines) {
      const data = imageLine.data
      for(let i = topOffsetIndex; i <= topOffsetIndex + 12 * channels; i += 2 * channels) {
        colors.push([data[i], data[i + 1], data[i + 2]])
      }
      for(let i = bottomOffsetIndex; i >= bottomOffsetIndex - 12 * channels; i -= 2 * channels) {
        colors.push([data[i], data[i + 1], data[i + 2]])
      }
    }
    // const oldColor = colors[0]

    let averageColor = [
      colors.reduce((average, color) => average + color[0], 0) / colors.length,
      colors.reduce((average, color) => average + color[1], 0) / colors.length,
      colors.reduce((average, color) => average + color[2], 0) / colors.length
    ]
    colors.sort((a, b) => sortAverageColors(averageColor, a, b))
    colors.splice(Math.floor(colors.length / 2))

    averageColor = [
      colors.reduce((average, color) => average + color[0], 0) / colors.length,
      colors.reduce((average, color) => average + color[1], 0) / colors.length,
      colors.reduce((average, color) => average + color[2], 0) / colors.length
    ]
    // colors.sort((a, b) => sortColors(averageColor, a, b))

    // console.log(oldColor, averageColor)

    // console.log(averageColor, JSON.parse(JSON.stringify(colors)))
    // const color = colors[0]
    colors.length = 0
    return averageColor
  }

  function getColorDeviation(a, b) {
    return (
      Math.abs(a[0] - b[0]) +
      Math.abs(a[1] - b[1]) +
      Math.abs(a[2] - b[2])
    )
  }

  function getBrightnessDeviation(a, b) {
    return Math.abs(
      a[0] + a[1] + a[2] -
      (b[0] + b[1] + b[2])
    )
  }

  function isWithinColorAndBrightnessDeviationLimit(a, b) {
    const colorDeviation = getColorDeviation(a, b)
    const brightnessDeviation = getBrightnessDeviation(a, b)
    return (
      (colorDeviation <= allowedColorDeviation || brightnessDeviation <= allowedBrightnessDeviation) && 
      colorDeviation + brightnessDeviation <= allowedColorAndBrightnessDeviationSum
    )
  }

  const maxDeviation = 255 * 3 + 255 * 3
  const allowedColorDeviation = 8
  const allowedBrightnessDeviation = 8
  const allowedColorAndBrightnessDeviationSum = 16

  const edgePointXRange = globalThis.BARDETECTION_EDGE_RANGE;
  const edgePointYRange = 4;

  const easeInOutQuad = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2

  function getCertainty(point, yAxis, yDirection, color, channels) {
    const x = point.x - edgePointXRange
    const y = point.y - edgePointYRange
    const xLength = 1 + edgePointXRange * 2;
    const yLength = 1 + edgePointYRange * 2;
    const data = ctx.getImageData(...(yAxis === 'height'
      ? [x, y, xLength, yLength]
      : [y, x, yLength, xLength]
    )).data

    // console.log(point, yAxis, yDirection, color)
    // console.log(x, y, xLength, yLength)
    // console.log(data)
    
    let score = 0
    for(let dx = 0; dx < xLength; dx++) {
      const ix = dx * (yAxis === 'height' ? 1 : yLength)
      
      for(let dy = 0; dy < yLength; dy++) {
        const dy2 = yDirection === 1 ? dy : yLength - 1 - dy
        const iy = dy2 * (yAxis === 'height' ? xLength : 1)
        const i = ix * channels + iy * channels
        
        const iColor = (data[i+3] === 0)
          ? color // Outside canvas bounds
          : [data[i], data[i+1], data[i+2]]
        const expectWithinDeviation = dy < Math.floor(yLength / 2)
        // const within = isWithinColorAndBrightnessDeviationLimit(iColor, color)
        // console.log(dx, dy2, '|', ix, iy, '|', i, JSON.stringify(iColor), within)
        // if (within === expectWithinDeviation) {
          if(!expectWithinDeviation) {
            const colorDeviation = getColorDeviation(iColor, color)
            const brightnessDeviation = getBrightnessDeviation(iColor, color)
            const deviationScore = Math.max(0, Math.min(.75, (colorDeviation + brightnessDeviation) / maxDeviation / .025))
            // console.log(dx, dy, deviationScore)
            score += .25 + deviationScore
          } else {
            const within = isWithinColorAndBrightnessDeviationLimit(iColor, color)
            if(within)
              score += 1
          }
        // }
      }
    }
    const length = (xLength * yLength)
    const certainty = (score - length / 2) / (length / 2)
    // console.log('edges', certainty, JSON.stringify(certainties)) //, JSON.stringify(edges))

    return easeInOutQuad(certainty)
  }

  function detectEdges(imageLines, channels, color, yAxis) {
    const ignoreEdge = 2
    const middleIndex = imageLines[0].data.length / 2
    const middleIndexOffset = channels * 10
    const largeStep = 4
    const topEdges = []
    const bottomEdges = []
    const minCertainty = .65
  
    for(const imageLine of imageLines) {
      const {
        xIndex,
        data,
      } = imageLine
      let step = largeStep
      let wasDeviating = false
      let wasUncertain = false
      // From the top down
      let mostCertainEdge;
      for (let i = (channels * ignoreEdge); i < data.length; i += (channels * step)) {
        if(wasUncertain) {
          wasUncertain = false
          step = 1
        }

        const iColor = [data[i], data[i+1], data[i+2]]
        const limitNotReached = i < (middleIndex - middleIndexOffset) - channels // Below the top limit
        if(!limitNotReached) {
          if(mostCertainEdge) {
            topEdges.push({
              xIndex,
              yIndex: mostCertainEdge.i / channels,
              certainty: mostCertainEdge.certainty,
              deviates: mostCertainEdge.certainty < .5 ? true : undefined
            })
          } else {
            topEdges.push({
              xIndex,
              yIndex: 0,
              certainty: 0,
              deviates: true
            })
          }
          break
        }

        const isDeviating = !isWithinColorAndBrightnessDeviationLimit(iColor, color)

        if(limitNotReached && wasDeviating && !isDeviating) {
          wasDeviating = false
          continue
        }

        if(limitNotReached && wasDeviating === isDeviating) continue;

        // Change the step from large to 1 pixel
        if(i !== 0 && step === largeStep) {
          i = Math.max(-channels, i - (channels * step))
          step = Math.ceil(1, Math.floor(step / 2))
          continue
        }

        const certainty = getCertainty({ x: xIndex, y: i / channels }, yAxis, 1, color, channels)
        if(limitNotReached && certainty < minCertainty) {
          // console.log('uncertain top', xIndex, i / channels, certainty)
          // step = largeStep
          wasUncertain = true
          wasDeviating = true
          if(!(mostCertainEdge?.certainty >= certainty)) {
            mostCertainEdge = {
              i,
              certainty,
            }
          }
          continue
        }

        // Found the first video pixel, add to topEdges
        topEdges.push({
          xIndex,
          yIndex: i / channels,
          certainty
        })
        break
      }

      step = largeStep
      wasDeviating = false
      wasUncertain = false
      mostCertainEdge = undefined
      // From the bottom up
      for (let i = (data.length - channels * (1 + ignoreEdge)); i >= 0; i -= (channels * step)) {
        if(wasUncertain) {
          wasUncertain = false
          step = 1
        }

        const iColor = [data[i], data[i+1], data[i+2]]
        const limitNotReached = i > (middleIndex + middleIndexOffset) // Above the bottom limit
        if(!limitNotReached) {
          if(mostCertainEdge) {
            bottomEdges.push({
              xIndex,
              yIndex: (data.length - mostCertainEdge.i) / channels,
              certainty: mostCertainEdge.certainty,
              deviates: mostCertainEdge.certainty < .5 ? true : undefined
            })
          } else {
            bottomEdges.push({
              xIndex,
              yIndex: 0,
              certainty: 0,
              deviates: true
            })
          }
          break
        }
        const isDeviating = !isWithinColorAndBrightnessDeviationLimit(iColor, color)

        if(limitNotReached && wasDeviating && !isDeviating) {
          wasDeviating = false
          continue
        }

        if(limitNotReached && wasDeviating === isDeviating) continue;

        // Change the step from large to 1 pixel
        if(i !== data.length - channels && step === largeStep) {
          i = Math.min((data.length - channels), i + (channels * step))
          step = Math.ceil(1, Math.floor(step / 2))
          continue
        }

        const certainty = getCertainty({ x: xIndex, y: i / channels }, yAxis, -1, color, channels)
        if(limitNotReached && certainty < minCertainty) {
          // console.log('uncertain bottom', xIndex, i / channels, certainty)
          // step = largeStep
          wasUncertain = true
          wasDeviating = true
          if(!(mostCertainEdge?.certainty >= certainty)) {
            mostCertainEdge = {
              i,
              certainty,
            }
          }
          continue
        }

        // Found the first video pixel, add to bottomEdges
        bottomEdges.push({
          xIndex,
          yIndex: (data.length - i) / channels,
          certainty
        })
        break
      }
    }

    return { topEdges, bottomEdges }
  }

  const reduceAverageSize = (edges) => edges.reduce((sum, edge) => sum + edge.yIndex, 0) / edges.length

  function getExceedsDeviationLimit(edges, topEdges, bottomEdges, maxSize, scale, allowedAnomaliesPercentage) {
    if(
      !topEdges.filter(e => !e.deviates).length || 
      !bottomEdges.filter(e => !e.deviates).length
    ) {
      return true
    }

    const threshold = (1 - ((allowedAnomaliesPercentage - 10) / 100))

    while(edges.filter(e => !e.deviates).length > edges.length * threshold) {
      const nonDeviatingEdges = edges.filter(e => !e.deviates)
      const averageSize = reduceAverageSize(nonDeviatingEdges)
      nonDeviatingEdges
        .sort(sortSizes(averageSize))
        .slice(nonDeviatingEdges.length - 1)
        .forEach(e => {
          e.deviates = true
        })
    }

    // while(topEdges.filter(e => !e.deviates && !e.deviatesTop).length > edges.length * threshold) {
    //   const nonDeviatingEdges = topEdges.filter(e => !e.deviates && !e.deviatesTop)
    //   const averageSize = reduceAverageSize(nonDeviatingEdges)
    //   nonDeviatingEdges
    //     .sort(sortSizes(averageSize))
    //     .slice(nonDeviatingEdges.length - 1)
    //     .forEach(e => {
    //       e.deviatesTop = true
    //     })
    // }

    // while(bottomEdges.filter(e => !e.deviates && !e.deviatesBottom).length > edges.length * threshold) {
    //   const nonDeviatingEdges = bottomEdges.filter(e => !e.deviates && !e.deviatesBottom)
    //   const averageSize = reduceAverageSize(nonDeviatingEdges)
    //   nonDeviatingEdges
    //     .sort(sortSizes(averageSize))
    //     .slice(nonDeviatingEdges.length - 1)
    //     .forEach(e => {
    //       e.deviatesBottom = true
    //     })
    // }

    
    const maxAllowedSideDeviation = maxSize * (0.008 * scale)
    
    const nonDeviatingTopEdges = topEdges
      .filter(e => !e.deviates && !e.deviatesTop)
      .map(e => e.yIndex)
    const maxTopDeviation = Math.abs(Math.max(...nonDeviatingTopEdges) - Math.min(...nonDeviatingTopEdges))
    const topDeviationIsAllowed = (maxTopDeviation <= maxAllowedSideDeviation)

    const nonDeviatingBottomEdges = bottomEdges
      .filter(e => !e.deviates && !e.deviatesBottom)
      .map(e => e.yIndex)
    const maxBottomDeviation = Math.abs(Math.max(...nonDeviatingBottomEdges) - Math.min(...nonDeviatingBottomEdges))
    const bottomDeviationIsAllowed = (maxBottomDeviation <= maxAllowedSideDeviation)

    if(!topDeviationIsAllowed && !bottomDeviationIsAllowed) {
      // console.log(
      //   !topDeviationIsAllowed ? `top deviates ${maxTopDeviation}` : '',
      //   !topDeviationIsAllowed ? topEdges : '',
      //   !bottomDeviationIsAllowed ? `bottom deviates ${maxBottomDeviation}` : '',
      //   !bottomDeviationIsAllowed ? bottomEdges : '',
      //   maxAllowedSideDeviation
      // )
      return true
    }

    const averageTopSize = reduceAverageSize(nonDeviatingTopEdges)
    const averageBottomSize = reduceAverageSize(nonDeviatingBottomEdges)
    const sidesDeviation = Math.abs(averageTopSize - averageBottomSize)
    if(sidesDeviation > maxAllowedSideDeviation) {
      // console.log('average top & bottom deviates', sidesDeviation, maxAllowedSideDeviation)
      return true
    }


    // Allow a higher deviation between top and bottom edges
    const maxAllowedDeviation = maxSize * (0.035 * scale)
    const nonDeviatingEdgeSizes = edges
      .filter(e => !e.deviates)
      .map(e => e.yIndex)
    const maxDeviation = Math.abs(Math.max(...nonDeviatingEdgeSizes) - Math.min(...nonDeviatingEdgeSizes))
    if (maxDeviation > maxAllowedDeviation) {
      // console.log('all edges deviate', maxDeviation, maxAllowedDeviation)
      return true
    }
  }

  function getPercentage(exceedsDeviationLimit, maxSize, scale, edges, currentPercentage = 0, offsetPercentage = 0) {
    const minSize = maxSize * (0.03 * scale)
    const lowerSizeThreshold = maxSize * ((currentPercentage - 4) / 100)
    const baseOffsetPercentage = (0.3 * ((1 + scale) / 2))

    let size;
    if(exceedsDeviationLimit) {
      const semiCertainLowerSizes = edges
        .filter(e => e.certainty > .5 && e.yIndex < lowerSizeThreshold)
        .map(e => e.yIndex)
      if(semiCertainLowerSizes.length / edges.length < .33) return
      
      const lowestSize = Math.min(...semiCertainLowerSizes)
      // let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
      // // console.log(lowestPercentage, lowestSize, currentPercentage)
      // if(lowestPercentage >= currentPercentage - 4) {
      //   return // deviating lowest percentage is way higher than the current percentage
      // }
  
      // console.log('semi-certain lower percentage', lowestSize, lowerSizeThreshold, semiCertainLowerSizes, edges)
      size = lowestSize
      if(size < minSize) {
        size = 0
      } else {
        size += (maxSize * (offsetPercentage / 100))
      }
    } else {
      size = Math.max(...edges.filter(e => !e.deviates).map(e => e.yIndex))
      // console.log(size, currentPercentage)
      if(size < minSize) {
        size = 0
      } else {
        size += (maxSize * ((baseOffsetPercentage + offsetPercentage) / 100))
      }
    }

    // if(size > (maxSize * 0.49)) {
    //   console.log('size beyond half', size, maxSize)
    //   alert('never happens?')
    //   let lowestSize = Math.min(...edges.map(e => e.yIndex))
    //   if(lowestSize >= minSize) {
    //     lowestSize += (maxSize * (offsetPercentage/100))
    //   }
    //   let lowestPercentage = Math.round((lowestSize / maxSize) * 10000) / 100
    //   if(lowestPercentage < currentPercentage) {
    //     // console.log('lowestPercentage', lowestPercentage, edges)
    //     return lowestPercentage // Almost filled with a single color but found content outside the current detected percentage
    //   }
    //   return // Filled with a almost single color
    // }
    
    let percentage = Math.round((size / maxSize) * 10000) / 100
    const maxPercentage = 38
    percentage = Math.min(percentage, maxPercentage)
    // console.log('normal', percentage, edges)
    return percentage
  }

  try {
    const workerDetectBarSize = async (id, xLength, yAxis, scale, detectColored, offsetPercentage, currentPercentage, allowedAnomaliesPercentage, xOffset) => {
      const partSizeBorderMultiplier = allowedAnomaliesPercentage > 20 ? 1 : 0
      const partSize = Math.floor(canvas[xLength] / (scanlinesAmount + (partSizeBorderMultiplier * 2)))
      const imageLines = []
      for (let index = Math.ceil(partSize / 2) - 1 + (partSizeBorderMultiplier * partSize); index < canvas[xLength] - (partSizeBorderMultiplier * partSize); index += partSize) {
        if(id < workerMessageId) {
          imageLines.length = 0
          return
        }
        const xIndex = Math.min(Math.max(0,
          index + Math.round(xOffset * (partSize / 2) - partSize / 4)
        ), canvas[xLength] - 1)
        await getLineImageData(imageLines, yAxis, xIndex)
      }

      // console.log(imageSquare.length)

      // console.log(`scanned ${imageLines.length} lines`)
      if(id < workerMessageId) {
        imageLines.length = 0
        return
      }

      const channels = 4
      const color = getAverageColor(imageLines, channels)
      if(!detectColored && (
        color[0] + color[1] + color[2] > 16 ||
        Math.abs(color[0] - color[1]) > 3 ||
        Math.abs(color[1] - color[2]) > 3 ||
        Math.abs(color[2] - color[0]) > 3
      )) {
        const topEdges = imageLines.map(line => ({ xIndex: line.xIndex, yIndex: 0, deviates: true }))
        const bottomEdges = imageLines.map(line => ({ xIndex: line.xIndex, yIndex: 0, deviates: true }))
        imageLines.length = 0

        // console.log('edge case', topEdges, bottomEdges, percentage)
        return {
          percentage: 0,
          topEdges,
          bottomEdges
        }
      }

      const { topEdges, bottomEdges } = detectEdges(imageLines, channels, color, yAxis)

      const maxSize = imageLines[0].data.length / channels

      // // TODO: 
      // // 1. Figure out if needed: Prevents small objects in bars form reducing the bar like in Zig Zag, 
      // // but also prevents squares in the bars from reducing the bar like in cams/screenshots
      // // 2. Cutting off way to far:
      // //   - The first frame: https://www.youtube.com/watch?v=liuotbjjsHw
      // //   - https://www.youtube.com/watch?v=0MfHJmHjGxs&t=110
      // //   - https://youtu.be/a54V6U-Nb0I?si=upIe0WDg0SblmIxY&t=403
      // //   - Flickers back and forth to 0%: https://www.youtube.com/watch?v=TiQ7iWgY1fI&t=33s
      // //   - Cut out elements into bars: https://www.youtube.com/watch?v=W9aNGyXt294
      // //   - Vertical colored bars removed to often at the start:
      // //     https://www.youtube.com/watch?v=sDIi95CqTiM
      // //     gradients? https://www.youtube.com/watch?v=aWhro47QBm8
      // //   - Stars and 2 centered squared objects: https://www.youtube.com/watch?v=hL4IfoQzSSE&t=351s
      // //   - logo & squared: https://www.youtube.com/watch?v=UsWh21rFzh8&t=120s
      // //   - old video with vague bars: https://www.youtube.com/watch?v=YoLJ4CWSLSI
      // //   - Dismiss/reset black bars to content: https://youtu.be/oCmNbNhppHo?t=381
      
      // console.log(JSON.stringify(topEdges), JSON.stringify(bottomEdges))

      // console.log(topEdges, bottomEdges)


      const edges = [...topEdges, ...bottomEdges]
      const exceedsDeviationLimit = getExceedsDeviationLimit(edges, topEdges, bottomEdges, maxSize, scale, allowedAnomaliesPercentage)

      // console.log(JSON.stringify(edges), exceedsDeviationLimit)

      const percentage = getPercentage(exceedsDeviationLimit, maxSize, scale, edges, currentPercentage, offsetPercentage)
      // console.log('percentage', percentage, edges)
      
      if(
        !(percentage < currentPercentage) && 
        ([...topEdges, ...bottomEdges].filter(edge => !edge.deviates).length) / (imageLines.length * 2) < (100 - allowedAnomaliesPercentage) / 100
      ) {
        // console.log(`Discarded. Found ${topEdges.length + bottomEdges.length} of ${imageLines.length * 2}. Required: ${(100 - allowedAnomaliesPercentage)}%`)
        topEdges.forEach(edge => { edge.deviates = true })
        bottomEdges.forEach(edge => { edge.deviates = true })
        imageLines.length = 0
        
        return {
          topEdges,
          bottomEdges
        }
      }

      imageLines.length = 0
      return {
        percentage,
        topEdges,
        bottomEdges
      }
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
        // const ratio = e.data.ratio
        const allowedAnomaliesPercentage = e.data.allowedAnomaliesPercentage
        const xOffsetSize = e.data.xOffsetSize

        getLineImageDataStart = performance.now()
      
        if(canvasInfo.bitmap) {
          const bitmap = canvasInfo.bitmap
          if(!canvas) {
            createCanvas(512, 512)
          } else if(
            canvas.width !== 512 ||
            canvas.height !== 512
          ) {
            canvas.width = 512
            canvas.height = 512

            createContext()
          }
          ctx.drawImage(bitmap, 0, 0, 512, 512)
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
        let horizontalBarSizeInfo = detectHorizontal
          ? await workerDetectBarSize(
              id, 'width', 'height', 1, detectColored, offsetPercentage, currentHorizontalPercentage,
              allowedAnomaliesPercentage, xOffset
          )
          : undefined
        let verticalBarSizeInfo = detectVertical
          ? await workerDetectBarSize(
              id, 'height', 'width', 1, detectColored, offsetPercentage, currentVerticalPercentage,
              allowedAnomaliesPercentage, xOffset
          )
          : undefined
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      
        if(id < workerMessageId) {
          horizontalBarSizeInfo = undefined
          verticalBarSizeInfo = undefined
        }
        this.postMessage({ 
          id,
          horizontalBarSizeInfo,
          verticalBarSizeInfo
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
  changes = [];
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
    this.continueAfterRun = false
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
    this.continueAfterRun = false
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

    // Ignore previous percentages in cases: new video src, seeked or setting changed
    if(this.history.horizontal.length === 0) currentHorizontalPercentage = undefined
    if(this.history.vertical.length === 0) currentVerticalPercentage = undefined

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
    percentage = parseFloat(Object.keys(percentagesOccurrence).reduce(
      (a, b) => percentagesOccurrence[a] > percentagesOccurrence[b] ? a : b))
        
    // Is the difference less than 2 occurences? Then prevent flickering
    if(percentage !== currentPercentage && Math.abs(percentagesOccurrence[percentage] - percentagesOccurrence[currentPercentage]) <= history.length / 2) {
      percentage = currentPercentage
    }
    // console.log(detectedPercentage, percentage, percentagesOccurrence, history)

    let adjustment = (percentage - currentPercentage)
    if(percentage !== 0 && adjustment > -1.5 && adjustment <= 0) {
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
          this.canvas = new SafeOffscreenCanvas(
            512, 512
            // Math.min(buffer.videoWidth || buffer.width || 512, 512), 
            // Math.min(buffer.videoHeight || buffer.height || 512, 512)
          )
          // Smallest size to prevent many garbage collections caused by transferToImageBitmap
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
      
      this.ambientlight.stats.updateBarDetectionImage(canvasInfo.bitmap ?? canvasInfo.canvas)

      this.workerMessageId++;
      const stack = new Error().stack
      const onMessagePromise = new Promise(function onMessagePromise(resolve, reject) {
        this.worker.onerror = (err) => reject(err)
        this.worker.onmessage = async (e) => {
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
              const error = e.data.error
              // Readable name for the worker script
              error.stack = error.stack.replace(/blob:.+?:\/.+?:/g, 'extension://scripts/bar-detection-worker.js:')
              appendErrorStack(stack, error)
              throw error
            }

            const {
              horizontalBarSizeInfo = {},
              verticalBarSizeInfo = {}
            } = e.data

            let horizontalPercentage = this.averagePercentage(horizontalBarSizeInfo.percentage, currentHorizontalPercentage || 0, this.history.horizontal, averageHistorySize)
            let verticalPercentage = this.averagePercentage(verticalBarSizeInfo.percentage, currentVerticalPercentage || 0, this.history.vertical, averageHistorySize)
            let barsFound = horizontalPercentage !== undefined || verticalPercentage !== undefined
            
            // console.log(currentHorizontalPercentage, horizontalBarSizeInfo.percentage, horizontalPercentage, this.history.horizontal)
            await this.ambientlight.stats.updateBarDetectionResult(
              barsFound, horizontalPercentage, verticalPercentage, horizontalBarSizeInfo, verticalBarSizeInfo
            )

            const firstDetection = this.history.horizontal.length === 0 && this.history.vertical.length === 0
            if(firstDetection) {
              if(horizontalPercentage === undefined) horizontalPercentage = 0
              if(verticalPercentage === undefined) verticalPercentage = 0
              barsFound = true
            }

            if(
              barsFound ||
              (horizontalBarSizeInfo.percentage !== undefined && Math.abs(horizontalBarSizeInfo.percentage - currentHorizontalPercentage) > 0.5) || 
              (verticalBarSizeInfo.percentage !== undefined && Math.abs(verticalBarSizeInfo.percentage - currentVerticalPercentage) > 0.5)
            ) {
              const barsChanged = (
                (horizontalPercentage !== undefined && horizontalPercentage !== currentHorizontalPercentage) || 
                (verticalPercentage !== undefined && verticalPercentage !== currentVerticalPercentage)
              )
              this.changes.push(performance.now())
              if(barsChanged) {
                callback(horizontalPercentage, verticalPercentage)
              }
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

      if(this.changes.length > 1) {
        const minuteAgo = performance.now() - 60000
        this.changes = this.changes.filter(change => change > minuteAgo)
      } else if(!this.changes.length) {
        this.changes.push(now)
      }

      const lastChange = (this.changes.length > 0 && this.changes.length < 5)
        ? this.changes[this.changes.length - 1]
        : now
      const minThrottle = lastChange + 15000 < now
        ? 1000
        : ((lastChange + 3000 < now)
          ? 500
          : 0
        )
      const throttle = Math.max(minThrottle, Math.min(5000, Math.pow(duration, 1.2) - 250))
      this.ambientlight.stats.setBarDetectionThrottle(throttle)

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