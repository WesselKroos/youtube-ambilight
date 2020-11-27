import { workerFromCode } from "./libs/worker"

const workerCode = function () {
  const getGPUBenchmarkScore = async () => {
    const srcCanvas = new OffscreenCanvas(1920, 1080)
    const srcContext = srcCanvas.getContext('2d', { desynchronized: true })
    srcContext.fillStyle = '#ff0000'

    const targetCanvas = new OffscreenCanvas(1920, 1080)
    const targetContext = targetCanvas.getContext('2d', { desynchronized: true })
    targetContext.filter = 'blur(1px)'

    srcContext.fillRect(0, 0, 1, 1)
    targetContext.drawImage(srcCanvas, 0, 0) // First draw is always slow

    // const durations = []
    const start = performance.now()
    let i = 0
    for(; start + 1000 > performance.now(); i++) {
      //await new Promise((resolve) => setTimeout(resolve, 0))
      srcContext.fillRect(0, 0, 1, 1)
      targetContext.drawImage(srcCanvas, 0, 0)
      // duration += performance.now() - start
      // await new Promise((resolve) => setTimeout(resolve, 0))
    }
    // durations.push(performance.now() - start)
    console.log('Iterations: ', i)
    //const sortedDurations = [...durations].sort((a, b) => b - a)
    //console.log('Sorted durations', sortedDurations)

    // const averageDurations = [...sortedDurations]
    // averageDurations.splice(0, averageDurations.length - 20)
    // averageDurations.splice(10, 10)

    // const averageDuration = averageDurations.reduce((sum, d) => sum + d, 0) / averageDurations.length
    //const score = 100 / sortedDurations[sortedDurations.length - 1]
    const score = i

    // Durations in 512p:
    //
    // NVidia RTX 2070 Super
    // 0.120 - 0.132
    //
    // Intel Integrated graphics
    // 1.485 - 3.485

    // console.log('GPU Benchmark score: ', score, ' (duration ', averageDuration, ' ms)')
    // console.log('Average durations', averageDurations)

    return score
  }

  this.onmessage = async (e) => {
    const id = e.data.id
    const score = await getGPUBenchmarkScore()
    try {
      this.postMessage({ 
        id,
        score
      })
    } catch(error) {
      this.postMessage({
        id,
        error
      })
    }
  }
}

let worker
let workerMessageId = 0

export const getGPUBenchmarkScore = async () => {
  if(!worker) {
    worker = workerFromCode(workerCode)
  }

  let score = -1

  workerMessageId++;
  const onMessagePromise = new Promise((resolve, reject) => {
    worker.onerror = (err) => reject(err)
    worker.onmessage = (e) => {
      try {
        if(e.data.id !== workerMessageId) {
          console.warn('Ignoring old score:', e.data.id, e.data.score)
          return
        }
        if(e.data.error) {
          throw e.data.error
        }
        score = e.data.score
        resolve()
      } catch(err) {
        console.error('onmessage error:', err)
        reject(err)
      }
    }
  })
  worker.postMessage({
    id: workerMessageId
  })
  await onMessagePromise;
  console.log('await score:', score)
  return score
}
