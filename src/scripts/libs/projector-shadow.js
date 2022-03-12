import { Canvas, ctxOptions, SafeOffscreenCanvas } from './generic'

export default class ProjectorShadow {
  constructor(offscreen = true) {
    this.elem = offscreen
      ? new SafeOffscreenCanvas(512, 512, true)
      : new Canvas(512, 512)
    this.ctx = this.elem.getContext('2d', { ...ctxOptions, alpha: true })
  }

  rescale(scale, projectorSize, settings) {
    if (this.elem.style) {
      this.elem.style.transform = `scale(${scale.x + 0.01}, ${scale.y + 0.01})`
    }
    
    this.ctx.clearRect(0, 0, this.elem.width, this.elem.height)

    const edge = {
      w: ((projectorSize.w * scale.x) - projectorSize.w) / 2 / scale.x,
      h: ((projectorSize.h * scale.y) - projectorSize.h) / 2 / scale.y
    }
    const video = {
      w: (projectorSize.w / scale.x),
      h: (projectorSize.h / scale.y)
    }

    const darkest = 1
    const easing = (16 / (settings.fadeOutEasing * .64))
    const keyframes = this.plotKeyframes(256, easing, darkest)

    let fadeOutFrom = settings.bloom / 100
    const fadeOutMinH = -(video.h / 2 / edge.h)
    const fadeOutMinW = -(video.w / 2 / edge.w)
    fadeOutFrom = Math.max(fadeOutFrom, fadeOutMinH, fadeOutMinW)

    this.drawGradient(video.h, edge.h, keyframes, fadeOutFrom, darkest, false)
    this.drawGradient(video.w, edge.w, keyframes, fadeOutFrom, darkest, true)

    // Directions
    const scaleW = this.elem.width / (video.w + edge.w + edge.w)
    const scaleH = this.elem.height / (video.h + edge.h + edge.h)
    this.ctx.fillStyle = '#000000'


    if(!settings.directionTopEnabled) {
      this.ctx.beginPath()

      this.ctx.moveTo(0, 0)
      this.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h))
      this.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      
      this.ctx.fill()
    }

    if(!settings.directionRightEnabled) {
      this.ctx.beginPath()

      this.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  0)
      this.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h))
      this.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.ctx.fill()
    }

    if(!settings.directionBottomEnabled) {
      this.ctx.beginPath()

      this.ctx.moveTo(0,                                     scaleH * (edge.h + video.h + edge.h))
      this.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h + video.h))
      this.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.ctx.lineTo(scaleW * (edge.w + video.w),           scaleH * (edge.h + video.h))
      this.ctx.lineTo(scaleW * (edge.w + video.w + edge.w),  scaleH * (edge.h + video.h + edge.h))
      
      this.ctx.fill()
    }

    if(!settings.directionLeftEnabled) {
      this.ctx.beginPath()

      this.ctx.moveTo(0,                                     0)
      this.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h))
      this.ctx.lineTo(scaleW * (edge.w + (video.w / 2)),     scaleH * (edge.h + (video.h / 2)))
      this.ctx.lineTo(scaleW * (edge.w),                     scaleH * (edge.h + video.h))
      this.ctx.lineTo(0,                                     scaleH * (edge.h + video.h + edge.h))
      
      this.ctx.fill()
    }
  }

  plotKeyframes = (length, powerOf, darkest) => {
    const keyframes = []
    for (let i = 1; i < length; i++) {
      keyframes.push({
        p: (i / length),
        o: Math.pow(i / length, powerOf) * darkest
      })
    }
    return keyframes.map(({p, o}) => ({
      p: (Math.round(p * 10000) / 10000),
      o: (Math.round(o * 10000) / 10000)
    }))
  }
  
  //Shadow gradient 
  drawGradient = (size, edge, keyframes, fadeOutFrom, darkest, horizontal) => {
    const points = [
      0,
      ...keyframes.map(e => Math.max(
        0, edge - (edge * e.p) - (edge * fadeOutFrom * (1 - e.p))
      )),
      edge - (edge * fadeOutFrom),
      edge + size + (edge * fadeOutFrom),
      ...keyframes.reverse().map(e => Math.min(
        edge + size + edge, edge + size + (edge * e.p) + (edge * fadeOutFrom * (1 - e.p))
      )),
      edge + size + edge
    ]

    const pointMax = (points[points.length - 1])
    const gradient = this.ctx.createLinearGradient(
      0,
      0,
      horizontal ? this.elem.width : 0,
      !horizontal ? this.elem.height : 0
    )

    let gradientStops = []
    gradientStops.push([Math.min(1, points[0] / pointMax), `rgba(0,0,0,${darkest})`])
    for (const i in keyframes) {
      const e = keyframes[i]
      gradientStops.push([Math.min(1, points[0 + keyframes.length - i] / pointMax), `rgba(0,0,0,${e.o})`])
    }
    gradientStops.push([Math.min(1, points[1 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
    gradientStops.push([Math.min(1, points[2 + keyframes.length] / pointMax), `rgba(0,0,0,0)`])
    keyframes.reverse()
    for (const i in keyframes) {
      const e = keyframes[i]
      gradientStops.push([Math.min(1, points[2 + (keyframes.length * 2) - i] / pointMax), `rgba(0,0,0,${e.o})`])
    }
    gradientStops.push([Math.min(1, points[3 + (keyframes.length * 2)] / pointMax), `rgba(0,0,0,${darkest})`])

    gradientStops = gradientStops.map(args => [(Math.round(args[0] * 10000)/ 10000), args[1]])
    for (const gs of gradientStops) {
      gradient.addColorStop(...gs)
    }
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, this.elem.width, this.elem.height)
  }
}