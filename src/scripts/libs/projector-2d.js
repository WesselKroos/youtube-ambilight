import { Canvas, ctxOptions, raf } from './generic'
import ProjectorShadow from './projector-shadow'

export default class Projector2d {
  type = 'Projector2d'
  width = 1
  height = 1
  lostCount = 0

  constructor(ambientlight, containerElem, initProjectorListeners, settings) {
    this.ambientlight = ambientlight
    this.containerElem = containerElem
    this.initProjectorListeners = initProjectorListeners
    this.settings = settings

    this.shadow = new ProjectorShadow(false)
    this.shadow.elem.classList.add('ambientlight__shadow')
    this.containerElem.appendChild(this.shadow.elem)
    
    this.boundaryElem = this.shadow.elem
  }

  remove() {
    this.containerElem.remove(this.projectorListElem)
  }

  onProjectorCtxLost = () => {
    console.warn('Lost 2d projector')
    this.lostCount++
    // event.preventDefault(); // Prevents restoration
    this.settings.setWarning('Failed to restore the renderer from a GPU crash.\nReload the page to try it again.\nOr the memory on your GPU is in use by another process.\nYou can additionallyt undo the last changed setting or reset all the settings to the default values.')
  }

  onProjectorCtxRestored = (event) => {
    if(this.lostCount  >= 3 * this.projectors.length) {
      console.error('Projector2D context restore failed 3 times')
                                
      this.settings.setWarning('Failed to restore 3 times the renderer from a GPU crash.\nReload the page to try it again.\nOr the memory on your GPU is in use by another process.\nYou can additionallyt undo the last changed setting or reset all the settings to the default values.')
      return
    }

    console.warn('Restored 2d projector')
    const projectorElem = event.currentTarget
    projectorElem.width = 1 // Reset size
    this.ambientlight.buffersCleared = true // Trigger resize before redraw
    this.ambientlight.sizesChanged = true // Trigger resize before redraw
    // The bardetection worker offscreencanvas does not trigger contextrestored events
    this.ambientlight.barDetection.clear()

    if(this.scheduledRedrawAfterRestoreId)
      cancelAnimationFrame(this.scheduledRedrawAfterRestoreId)


    this.scheduledRedrawAfterRestoreId = raf(async () => {
      this.scheduledRedrawAfterRestoreId = undefined
      await this.ambientlight.optionalFrame()
      this.initProjectorListeners()
      this.settings.setWarning('')
    })
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
      const projectorElem = new Canvas(this.width, this.height)
      projectorElem.classList.add('ambientlight__projector')
      projectorElem.addEventListener('contextlost', this.onProjectorCtxLost)
      projectorElem.addEventListener('contextrestored', this.onProjectorCtxRestored)

      const projectorCtx = projectorElem.getContext('2d', ctxOptions)
      this.containerElem.prepend(projectorElem)

      this.projectors.push({
        elem: projectorElem,
        ctx: projectorCtx
      })
    }
  }

  resize(width, height) {
    this.width = width
    this.height = height

    for (const projector of this.projectors) {
      if (projector.elem.width !== width)
        projector.elem.width = width
      if (projector.elem.height !== height)
        projector.elem.height = height
    }
  }

  rescale(scales, lastScale, projectorSize, crop, settings) {
    this.crop = crop
    for(let i = 0; i < scales.length; i++) {
      this.projectors[i].elem.style.transform = `scale(${scales[i].x}, ${scales[i].y})`
    }

    this.shadow.rescale(lastScale, projectorSize, settings)
  }

  draw(src) {
    const srcWidth = src.videoWidth || src.width
    const srcHeight = src.videoHeight || src.height

    const croppedSrcX = srcWidth * this.crop[0]
    const croppedSrcY = srcHeight * this.crop[1]
    const croppedSrcWidth = srcWidth * (1 - this.crop[0] * 2)
    const croppedSrcHeight = srcHeight * (1 - this.crop[1] * 2)
    
    for(const projector of this.projectors) {
      projector.ctx.drawImage(src, croppedSrcX, croppedSrcY, croppedSrcWidth, croppedSrcHeight, 0, 0, projector.elem.width, projector.elem.height)
    }
  }

  clearRect() {
    for(const projector of this.projectors) {
      projector.ctx.clearRect(0, 0, projector.elem.width, projector.elem.height)
    }
  }
}