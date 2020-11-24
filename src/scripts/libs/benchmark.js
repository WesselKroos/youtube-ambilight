import { raf, safeRequestIdleCallback } from "./generic"

export const getGPUBenchmarkScore = async () => {
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = 3840
  srcCanvas.height = 2160
  const srcContext = srcCanvas.getContext('2d')
  srcContext.fillStyle = '#ff0000'

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = 3840
  targetCanvas.height = 2160
  const targetContext = targetCanvas.getContext('2d')

  targetContext.drawImage(srcCanvas, 0, 0) // First draw is always slow

  const durations = []
  for(let i = 0; i < 50; i++) {
    await new Promise((resolve, reject) => setTimeout(() => raf(() => safeRequestIdleCallback(resolve)), 50))
    srcContext.fillRect(i, i, 1, 1)
    const start = performance.now()
    targetContext.drawImage(srcCanvas, 0, 0)
    durations.push(performance.now() - start)
  }
  console.log('Durations: ', durations)
  const sortedDurations = [...durations].sort((a, b) => b - a)
  console.log('Sorted durations', sortedDurations)

  const averageDurations = [...sortedDurations]
  averageDurations.splice(0, averageDurations.length - 20)
  averageDurations.splice(10, 10)

  const averageDuration = averageDurations.reduce((sum, d) => sum + d, 0) / averageDurations.length
  const score = 1 / averageDuration

  // Durations in 2160p:
  //
  // NVidia RTX 2070 Super
  // 0.044 - 0.064 (0.069)
  //
  // Intel Integrated graphics
  // ? - ?

  console.log('GPU Benchmark score: ', score, ' (duration ', averageDuration, ' ms)')
  console.log('Average durations', averageDurations)
  
  const infoElem = document.querySelector('#info-text')
  if(infoElem) {
    const scoreElem = document.createElement('span')
    scoreElem.style.color = '#fff'
    scoreElem.textContent = ` - GPU Score: ${Math.round(score * 100) / 100} (${Math.round(averageDuration * 1000) / 1000}ms)`
    infoElem.appendChild(scoreElem)
  }

  return score
}