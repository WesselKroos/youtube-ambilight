import { Canvas, ctxOptions } from './generic'

export default class Projector2d {
  constructor(containerElem) {
    this.containerElem = containerElem

    this.projectorListElem = document.createElement('div')
    this.projectorListElem.classList.add('ambilight__projector-list')
    this.containerElem.prepend(this.projectorListElem)
  }

  remove() {
    this.containerElem.remove(this.projectorListElem)
  }

  recreate(levels) {
    this.levels = levels
    if (!this.projectors) {
      this.projectors = []
    }

    this.projectors = this.projectors.filter((projector, i) => {
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
      this.projectorListElem.prepend(projectorElem)

      this.projectors.push({
        elem: projectorElem,
        ctx: projectorCtx
      })
    }
  }

  resize(width, height) {
    for (const projector of this.projectors) {
      if (projector.elem.width !== width)
        projector.elem.width = width
      if (projector.elem.height !== height)
        projector.elem.height = height
    }
  }

  rescale(scales) {
    for(const i in scales) {
      this.projectors[i].elem.style.transform = `scale(${scales[i].x}, ${scales[i].y})`
    }
  }

  draw(src, srcRect) {
    for(const projector of this.projectors) {
      projector.ctx.drawImage(src, 0, 0)
    }
  }
}