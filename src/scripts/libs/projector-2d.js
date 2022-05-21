import { Canvas, ctxOptions } from './generic'
import ProjectorShadow from './projector-shadow'

export default class Projector2d {
  type = 'Projector2d'
  constructor(containerElem) {
    this.containerElem = containerElem

    this.shadow = new ProjectorShadow(false)
    this.shadow.elem.classList.add('ambilight__shadow')
    this.containerElem.appendChild(this.shadow.elem)
    
    this.boundaryElem = this.shadow.elem
  }

  remove() {
    this.containerElem.remove(this.projectorListElem)
  }

  recreate(levels) {
    this.levels = levels
    if (!this.projectors) {
      this.projectors = []
    }

    this.projectors = this.projectors.filter(function removeExcessProjector(projector, i) {
      if (i >= levels) {
        projector.elem.remove()
        return false
      }
      return true
    })

    for (let i = this.projectors.length; i < levels; i++) {
      const projectorElem = new Canvas(1, 1)
      projectorElem.classList.add('ambilight__projector')

      const projectorCtx = projectorElem.getContext('2d', ctxOptions)
      this.containerElem.prepend(projectorElem)

      this.projectors.push({
        elem: projectorElem,
        ctx: projectorCtx
      })
    }
  }

  handlePageVisibility = () => {}

  resize(width, height) {
    for (const projector of this.projectors) {
      if (projector.elem.width !== width)
        projector.elem.width = width
      if (projector.elem.height !== height)
        projector.elem.height = height
    }
  }

  rescale(scales, lastScale, projectorSize, crop, settings) {
    this.crop = crop
    for(const i in scales) {
      this.projectors[i].elem.style.transform = `scale(${scales[i].x}, ${scales[i].y})`
    }

    this.shadow.rescale(lastScale, projectorSize, settings)
  }

  draw(src) {
    const srcX = src.width * this.crop[0]
    const srcY = src.height * this.crop[1]
    const srcWidth = src.width * (1 - this.crop[0] * 2)
    const srcHeight = src.height * (1 - this.crop[1] * 2)
    for(const projector of this.projectors) {
      projector.ctx.drawImage(src, srcX, srcY, srcWidth, srcHeight, 0, 0, projector.elem.width, projector.elem.height)
    }
  }
}