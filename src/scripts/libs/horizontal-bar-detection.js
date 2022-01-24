let averageSize = 0;
function sortSizes(a, b) {
  const aGap = Math.abs(averageSize - a)
  const bGap = Math.abs(averageSize - b)
  return (aGap === bGap) ? 0 : (aGap > bGap) ? 1 : -1
}

const detectHorizontalBar = (imageVLines, detectColored, offsetPercentage, currentPercentage) => {
  let sizes = []
  const startColorY = 4
  let color = detectColored ?
    [imageVLines[0][startColorY][0], imageVLines[0][startColorY][1], imageVLines[0][startColorY][2]] :
    [(2/256),(2/256),(2/256)]
  const maxColorDeviation = (8 / 256)
  const ignoreEdge = 2
  const lineLimit = (imageVLines[0].length / 2)
  const largeStep = 20

  for(const line of imageVLines) {
    let step = largeStep
    const iStart = ignoreEdge
    // From the top down
    for (let i = iStart; i < line.length; i += step) {
      if(
        // Above the top limit
        i < lineLimit &&
        // Within the color deviation
        Math.abs(line[i][0] - color[0]) <= maxColorDeviation && 
        Math.abs(line[i][1] - color[1]) <= maxColorDeviation && 
        Math.abs(line[i][2] - color[2]) <= maxColorDeviation
      ) {
        // console.log('top', i, line[i][0], line[i][1], line[i][2])
        continue;
      }
      // Change the step from large to 1 pixel
      if(i !== 0 && step === largeStep) {
        i = Math.max(-1, i - step)
        step = Math.ceil(1, Math.floor(step / 2))
        // console.log('top to small', i)
        continue
      }
      // Found the first video pixel, add to sizes
      const size = i ? (i / 1) : 0
      sizes.push(size)
      // console.log('top limit', i)
      break;
    }
    step = largeStep
    const iEnd = (line.length - 1 - ignoreEdge)
    // From the bottom up
    for (let i = iEnd; i >= 0; i -= step) {
      if(
        // Below the bottom limit
        i > lineLimit &&
        // Within the color deviation
        Math.abs(line[i-1][0] - color[0]) <= maxColorDeviation && 
        Math.abs(line[i-1][1] - color[1]) <= maxColorDeviation && 
        Math.abs(line[i-1][2] - color[2]) <= maxColorDeviation
      ) {
        // console.log('bottom', i)
        continue;
      }
      // Change the step from large to 1 pixel
      if(i !== line.length - 1 && step === largeStep) {
        i = Math.min(line.length, i + step)
        step = Math.ceil(1, Math.floor(step / 2))
        // console.log('bottom to small', i)
        continue
      }
      // Found the first video pixel, add to sizes
      const j = (line.length - 1) - i;
      const size = j ? (j / 1) : 0
      sizes.push(size)
      // console.log('bottom limit', i)
      break;
    }
  }
  const height = (imageVLines[0].length / 1)
  imageVLines.length = 0

  if(!sizes.length) {
    return
  }

  // console.log(sizes)

  averageSize = (sizes.reduce((a, b) => a + b, 0) / sizes.length)
  const closestSizes = sizes.sort(sortSizes).slice(0, Math.min(6, sizes.length))

  const maxDeviation = Math.abs(Math.min(...closestSizes) - Math.max(...closestSizes))
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
    if(size < (height * 0.01)) {
      size = 0
    } else {
      size += (height * (offsetPercentage/100))
    }
  } else {
    size = Math.max(...closestSizes)
    if(size < (height * 0.01)) {
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
};


let gpu
let gpuKernel
let width
let height

const createKernelFromCanvas = (canvas) => {
  width = canvas.width
  height = canvas.height

  if(gpuKernel) {
    gpuKernel.destroy()
    gpuKernel = undefined
  }
  if(gpu) {
    gpu.destroy()
    gpu = undefined
  }
  
  gpu = new GPU(
    // { mode: 'cpu' } // debug
  )
  gpuKernel = gpu
    .createKernel(function (src, width, height) {
      return src[(this.thread.x * width) + this.thread.y];
    }, {
      output: [height, width],
      // tactic: 'speed',
      // floatOutput: false,
      // precision: 'unsigned',
      // optimizeFloatMemory: true
      // immutable: true
    })
}

export const detectViaGPU = async (
  {
    canvas,
    detectColored,
    offsetPercentage,
    currentPercentage
  },
  callback
) => {
  try {
    if(!window.GPU) return

    if(
      !gpuKernel || 
      width !== canvas.width || 
      height !== canvas.height
    ) {
      createKernelFromCanvas(canvas)
    }

    // console.log('size', canvas.width, canvas.height)
    const a = performance.now()
    const output = gpuKernel(canvas, canvas.width, canvas.height)
    const b = performance.now()
    // console.log('output:', output)
    const percentage = detectHorizontalBar(output, detectColored, offsetPercentage, currentPercentage)
    const c = performance.now()
    // console.log(b - a, c - b)
    // console.log('percentage:', percentage)
    
    callback(percentage)
  } catch(ex) {
    console.log('GPU exception')
    console.error(ex)
  }
};