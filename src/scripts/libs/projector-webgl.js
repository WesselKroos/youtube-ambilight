import SentryReporter, { AmbientlightError } from './sentry-reporter'
import { ctxOptions, appendErrorStack, SafeOffscreenCanvas, wrapErrorHandler } from './generic'
import { contentScript } from './messaging'
import ProjectorShadow from './projector-shadow'

export default class ProjectorWebGL {
  type = 'ProjectorWebGL'
  lostCount = 0
  scales = [{ x: 1, y: 1 }]
  projectors = []
  static subProjectorDimensionMax = 3
  atTop = true

  constructor(ambientlight, containerElem, initProjectorListeners, settings) {
    return (async function ProjectorWebGLConstructor() {
      this.ambientlight = ambientlight
      this.atTop = ambientlight.atTop
      this.containerElem = containerElem
      this.initProjectorListeners = initProjectorListeners
      this.settings = settings
      this.setWarning = settings.setWarning

      this.initShadow()
      this.initBlurCtx()
      const initialized = await this.initCtx()
      if(!initialized) this.setWebGLWarning('create')
      this.handlePageVisibility()

      return this
    }.bind(this))()
  }

  invalidateShaderCache() {
    this.viewport = undefined
    this.stencil = undefined
    this.fVibrance = undefined
    this.fScale = undefined
    this.fScaleStep = undefined
    this.fScalesLength = undefined
    this.fCrop = undefined
    this.fTextureMipmapLevel = undefined
    this.fTextureOpacity = undefined
    this.drawTextureSize = {
      width: 0,
      height: 0
    }
  }

  handlePageVisibility = async (isPageHidden) => {
    if(this.handlePageVisibilityTimeout) {
      clearTimeout(this.handlePageVisibilityTimeout)
      this.handlePageVisibilityTimeout = undefined
    }
    if(isPageHidden === undefined) {
      isPageHidden = document.visibilityState === 'hidden'
    }
    this.isPageHidden = isPageHidden

    if(!this.ctx) return

    if(!this.ctxLose) {
      this.ctxLose = this.ctx.getExtension('WEBGL_lose_context')
    }

    const ctxLost = this.ctx.isContextLost()
    if(this.isPageHidden && !ctxLost) {
      this.handlePageVisibilityTimeout = setTimeout(() => {
        this.handlePageVisibilityTimeout = undefined

        if(this.isPageHidden && this.ctx && !this.ctx.isContextLost()) {
          this.isControlledLose = true

          // const lintExt = this.ctx.getExtension('GMAN_debug_helper');
          // if(lintExt) lintExt.disable() // weblg-lint throws incorrect errors after the WebGL context has been lost once

          this.ctxLose.loseContext()
        }
      }, 3000)
    } else if(!this.isPageHidden && this.lost && ctxLost && this.isControlledLose) {
      this.ctxLose.restoreContext()
    } else if(this.shouldUpdateCropAfterPageVisible) {
      this.shouldUpdateCropAfterPageVisible = false
      this.updateCrop()
      await this.ambientlight.optionalFrame()
    }
  }

  handleWindowResize = async () => {
    if(this.isPageHidden) {
      this.shouldUpdateCropAfterPageVisible = true
      return
    }

    this.updateCrop()
    await this.ambientlight.optionalFrame()
  }

  handleAtTopChange = async (atTop) => {
    this.atTop = atTop

    if(this.isPageHidden) {
      this.shouldUpdateCropAfterPageVisible = true
      return
    }

    this.updateCrop()
    this.ambientlight.buffersCleared = true
    await this.ambientlight.optionalFrame()
  }

  remove() {
    this.containerElem.remove(this.canvas)
  }

  // TODO: Cut off left, top and right canvas outside the browser + blur size
  resize(width, height) {
    this.width = width
    this.height = height
  }

  initShadow() {
    this.shadow = new ProjectorShadow()
  }

  drawIndex = 0
  drawBorder = 0
  drawTextureSize = {
    width: 0,
    height: 0
  }
  draw = (src) => {
    if(!this.ctx || this.ctxIsInvalid || src.ctx?.ctxIsInvalid || this.lost || !this.viewport) return

    // ctx is being initialized but not ready yet
    if(this.projectorsCount > 1 && this.projectorsCount !== this.fTextureOpacity?.length) return

    if(!this.stencil) this.updateCrop()

    const internalFormat = this.ctx.RGBA;
    const format = this.ctx.RGBA;
    const formatType = this.ctx.UNSIGNED_BYTE;
    const srcWidth = src.videoWidth || src.width
    const srcHeight = src.videoHeight || src.height

    const textureMipmapLevel = Math.max(0, (Math.log(srcHeight / this.height) / Math.log(2)) - 0)
    if(textureMipmapLevel !== this.fTextureMipmapLevel) {
      this.fTextureMipmapLevel = textureMipmapLevel
      this.ctx.uniform1f(this.fTextureMipmapLevelLoc, textureMipmapLevel);
    }

    const subProjectorsDimensionMultiplier = Math.sqrt(this.subProjectorsCount)
    const textureSize = (this.projectorsCount > 1)
    ? {
      width: (srcWidth + this.drawBorder) * subProjectorsDimensionMultiplier,
      height: (srcHeight + this.drawBorder) * subProjectorsDimensionMultiplier
    }
    : {
      width: srcWidth,
      height: srcHeight
    }
    const updateTextureSize = this.drawTextureSize.width !== textureSize.width || this.drawTextureSize.height !== textureSize.height

    let start = this.settings.showResolutions ? performance.now() : undefined
    if(this.projectorsCount > 1) {
      if(updateTextureSize) {
        this.drawInitial = true
        this.drawIndex = 0
      }

      // Set opacities

      const filledOpacities = this.fTextureOpacity.slice((this.projectorsCount - 1) - this.drawIndex)
      const emptyOpacities = this.fTextureOpacity.slice(0, (this.projectorsCount - 1) - this.drawIndex)
      const opacities = [
        ...(this.drawInitial 
          ? filledOpacities.map((o, i) => (i === 0)
            ? emptyOpacities.reduce((s, o) => s + o, o)
            : o
          )
          : filledOpacities
        ),
        ...(this.drawInitial 
          ? emptyOpacities.map(() => 0)
          : emptyOpacities
        )
      ]
      this.ctx.uniform1fv(this.fTextureOpacityLoc, new Float32Array(opacities))

      // Draw texture
      
      const textureIndex = Math.floor(this.drawIndex / this.subProjectorsCount)
      const previousTextureIndex = Math.floor((this.drawIndex - 1) / this.subProjectorsCount)

      this.ctx.activeTexture(this.ctx[`TEXTURE${textureIndex + 1}`])
      const isNewTexture = textureIndex !== previousTextureIndex
      if(isNewTexture && this.drawInitial) {
        this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, internalFormat, textureSize.width, textureSize.height, 0, format, formatType, null)
      }

      const subIndex = this.drawIndex % this.subProjectorsCount
      const xIndex = subIndex % subProjectorsDimensionMultiplier
      const yIndex = Math.floor(subIndex / subProjectorsDimensionMultiplier) % subProjectorsDimensionMultiplier
      const x = (srcWidth + this.drawBorder) * xIndex
      const y = (srcHeight + this.drawBorder) * yIndex
      this.ctx.texSubImage2D(this.ctx.TEXTURE_2D, 0, x, y, format, formatType, src)
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D)

      if(this.drawInitial) {
        const isLastSubTexture = this.drawIndex == this.projectorsCount - 1
        if(isLastSubTexture)
          this.drawInitial = false
      }
    } else {
      if(updateTextureSize) {
        this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, internalFormat, format, formatType, src);
      } else {
        this.ctx.texSubImage2D(this.ctx.TEXTURE_2D, 0, 0, 0, format, formatType, src)
      }
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D)
    }
    if(this.settings.showResolutions) this.loadTime = performance.now() - start
    
    if(this.settings.showResolutions) start = performance.now()
    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4)
    if(this.settings.showResolutions) this.drawTime = performance.now() - start
    
    if(this.settings.showResolutions) start = performance.now()
    this.blurCtx.clearRect(0, 0, this.blurCanvas.width, this.blurCanvas.height)
    if(this.settings.showResolutions) this.blurClearTime = performance.now() - start
    const blurCanvasBound = Math.floor(this.blurBound / this.blurCanvasScale)
    if(this.settings.showResolutions) start = performance.now()
    this.blurCtx.drawImage(this.canvas, blurCanvasBound, blurCanvasBound, this.blurCanvas.width - (blurCanvasBound * 2), this.blurCanvas.height - (blurCanvasBound * 2))
    if(this.settings.showResolutions) this.blurDrawTime = performance.now() - start

    if(updateTextureSize) {
      this.drawTextureSize = textureSize
    }
    this.drawIndex = (this.drawIndex + 1 + Math.round(Math.random() * .5)) % this.projectorsCount
  }

  setWebGLWarning(action = 'restore', reloadTip = true) {
    this.setWarning(`Failed to ${action} the WebGL renderer.${reloadTip ? '\nReload the page to try it again.' : ''}\nAnother possible workaround could be to turn off the "WebGL renderer" setting`)
  }

  onBlurCtxLost = wrapErrorHandler(function wrappedOnBlurCtxLost(event) {
    event.preventDefault();
    this.lost = true
    this.lostCount++
    this.invalidateShaderCache()
    console.log(`Ambient light for YouTube™ | ProjectorWebGL blur context lost (${this.lostCount})`)
    this.setWebGLWarning('restore')
  }.bind(this))

  onBlurCtxRestored = wrapErrorHandler(function wrappedOnBlurCtxRestored() {
    if(this.lostCount >= 3) {
      console.error('Ambient light for YouTube™ | ProjectorWebGL blur context restore failed 3 times')
      this.setWebGLWarning('3 times restore')
      return
    }
    this.initBlurCtx()
    if(this.blurCtx && (!this.blurCtx.isContextLost || !this.blurCtx.isContextLost())) {
      if(!this.ctxIsInvalid) {
        this.initProjectorListeners()
        this.lost = false
        this.setWarning('')
      }
    } else {
      console.warn(`Ambient light for YouTube™ | ProjectorWebGL blur context restore failed (${this.lostCount})`)
      this.setWebGLWarning('restore')
    }
  }.bind(this))

  initBlurCtx() {
    if(this.blurCanvas) {
      this.containerElem.removeChild(this.blurCanvas)
      if(this.blurCtx) {
        this.blurCanvas.removeEventListener('contextlost', this.onBlurCtxLost)
        this.blurCanvas.removeEventListener('contextrestored', this.onBlurCtxRestored)
      }
    }

    this.blurCanvas = document.createElement('canvas')
    this.blurCanvas.classList.add('ambientlight__projector')
    this.containerElem.prepend(this.blurCanvas)
    this.boundaryElem = this.blurCanvas
    this.blurCanvas.addEventListener('contextlost', this.onBlurCtxLost)
    this.blurCanvas.addEventListener('contextrestored', this.onBlurCtxRestored)
    this.blurCtx = this.blurCanvas.getContext('2d', {
      ...ctxOptions,
      alpha: true,
      desynchronized: false // true: Does not work when canvas elements are not hardware accelerated
    })
    if(!this.blurCtx) {
      throw new Error('ProjectorWebGL blur context creation failed')
    }
    this.projectors[0] = {
      elem: this.blurCanvas,
      ctx: this.blurCtx
    }
  }

  async getMajorPerformanceCaveatDetected() {
    try {
      return await contentScript.getStorageEntryOrEntries('majorPerformanceCaveatDetected') || false
    } catch(ex) {
      SentryReporter.captureException(ex)
    }
  }

  async majorPerformanceCaveatDetected() {
    this.majorPerformanceCaveat = true
    const detected = await this.getMajorPerformanceCaveatDetected()
    if(detected) return
    
    const message = 'The browser warned that this is a slow device. If you have a graphics card, make sure to enable hardware acceleration in the browser.\n(The resolution setting has been turned down to 25% for better performance)';
    console.warn(`Ambient light for YouTube™ | ProjectorWebGL ${message}`)
    this.setWarning(message, true)
    this.settings.set('resolution', 25, true)
    await contentScript.setStorageEntry('majorPerformanceCaveatDetected', true)
  }

  async noMajorPerformanceCaveatDetected() {
    this.majorPerformanceCaveat = false
    const detected = await this.getMajorPerformanceCaveatDetected()
    if(detected === false) return

    await contentScript.setStorageEntry('majorPerformanceCaveatDetected', false)
  }

  onCtxLost = wrapErrorHandler(function onCtxLost(event) {
    event.preventDefault();
    if(!this.isControlledLose) {
      console.warn('Ambient light for YouTube™ | ProjectorWebGL context lost')
    }
    this.setWebGLWarning('restore')
    this.program = undefined // Prevent warning: Cannot delete program from old context. in initCtx
    this.invalidateShaderCache()
    this.lost = true
    if(!this.isControlledLose) {
      this.lostCount++
    }
    if(!this.isPageHidden && this.isControlledLose) {
      setTimeout(this.handlePageVisibility, 1)
    }
  }.bind(this))

  onCtxRestored = wrapErrorHandler(async function onCtxRestored() {
    if(!this.isControlledLose && this.lostCount >= 3) {
      console.error('Ambient light for YouTube™ | ProjectorWebGL context restore failed 3 times')
      this.setWebGLWarning('3 times restore')
      return
    }
    try {
      if(!(await this.initCtx())) return
    } catch(ex) {
      this.setWebGLWarning()
      throw ex
    }

    if(!this.isControlledLose) {
      this.initShadow()
      this.initBlurCtx()
    }
    if(
      this.ctx && !this.ctx.isContextLost()
    ) {
      if(!this.ctxIsInvalid) {
        this.initProjectorListeners()
        this.lost = false
        this.setWarning('')
        this.lostCount = 0
      }
    } else {
      if(!this.isControlledLose) {
        console.warn(`Ambient light for YouTube™ | ProjectorWebGL context restore failed (${this.lostCount})`)
        this.setWebGLWarning('restore')
        return
      }
    }
    if(this.handleRestored) {
      this.handleRestored(this.isControlledLose)
    }
    this.isControlledLose = false
  }.bind(this))

  webglcontextcreationerrors = []
  onCtxCreationError = wrapErrorHandler(function onCtxCreationError(e) {
    this.webglcontextcreationerrors.push({
      failIfMajorPerformanceCaveat: this.ctxOptions.failIfMajorPerformanceCaveat,
      message: e.statusMessage || '?',
      time: performance.now(),
      webGLVersion: this.webGLVersion
    })
  }.bind(this))

  async initCtx() {
    if(this.discardProgram) return false
    if(this.awaitingProgramCompletion) {
      this.discardProgram = true
      await this.awaitingProgramCompletion;
      this.discardProgram = undefined
    }
    
    if((this.webGLVersion === 2 || this.webGLVersion === 1) && !this.ctx && this.canvas) {
      this.canvas.removeEventListener('contextlost', this.onCtxLost)
      this.canvas.removeEventListener('contextrestored', this.onCtxRestored)
      this.canvas.removeEventListener('webglcontextcreationerror', this.onCtxCreationError)
      this.canvas = undefined
      this.webGLVersion = undefined
    }

    if(!this.canvas) {
      this.canvas = new SafeOffscreenCanvas(1, 1)
      this.canvas.addEventListener('webglcontextlost', this.onCtxLost, false)
      this.canvas.addEventListener('webglcontextrestored', this.onCtxRestored, false)
      this.canvas.addEventListener('webglcontextcreationerror', this.onCtxCreationError, false)
    }

    if(!this.ctx) {
      this.webglcontextcreationerrors = []

      this.ctxOptions = {
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: false,
        premultipliedAlpha: false,
        alpha: true,
        depth: false,
        antialias: false,
        desynchronized: false,
        stencil: true
      }
      this.webGLVersion = 2
      this.ctx = this.canvas.getContext('webgl2', this.ctxOptions)
      if(this.ctx) {
        this.noMajorPerformanceCaveatDetected()
      } else {
        this.ctxOptions.stencil = false
        this.ctx = this.canvas.getContext('webgl2', this.ctxOptions)
        if(this.ctx) {
          this.noMajorPerformanceCaveatDetected()
        } else {
          this.webGLVersion = 1
          this.ctx = this.canvas.getContext('webgl', this.ctxOptions)
          if(this.ctx) {
            this.noMajorPerformanceCaveatDetected()
          } else {
            this.ctxOptions.failIfMajorPerformanceCaveat = false
            this.ctxOptions.stencil = true
            this.webGLVersion = 2
            this.ctx = this.canvas.getContext('webgl2', this.ctxOptions)
            if(this.ctx) {
              this.majorPerformanceCaveatDetected()
            } else {
              this.ctxOptions.stencil = false
              this.ctx = this.canvas.getContext('webgl2', this.ctxOptions)
              if(this.ctx) {
                this.noMajorPerformanceCaveatDetected()
              } else {
                this.webGLVersion = 1
                this.ctx = this.canvas.getContext('webgl', this.ctxOptions)
                if(this.ctx) {
                  this.majorPerformanceCaveatDetected()
                } else {
                  this.webGLVersion = undefined

                  const errors = this.webglcontextcreationerrors
                  let lastErrorMessage = ''
                  for(const error of errors) {
                    const duplicate = error.message === lastErrorMessage
                    lastErrorMessage = error.message
                    if(duplicate) error.message = '"'
                  }

                  throw new AmbientlightError(`ProjectorWebGL context creation failed: ${lastErrorMessage}`, errors)
                }
              }
            }
          }
        }
      }
    }

    if(!this.ctx || this.ctx.isContextLost()) return

    if ('drawingBufferColorSpace' in this.ctx) {
      this.ctx.drawingBufferColorSpace = ctxOptions.colorSpace
      this.ctx.unpackColorSpace = ctxOptions.colorSpace
    }
    
    this.projectors[1] = {
      elem: this.canvas,
      ctx: this
    }
    
    if(this.ctxOptions.stencil)
      this.ctx.enable(this.ctx.STENCIL_TEST);

    // Program
    const program = this.ctx.createProgram();

    // Textures
    this.ctx.hint(this.ctx.GENERATE_MIPMAP_HINT, this.ctx.NICEST);
    const tfaExt = (
      this.ctx.getExtension('EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    );
    const maxAnisotropy = tfaExt
      ? Math.min(16, this.ctx.getParameter(tfaExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1)
      : 0;

    // Texture - Shadow
    this.shadowTexture = this.ctx.createTexture();
    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.shadowTexture);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    
    // Texture - Projectors
    this.projectorsTexture = []
    const maxTextures = Math.min(this.ctx.getParameter(this.ctx.MAX_TEXTURE_IMAGE_UNITS) || 8, 16) // MAX_TEXTURE_IMAGE_UNITS can be more than 16 in software mode
    const maxProjectorTextures = maxTextures - 1
    ProjectorWebGL.subProjectorDimensionMax = this.webGLVersion === 2 ? 3 : 2; // WebGL1 does not allow non-power-of-two textures
    this.subProjectorsCount = 1
    for(let i = 1; i < ProjectorWebGL.subProjectorDimensionMax && this.settings.frameFading + 1 > maxProjectorTextures * Math.pow(i, 2); i++) {
      this.subProjectorsCount = Math.pow(i + 1, 2);
    }
    this.projectorsCount = Math.min(this.settings.frameFading + 1, maxProjectorTextures * this.subProjectorsCount)
    const projectorsTextureCount = Math.ceil(this.projectorsCount / this.subProjectorsCount)
    for(let i = 0; i < projectorsTextureCount; i++) {
      this.projectorsTexture[i] = this.ctx.createTexture();
      this.ctx.activeTexture(this.ctx[`TEXTURE${i + 1}`]);
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.projectorsTexture[i]);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR_MIPMAP_LINEAR);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
      if(this.webGLVersion !== 1) {
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAX_LEVEL, 16);
      }
      if(maxAnisotropy) {
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, tfaExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
      }
      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D)
    }

    // Shaders
    const vertexShaderSrc = `
      precision lowp float;

      attribute vec2 vPosition;

      attribute vec2 vUV;
      varying vec2 fUV;
      
      void main(void) {
        fUV = vUV;
        gl_Position = vec4(vPosition, 0, 1);
      }
    `;
    const vertexShader = this.ctx.createShader(this.ctx.VERTEX_SHADER);
    this.ctx.shaderSource(vertexShader, vertexShaderSrc);
    this.ctx.compileShader(vertexShader);
    this.ctx.attachShader(program, vertexShader);
    
    const fragmentShaderSrc = `
      precision lowp float;
      varying vec2 fUV;
      uniform sampler2D textureSampler[${this.projectorsTexture.length}];
      uniform float fTextureMipmapLevel;
      ${this.projectorsCount > 1 ? `uniform float fTextureOpacity[${this.projectorsCount}];` : ''}
      ${this.ctxOptions.stencil ? 'uniform float fDrawingStencil;' : ''}
      uniform vec2 fCropOffsetUV;
      uniform vec2 fCropScaleUV;
      uniform sampler2D shadowSampler;
      uniform vec2 fScale;
      uniform vec2 fScaleStep;
      ${this.settings.vibrance !== 100 ? 'uniform float fVibrance;': ''}

      vec4 multiTexture() {
        vec2 direction = ceil(fUV * 2.) - 1.;
        vec2 iUV = ((direction - fUV) * fScale) / ((direction - .5) * fScaleStep);
        int impreciseI = int(min(iUV[0], iUV[1]));
        for (int preciseI = 0; preciseI < 200; preciseI++) {
          if (preciseI < impreciseI) continue;
          int i = ${(this.webGLVersion === 1) ? 'impreciseI' : 'preciseI'};
          vec2 scaledUV = (fUV - .5) * (fScale / (fScale - fScaleStep * vec2(i)));
          vec2 croppedUV = fCropOffsetUV + (scaledUV / fCropScaleUV);
          
          ${(() => {
            if(this.projectorsCount > 1) {
              const subProjectorsDimensionMultiplier = Math.sqrt(this.subProjectorsCount)
              const croppedUvScale = (1 / subProjectorsDimensionMultiplier).toString().padEnd(2, '.')

              return `${
                new Array(this.subProjectorsCount).fill(undefined).map((_, i) => {
                  if(i === 0) 
                    return `vec2 uv0 = ${
                      croppedUvScale !== '1.' 
                        ? `(croppedUV * ${croppedUvScale})` 
                        : 'croppedUV'
                    };`;

                  const xIndex = i % subProjectorsDimensionMultiplier
                  const yIndex = Math.floor(i / subProjectorsDimensionMultiplier) % subProjectorsDimensionMultiplier
                  const offsetUVx = ((1 / subProjectorsDimensionMultiplier) * xIndex).toString().padEnd(2, '.');
                  const offsetUVy = ((1 / subProjectorsDimensionMultiplier) * yIndex).toString().padEnd(2, '.');

                  // Todo: Ommit the drawBorder by calculating the rescale caused by: .5 - drawBorder
                  return `vec2 uv${i} = uv0${
                    (offsetUVx !== '0.' || offsetUVy !== '0.') 
                      ? ` + vec2(${offsetUVx},${offsetUVy})` 
                      : ''
                  };`
                }).join('\n')
              }`
            } else {
              return ``
            }
          })()}

          return ${(() => {
            if(this.projectorsCount > 1) {
              return `${
                new Array(this.projectorsCount).fill(undefined).map((_, i) => {
                  const projectorIndex = Math.floor(i / this.subProjectorsCount)
                  const subIndex = i % this.subProjectorsCount

                  // Todo: Ommit the drawBorder by calculating the rescale caused by: .5 - drawBorder
                  return `(fTextureOpacity[${i}] * texture2D(textureSampler[${projectorIndex}], uv${subIndex}, fTextureMipmapLevel))`
                }).join('\n+ ')
              };`
            } else {
              return `texture2D(textureSampler[0], croppedUV, fTextureMipmapLevel);`
            }
          })()}
        }
        return vec4(0.0, 0.0, 0.0, 1.0);
      }
      
      ${this.settings.vibrance !== 100 ? `
        vec3 rgb2hsv(vec3 c)
        {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c)
        {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        float saturate(float c, float v) {
          float x = c;
          if(v < 0.) {
            x = 1. - c;
          }

          float a = 1. + 5. * (1. - abs(v));
          float y = a * a - x * ( (a * a - 1.) / (a * a) ) - (a - x / a) * (a - x / a);
          float d = y - x;
          y = min(1., x + d * 5.);

          if(v >= 0.) {
            return y;
          } else {
            return 1. - y;
          }
        }
      ` :''}

      void main(void) {
    ${this.ctxOptions.stencil ? `
        if(fDrawingStencil < 0.5) {`
    : ''}
          vec3 ambientlight = multiTexture().rgb;
          float shadowAlpha = texture2D(shadowSampler, fUV).a;
          ${this.settings.vibrance !== 100 ? `
            if(fVibrance != 0.) {
              vec3 ambientlightHSV = rgb2hsv(ambientlight);
              ambientlightHSV[1] = saturate(ambientlightHSV[1], fVibrance);
              ambientlight = hsv2rgb(ambientlightHSV);
            }
          ` : ''}
          gl_FragColor = vec4(ambientlight, 1. - shadowAlpha);
    ${this.ctxOptions.stencil ? `
        } else {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
    ` : ''}
      }
    `;
    const fragmentShader = this.ctx.createShader(this.ctx.FRAGMENT_SHADER);
    this.ctx.shaderSource(fragmentShader, fragmentShaderSrc);
    this.ctx.compileShader(fragmentShader);
    this.ctx.attachShader(program, fragmentShader);
    
    // Program
    this.ctx.linkProgram(program);

    const parallelShaderCompileExt = this.ctx.getExtension('KHR_parallel_shader_compile');
    if(parallelShaderCompileExt?.COMPLETION_STATUS_KHR) {
      const stack = new Error().stack
      this.awaitingProgramCompletion = new Promise((resolve, reject) => {
        const checkCompletion = () => {
          try {
            if(!program) {
              return resolve(false) // cancel
            }

            const completed = this.ctx.getProgramParameter(program, parallelShaderCompileExt.COMPLETION_STATUS_KHR);
            if(completed === false) {
              requestIdleCallback(() => requestAnimationFrame(checkCompletion), { timeout: 200 })
            } else {
              resolve(true) // COMPLETION_STATUS_KHR can be null because of webgl-lint
            }
          } catch(ex) {
            ex.details = {}

            try {
              ex.details = {
                program: program?.toString(),
                webGLVersion: this.webGLVersion,
                majorPerformanceCaveat: this.majorPerformanceCaveat,
                ctxOptions: this.ctxOptions
              }
            } catch(ex) {
              ex.details = {
                detailsException: ex
              }
            }

            // // Did not give any insights that could help to fix bugs
            // try {
            //   const debugRendererInfo = this.ctx.getExtension('WEBGL_debug_renderer_info')
            //   ex.details.gpuVendor = debugRendererInfo?.UNMASKED_VENDOR_WEBGL
            //     ? this.ctx.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
            //     : 'unknown'
            //   ex.details.gpuRenderer = debugRendererInfo?.UNMASKED_RENDERER_WEBGL
            //     ? this.ctx.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
            //     : 'unknown'
            // } catch(ex) {
            //   ex.details.gpuError = ex
            // }

            appendErrorStack(stack, ex)
            reject(ex)
          }
        };
        requestAnimationFrame(checkCompletion)
      })
      const completed = await this.awaitingProgramCompletion;
      this.awaitingProgramCompletion = undefined

      if(this.discardProgram || !completed) {
        try {
          this.ctx.deleteProgram(program) // Free GPU memory
        } catch(ex) {
          console.warn('Failed to delete new program', ex)
        }

        if(this.program) {
          try {
            this.ctx.finish() // Wait for any pending draw calls to finish
            this.ctx.deleteProgram(this.program) // Free GPU memory
          } catch(ex) {
            console.warn('Failed to delete previous program', ex)
          }
          this.program = undefined
          this.invalidateShaderCache()
        }

        return false
      }
    }

    // Validate these parameters after program compilation to prevent render blocking validation
    const vertexShaderCompiled = this.ctx.getShaderParameter(vertexShader, this.ctx.COMPILE_STATUS)
    const fragmentShaderCompiled = this.ctx.getShaderParameter(fragmentShader, this.ctx.COMPILE_STATUS)
    const programLinked = this.ctx.getProgramParameter(program, this.ctx.LINK_STATUS)
    if(!vertexShaderCompiled || !fragmentShaderCompiled || !programLinked) {
      const programCompilationError = new Error('Program compilation failed')
      programCompilationError.name = 'WebGLError'
      programCompilationError.details = {
        webGLVersion: this.webGLVersion,
        ctxOptions: this.ctxOptions
      }

      try {
        programCompilationError.details = {
          ...programCompilationError.details,
          vertexShaderCompiled,
          vertexShaderInfoLog: this.ctx.getShaderInfoLog(vertexShader),
          fragmentShaderCompiled,
          fragmentShaderInfoLog: this.ctx.getShaderInfoLog(fragmentShader),
          programLinked,
          programInfoLog: this.ctx.getProgramInfoLog(program)
        }
      } catch(ex) {
        programCompilationError.details.getCompiledAndLinkedInfoLogsError = ex
      }

      try {
        this.ctx.validateProgram(program)
        programCompilationError.details.programValidated = this.ctx.getProgramParameter(program, this.ctx.VALIDATE_STATUS)
        programCompilationError.details.programValidationInfoLog = this.ctx.getProgramInfoLog(program)
      } catch(ex) {
        programCompilationError.details.validateProgramError = ex
      }

      try {
        const ext = this.ctx.getExtension('WEBGL_debug_shaders');
        if(ext) {
          programCompilationError.details.Ωsources = {
            vertexShader: ext.getTranslatedShaderSource(vertexShader),
            fragmentShader: ext.getTranslatedShaderSource(fragmentShader)
          }
        }
      } catch(ex) {
        programCompilationError.details.debugShadersError = ex
      }

      // try {
      //   const debugRendererInfo = this.ctx.getExtension('WEBGL_debug_renderer_info')
      //   programCompilationError.details.gpuVendor = debugRendererInfo?.UNMASKED_VENDOR_WEBGL
      //     ? this.ctx.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
      //     : 'unknown'
      //   programCompilationError.details.gpuRenderer = debugRendererInfo?.UNMASKED_RENDERER_WEBGL
      //     ? this.ctx.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
      //     : 'unknown'
      // } catch(ex) {
      //   programCompilationError.details.gpuError = ex
      // }

      if(
        programCompilationError.details.vertexShaderInfoLog ||
        programCompilationError.details.fragmentShaderInfoLog ||
        programCompilationError.details.getCompiledAndLinkedInfoLogsError ||
        programCompilationError.details.programValidationInfoLog ||
        programCompilationError.details.validateProgramError ||
        programCompilationError.details.Ωsources?.vertexShader ||
        programCompilationError.details.Ωsources?.fragmentShader ||
        programCompilationError.details.debugShadersError
      ) {
        programCompilationError.name = 'WebGLErrorWithInfoLog'
      }

      throw programCompilationError
    }

    //// Probably can be removed because we already check if the program is linked and both shaders have been compiled. There is also no use that reported this error in the last 2 weeks
    // this.ctx.validateProgram(this.program)
    // const programValidated = this.ctx.getProgramParameter(this.program, this.ctx.VALIDATE_STATUS)
    // if(!programValidated) {
    //   const programValidationError = new Error('Program validation failed')
    //   programValidationError.details = {}

    //   try {
    //     programValidationError.details = {
    //       vertexShaderInfoLog: this.ctx.getShaderInfoLog(vertexShader),
    //       fragmentShaderInfoLog: this.ctx.getShaderInfoLog(fragmentShader),
    //       programInfoLog: this.ctx.getProgramInfoLog(this.program)
    //     }
    //   } catch(ex) {
    //     programValidationError.details.getCompiledAndLinkedInfoLogsError = ex
    //   }

    //   try {
    //     const ext = this.ctx.getExtension('WEBGL_debug_shaders');
    //     if(ext) {
    //       programValidationError.details.Ωsources = {
    //         vertexShader: ext.getTranslatedShaderSource(vertexShader),
    //         fragmentShader: ext.getTranslatedShaderSource(fragmentShader)
    //       }
    //     }
    //   } catch(ex) {
    //     programValidationError.details.debugShadersError = ex
    //   }

    //   throw programValidationError
    // }

    // Delete previous program
    if(this.program) {
      try {
        this.ctx.finish() // Wait for any pending draw calls to finish
        this.ctx.deleteProgram(this.program) // Free GPU memory
      } catch(ex) {
        console.warn('Failed to delete previous program', ex)
      }
      this.program = undefined
      this.invalidateShaderCache()
    }
    
    this.ctx.useProgram(program)
    this.program = program

    // Buffers
    const vUVBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vUVBuffer);
    const vUV = [
      0, 0, 
      0, 1, 
      1, 1, 
      1, 0,
    ];
    // vUVBuffer must at least be filled to stencilPoints.length (48) for Firefox. In updateCrop() -> drawArrays(..., ..., stencilPoints.length)
    const vUVFilled = vUV.concat(Array(48 - vUV.length).fill(0));
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(vUVFilled), this.ctx.STATIC_DRAW);
    const vUVLoc = this.ctx.getAttribLocation(this.program, 'vUV');
    this.ctx.vertexAttribPointer(vUVLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vUVLoc);

    this.vPositionBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vPositionBuffer);
    this.vPosition = [
      -1,  1, 
      -1, -1, 
       1, -1, 
       1,  1
    ];
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(this.vPosition), this.ctx.STATIC_DRAW);
    this.vPositionLoc = this.ctx.getAttribLocation(this.program, 'vPosition'); 
    this.ctx.vertexAttribPointer(this.vPositionLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(this.vPositionLoc);

    const shadowSamplerLoc = this.ctx.getUniformLocation(this.program, 'shadowSampler');
    this.ctx.uniform1i(shadowSamplerLoc, 0);

    const textureSamplerLoc = this.ctx.getUniformLocation(this.program, 'textureSampler');
    this.ctx.uniform1iv(textureSamplerLoc, this.projectorsTexture.map((_, i) => 1 + i));
    
    if(this.ctxOptions.stencil) {
      this.fDrawingStencilLoc = this.ctx.getUniformLocation(this.program, 'fDrawingStencil');
      this.ctx.uniform1f(this.fDrawingStencilLoc, 0);
    }

    this.fTextureMipmapLevelLoc = this.ctx.getUniformLocation(this.program, 'fTextureMipmapLevel');
    this.ctx.uniform1f(this.fTextureMipmapLevelLoc, 0);

    if(this.settings.vibrance !== 100) {
      this.fVibranceLoc = this.ctx.getUniformLocation(this.program, 'fVibrance');
      this.ctx.uniform1f(this.fVibranceLoc, 0);
    }

    this.fScaleLoc = this.ctx.getUniformLocation(this.program, 'fScale');
    this.ctx.uniform2fv(this.fScaleLoc, new Float32Array([1, 1]));

    this.fScaleStepLoc = this.ctx.getUniformLocation(this.program, 'fScaleStep');
    this.ctx.uniform2fv(this.fScaleStepLoc, new Float32Array([1, 1]));

    this.fCropOffsetUVLoc = this.ctx.getUniformLocation(this.program, 'fCropOffsetUV');
    this.ctx.uniform2fv(this.fCropOffsetUVLoc, new Float32Array([0, 0]));

    this.fCropScaleUVLoc = this.ctx.getUniformLocation(this.program, 'fCropScaleUV');
    this.ctx.uniform2fv(this.fCropScaleUVLoc, new Float32Array([0, 0]));

    if(this.projectorsCount > 1) {
      this.fTextureOpacityLoc = this.ctx.getUniformLocation(this.program, 'fTextureOpacity');
      this.ctx.uniform1fv(this.fTextureOpacityLoc, new Float32Array(Array(this.projectorsCount).fill(0)));
    }

    this.invalidateShaderCache()

    this.updateCtx()
    return true
  }

  rescale(scales, lastScale, projectorSize, crop, settings) {
    if(this.shadow) {
      this.shadow.rescale(lastScale, projectorSize, settings)
    }

    this.scaleStep = {
      x: scales[2]?.x - scales[1]?.x,
      y: scales[2]?.y - scales[1]?.y,
    }
    this.scale = lastScale
    this.scalesLength = scales.length
    this.crop = crop

    const width = Math.floor(projectorSize.w * this.scale.x)
    const height = Math.floor(projectorSize.h * this.scale.y)
    if(this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }

    this.blurCanvasScale = settings.blur > 1 ? 2 : 1
    const blurPx = settings.blur * (this.height / 512) * 1.275
    const blurRadius = 2.64
    this.blurBound = Math.max(1, Math.ceil(blurPx * blurRadius))
    if(this.blurCanvas) {
      const blurCanvasWidth = width + this.blurBound * 2
      const blurCanvasHeight = height + this.blurBound * 2
      // Scale down when blur > 1 for a free performance boost on Firefox
      this.blurCanvas.width = Math.floor(blurCanvasWidth / this.blurCanvasScale)
      this.blurCanvas.height = Math.floor(blurCanvasHeight / this.blurCanvasScale)
      this.blurCanvas.style.transform = `scale(${this.scale.x + ((this.blurBound * 2) / projectorSize.w)}, ${this.scale.y + ((this.blurBound * 2) / projectorSize.h)})`
    }
    if(this.blurCtx) {
      this.blurCtx.filter = `blur(${blurPx / this.blurCanvasScale}px)`
    }
    
    this.updateCtx()
  }

  async updateVibrance() {
    const hadVibranceFilter = this.fVibrance !== undefined
    const hasVibranceFilter = this.settings.vibrance !== 100
    if(hasVibranceFilter === hadVibranceFilter) return true
    
    return await this.initCtx()
  }

  updateCtx() {
    if(!this.ctx || this.ctxIsInvalid || this.lost) return

    if(this.settings.vibrance !== 100) {
      let vibrance = (this.settings.vibrance / 100) - 1
      vibrance = (vibrance < 0 ? -1 : 1) * (1 - Math.pow(1 - Math.abs(vibrance), 3))
      const fVibranceChanged = this.fVibrance !== vibrance
      if(fVibranceChanged) {
        this.fVibrance = vibrance
        this.ctx.uniform1f(this.fVibranceLoc, this.fVibrance);
      }
    }

    const fScaleChanged = this.fScale?.x !== this.scale?.x || this.fScale?.y !== this.scale?.y
    if(fScaleChanged) {
      this.fScale = this.scale
      this.ctx.uniform2fv(this.fScaleLoc, new Float32Array([this.fScale?.x, this.fScale?.y]));
    }

    const fScaleStepChanged = this.fScaleStep?.x !== this.scaleStep?.x || this.fScaleStep?.y !== this.scaleStep?.y
    if(fScaleStepChanged) {
      this.fScaleStep = this.scaleStep
      this.ctx.uniform2fv(this.fScaleStepLoc, new Float32Array([this.fScaleStep?.x, this.fScaleStep?.y]));
    }

    const crop = this.crop || [0, 0]
    const fCropChanged = crop.some((crop, i) => crop !== (this.fCrop || [undefined, undefined])[i])
    if(fCropChanged) {
      this.fCrop = crop
      const fCropScaleUV = crop.map(crop => 1 / (1 - crop * 2))
      const fCropOffsetUV = fCropScaleUV.map((cropScale, i) => crop[i] + (1 / (cropScale * 2)))
      this.ctx.uniform2fv(this.fCropOffsetUVLoc, new Float32Array(fCropOffsetUV))
      this.ctx.uniform2fv(this.fCropScaleUVLoc, new Float32Array(fCropScaleUV))
    }

    if(this.projectorsCount > 1) {
      const fTextureOpacityChanged = this.projectorsCount > 1 && !(this.fTextureOpacity?.length === this.projectorsCount)
      if(fTextureOpacityChanged) {
        const easing = (x) => x * x;
        this.fTextureOpacity = new Array(this.projectorsCount).fill(undefined)
          .map((_, i) => easing((i + 1) / this.projectorsCount))
          .map((e, i, list) => !i
            ? e
            : e - list[i - 1]
          )
      }
    }

    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.ALPHA, this.ctx.ALPHA, this.ctx.UNSIGNED_BYTE, this.shadow.elem);
    this.ctx.activeTexture(this.ctx.TEXTURE1);
    
    if (!this.viewport || this.viewport.width !== this.ctx.drawingBufferWidth || this.viewport.height !== this.ctx.drawingBufferHeight) {
      this.viewport = { width: this.ctx.drawingBufferWidth, height: this.ctx.drawingBufferHeight };
      this.ctx.viewport(0, 0, this.ctx.drawingBufferWidth, this.ctx.drawingBufferHeight);
    }

    this.updateCrop()
  }

  updateCrop() {
    if(!this.ctxOptions.stencil || !this.ctx || this.ctxIsInvalid || this.lost || !this.blurCanvas || !this.ambientlight?.videoContainerElem) return

    const canvasRect = this.blurCanvas.getBoundingClientRect()
    if(!canvasRect?.width || !canvasRect?.height) return

    const videoBoundingElem = this.ambientlight.shouldStyleVideoParentElem
      ? this.ambientlight.videoContainerElem
      : this.ambientlight.videoElem
    if(!videoBoundingElem) return

    let videoRect = videoBoundingElem.getBoundingClientRect()
    if(!videoRect?.width || !videoRect?.height) return

    const windowRect = {
      left: 0,
      top: -window.scrollY,
      right: window.innerWidth,
      bottom: window.innerHeight
    }

    const blurScaleRadiusExtra = 1 // 1.25 // Todo: The blurRadius is appearently incorrect?
    const blurScale = (canvasRect.height / this.blurCanvas.height) * blurScaleRadiusExtra
    const blurSize = this.blurBound * blurScale;

    windowRect.left -= blurSize
    windowRect.top -= blurSize
    windowRect.right += blurSize
    windowRect.bottom += blurSize

    videoRect = {
      left: videoRect.left + blurSize,
      top: videoRect.top + blurSize,
      right: videoRect.right - blurSize,
      bottom: videoRect.bottom - blurSize
    }

    const cropRect = {
      left: Math.max(canvasRect.left, windowRect.left),
      top: Math.max(canvasRect.top, windowRect.top),
      right: Math.min(canvasRect.right, windowRect.right),
      bottom: Math.min(canvasRect.bottom, windowRect.bottom + 100) // 100 = a single scroll step
    };

    const canvasRectCenter = {
      x: canvasRect.left + (canvasRect.width / 2),
      y: canvasRect.top + (canvasRect.height / 2)
    };

    const cropPerc = {
      left: (canvasRectCenter.x - cropRect.left) / (canvasRectCenter.x - canvasRect.left),
      top: (canvasRectCenter.y - cropRect.top) / (canvasRectCenter.y - canvasRect.top),
      right: (cropRect.right - canvasRectCenter.x) / (canvasRect.right - canvasRectCenter.x),
      bottom: this.atTop
        ? (cropRect.bottom - canvasRectCenter.y) / (canvasRect.bottom - canvasRectCenter.y)
        : 1
    }
    
    const crop = {
      t: Math.max(0, cropPerc.top), 
      r: Math.max(0, cropPerc.right), 
      b: -Math.max(0, cropPerc.bottom), 
      l: -Math.max(0, cropPerc.left)
    }

    const cutPerc = {
      left: (canvasRectCenter.x - videoRect.left) / (canvasRectCenter.x - canvasRect.left),
      top: (canvasRectCenter.y - videoRect.top) / (canvasRectCenter.y - canvasRect.top),
      right: (videoRect.right - canvasRectCenter.x) / (canvasRect.right - canvasRectCenter.x),
      bottom: (videoRect.bottom - canvasRectCenter.y) / (canvasRect.bottom - canvasRectCenter.y)
    }
    const vcut = {
      t: Math.min(Math.max(0, cutPerc.top), crop.t), 
      r: Math.min(Math.max(0, cutPerc.right), crop.r), 
      b: -Math.min(Math.max(0, cutPerc.bottom), -crop.b),  
      l: -Math.min(Math.max(0, cutPerc.left), -crop.l)
    }
    
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT);
    
    // Turn on stencil drawing
    this.ctx.stencilOp(this.ctx.KEEP, this.ctx.KEEP, this.ctx.REPLACE);

    this.ctx.stencilFunc(this.ctx.ALWAYS, 1, 0xff);
    this.ctx.stencilMask(0xff);
    this.ctx.colorMask(false, false, false, false);

    this.ctx.uniform1f(this.fDrawingStencilLoc, 1);

    // Set buffers to crop to mask
    // [p1x, p1y, p2x, p2y, p3x, p3y] = triangle points
    const stencilPoints = [
      // // Old points for TRIANGLE_FAN
      // crop.l, crop.t,  crop.l, crop.b,  crop.r, crop.b, 
      // crop.l, crop.t,  crop.r, crop.t,  crop.r, crop.b, 

      // Top
      crop.l, crop.t,  crop.r, crop.t,  vcut.r, vcut.t, 
      crop.l, crop.t,  vcut.r, vcut.t,  vcut.l, vcut.t, 

      // Right
      crop.r, crop.t,  crop.r, crop.b,  vcut.r, vcut.t, 
      crop.r, crop.b,  vcut.r, vcut.b,  vcut.r, vcut.t, 

      // Bottom
      crop.l, crop.b,  crop.r, crop.b,  vcut.r, vcut.b, 
      crop.l, crop.b,  vcut.r, vcut.b,  vcut.l, vcut.b, 

      // Left
      crop.l, crop.t,  crop.l, crop.b,  vcut.l, vcut.t, 
      crop.l, crop.b,  vcut.l, vcut.b,  vcut.l, vcut.t, 
    ];
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(stencilPoints), this.ctx.STATIC_DRAW);

    // Draw stencil mask
    this.ctx.clear(this.ctx.STENCIL_BUFFER_BIT);
    this.ctx.drawArrays(this.ctx.TRIANGLES, 0, stencilPoints.length / 2);

    // Restore position to full viewport
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(this.vPosition), this.ctx.STATIC_DRAW);

    // Turn off stencil drawing
    this.ctx.uniform1f(this.fDrawingStencilLoc, 0);

    this.ctx.stencilFunc(this.ctx.EQUAL, 1, 0xff);
    this.ctx.stencilMask(0x00);
    this.ctx.colorMask(true, true, true, true);

    this.stencil = true
  }

  clearRect() {
    if(!this.ctx || this.ctxIsInvalid || this.lost) return
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT); // Or set preserveDrawingBuffer to false te always draw from a clear canvas
    this.invalidateShaderCache()
  }

  get ctxIsInvalid() {
    const invalid = (!this.ctx || this.ctx.isContextLost() || !this.program || this.awaitingProgramCompletion || !this.blurCtx || (this.blurCtx.isContextLost && this.blurCtx.isContextLost()))
    if (invalid && !this.isControlledLose && !this.ctxIsInvalidWarned && !this.program && !this.awaitingProgramCompletion) {
      this.ctxIsInvalidWarned = true
      console.warn(`Ambient light for YouTube™ | ProjectorWebGL context is invalid: ${this.ctx ? 'Lost' : 'Is null'}`)
    }
    return invalid;
  }
}