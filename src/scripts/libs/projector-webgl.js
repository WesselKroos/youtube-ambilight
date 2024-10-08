import SentryReporter, { AmbientlightError } from './sentry-reporter';
import {
  canvasWebGLCrashTips,
  ctxOptions,
  requestIdleCallback,
  SafeOffscreenCanvas,
  wrapErrorHandler,
} from './generic';
import ProjectorShadow from './projector-shadow';
import { storage } from './storage';

export default class ProjectorWebGL {
  type = 'ProjectorWebGL';
  lostCount = 0;
  blurLostCount = 0;
  scales = [{ x: 1, y: 1 }];
  projectors = [];
  static subProjectorDimensionMax = 3;
  atTop = true;

  constructor(ambientlight, containerElem, initProjectorListeners, settings) {
    return async function ProjectorWebGLConstructor() {
      this.ambientlight = ambientlight;
      this.atTop = ambientlight.atTop;
      this.containerElem = containerElem;
      this.initProjectorListeners = initProjectorListeners;
      this.settings = settings;
      this.setWarning = settings.setWarning;

      this.initShadow();
      this.initBlurCtx();
      const initialized = await this.initCtx();
      if (!initialized) this.setWebGLWarning('create');

      this.initializedTime = performance.now();
      return this;
    }.bind(this)();
  }

  invalidateShaderCache() {
    this.viewport = undefined;
    this.fVibrance = undefined;
    this.vPosition = undefined;
    this.vUV = undefined;
    this.cropped = undefined;
    this.fScale = undefined;
    this.fScaleStep = undefined;
    this.fScalesLength = undefined;
    this.fCrop = undefined;
    this.fTextureMipmapLevel = undefined;
    this.fTextureOpacity = undefined;
    this.drawTextureSize = {
      width: 0,
      height: 0,
    };
  }

  handleWindowResize = async () => {
    if (this.ambientlight.isPageHidden) return;

    this.updateCrop();
    await this.ambientlight.optionalFrame();
  };

  handleAtTopChange = async (atTop) => {
    this.atTop = atTop;
    if (this.ambientlight.isPageHidden) return;

    this.updateCrop();
    this.ambientlight.buffersCleared = true;
    await this.ambientlight.optionalFrame();
  };

  remove() {
    this.containerElem.remove(this.elem);
  }

  // TODO: Cut off left, top and right canvas outside the browser + blur size
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  initShadow() {
    this.shadow = new ProjectorShadow();
    this.projectors[2] = {
      elem: this.shadow.elem,
      ctx: this.blurCtx,
    };
  }

  drawIndex = 0;
  drawBorder = 0;
  drawTextureSize = {
    width: 0,
    height: 0,
  };
  draw = (src) => {
    if (
      !this.ctx ||
      this.ctxIsInvalid ||
      src.ctx?.ctxIsInvalid ||
      this.lost ||
      !this.viewport
    )
      return;

    // ctx is being initialized but not ready yet
    if (
      this.projectorsCount > 1 &&
      this.projectorsCount !== this.fTextureOpacity?.length
    )
      return;

    if (!this.cropped) this.updateCrop();

    const srcWidth = src.videoWidth || src.width;
    const srcHeight = src.videoHeight || src.height;

    const textureMipmapLevel = Math.max(
      0,
      Math.log(srcHeight / this.height) / Math.log(2) - 0
    );
    if (textureMipmapLevel !== this.fTextureMipmapLevel) {
      this.fTextureMipmapLevel = textureMipmapLevel;
      this.ctx.uniform1f(this.fTextureMipmapLevelLoc, textureMipmapLevel);
    }

    const subProjectorsDimensionMultiplier = Math.sqrt(this.subProjectorsCount);
    const textureSize =
      this.projectorsCount > 1
        ? {
            width:
              (srcWidth + this.drawBorder) * subProjectorsDimensionMultiplier,
            height:
              (srcHeight + this.drawBorder) * subProjectorsDimensionMultiplier,
          }
        : {
            width: srcWidth,
            height: srcHeight,
          };
    const updateTextureSize =
      this.drawTextureSize.width !== textureSize.width ||
      this.drawTextureSize.height !== textureSize.height;

    const blurCanvasBound = Math.floor(this.blurBound / this.blurCanvasScale);
    const blurCanvasWidthMinBounds =
      this.blurCanvas.width - blurCanvasBound * 2;
    const blurCanvasHeightMinBounds =
      this.blurCanvas.height - blurCanvasBound * 2;

    const internalFormat = this.ctx.RGBA;
    const format = this.ctx.RGBA;
    const formatType = this.ctx.UNSIGNED_BYTE;

    let start = this.settings.showResolutions ? performance.now() : undefined;
    if (this.projectorsCount > 1) {
      if (updateTextureSize) {
        this.drawInitial = true;
        this.drawIndex = 0;
      }

      // Set opacities

      const filledOpacities = this.fTextureOpacity.slice(
        this.projectorsCount - 1 - this.drawIndex
      );
      const emptyOpacities = this.fTextureOpacity.slice(
        0,
        this.projectorsCount - 1 - this.drawIndex
      );
      const opacities = [
        ...(this.drawInitial
          ? filledOpacities.map((o, i) =>
              i === 0 ? emptyOpacities.reduce((s, o) => s + o, o) : o
            )
          : filledOpacities),
        ...(this.drawInitial ? emptyOpacities.map(() => 0) : emptyOpacities),
      ];

      // Draw texture

      const textureIndex = Math.floor(this.drawIndex / this.subProjectorsCount);
      const previousTextureIndex = Math.floor(
        (this.drawIndex - 1) / this.subProjectorsCount
      );

      const isNewTexture = textureIndex !== previousTextureIndex;
      const drawInitialAndIsNewTexture = this.drawInitial && isNewTexture;

      const subIndex = this.drawIndex % this.subProjectorsCount;
      const xIndex = subIndex % subProjectorsDimensionMultiplier;
      const yIndex =
        Math.floor(subIndex / subProjectorsDimensionMultiplier) %
        subProjectorsDimensionMultiplier;
      const x = (srcWidth + this.drawBorder) * xIndex;
      const y = (srcHeight + this.drawBorder) * yIndex;

      if (this.drawInitial) {
        const isLastSubTexture = this.drawIndex == this.projectorsCount - 1;
        if (isLastSubTexture) this.drawInitial = false;
      }

      this.ctx.uniform1fv(this.fTextureOpacityLoc, new Float32Array(opacities));
      this.ctx.activeTexture(this.ctx[`TEXTURE${textureIndex + 1}`]);
      if (drawInitialAndIsNewTexture) {
        this.ctx.texImage2D(
          this.ctx.TEXTURE_2D,
          0,
          internalFormat,
          textureSize.width,
          textureSize.height,
          0,
          format,
          formatType,
          null
        );
      }
      this.ctx.texSubImage2D(
        this.ctx.TEXTURE_2D,
        0,
        x,
        y,
        format,
        formatType,
        src
      );
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D);
    } else {
      if (updateTextureSize) {
        this.ctx.texImage2D(
          this.ctx.TEXTURE_2D,
          0,
          internalFormat,
          format,
          formatType,
          src
        );
      } else {
        this.ctx.texSubImage2D(
          this.ctx.TEXTURE_2D,
          0,
          0,
          0,
          format,
          formatType,
          src
        );
      }
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D);
    }
    if (this.settings.showResolutions)
      this.loadTime = performance.now() - start;

    if (this.settings.showResolutions) start = performance.now();
    this.ctx.drawArrays(this.ctx.TRIANGLES, 0, this.vPosition.length / 2);
    if (this.settings.showResolutions)
      this.drawTime = performance.now() - start;

    if (this.settings.showResolutions) start = performance.now();
    this.blurCtx.clearRect(0, 0, this.blurCanvas.width, this.blurCanvas.height);
    if (this.settings.showResolutions) {
      this.blurClearTime = performance.now() - start;
      start = performance.now();
    }
    this.blurCtx.drawImage(
      this.elem,
      blurCanvasBound,
      blurCanvasBound,
      blurCanvasWidthMinBounds,
      blurCanvasHeightMinBounds
    );
    if (this.settings.showResolutions)
      this.blurDrawTime = performance.now() - start;

    if (updateTextureSize) {
      this.drawTextureSize = textureSize;
    }
    this.drawIndex =
      (this.drawIndex + 1 + Math.round(Math.random() * 0.5)) %
      this.projectorsCount;
  };

  setWebGLWarning(action = 'restore') {
    this.setWarning(
      `Failed to ${action} the WebGL renderer from a GPU crash.${canvasWebGLCrashTips}`
    );
  }

  onBlurCtxLost = wrapErrorHandler(
    function wrappedOnBlurCtxLost(event) {
      event.preventDefault();
      this.blurLost = true;
      this.blurLostCount++;
      this.invalidateShaderCache();

      // Invalidate shadow
      if (this.shadow?.elem) {
        this.shadow.elem.width = 1;
      }

      console.log(`ProjectorWebGL blur context lost (${this.blurLostCount})`);
      this.setWebGLWarning('restore');

      // The bardetection worker offscreencanvas does not trigger contextlost events
      this.ambientlight.barDetection.clear();
    }.bind(this)
  );

  onBlurCtxRestored = wrapErrorHandler(
    async function wrappedOnBlurCtxRestored() {
      console.log(
        `ProjectorWebGL blur context restored (${this.blurLostCount})`
      );
      if (this.blurLostCount >= 3) {
        console.error(
          'ProjectorWebGL blur context was lost 3 times. The current restoration has been aborted to prevent an infinite restore loop.'
        );
        this.setWebGLWarning('3 times restore');
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.initBlurCtx();
      if (
        this.blurCtx &&
        (!this.blurCtx.isContextLost || !this.blurCtx.isContextLost())
      ) {
        if (!this.ctxIsInvalid) {
          this.initProjectorListeners();
          this.blurLost = false;
          if (!this.lost && !this.ambientlight.projectorBuffer?.lost)
            this.setWarning('');

          // The bardetection worker offscreencanvas does not trigger contextrestored events
          this.ambientlight.barDetection.clear();
        }
      } else {
        console.error(
          `ProjectorWebGL blur context restore failed (${this.blurLostCount})`
        );
        this.setWebGLWarning('restore');
      }
    }.bind(this)
  );

  initBlurCtx() {
    if (this.blurCanvas) {
      this.containerElem.removeChild(this.blurCanvas);
      if (this.blurCtx) {
        this.blurCanvas.removeEventListener('contextlost', this.onBlurCtxLost);
        this.blurCanvas.removeEventListener(
          'contextrestored',
          this.onBlurCtxRestored
        );
      }
    }

    this.blurCanvas = document.createElement('canvas');
    this.blurCanvas.classList.add('ambientlight__projector');
    this.containerElem.prepend(this.blurCanvas);
    this.boundaryElem = this.blurCanvas;
    this.blurCanvas.addEventListener('contextlost', this.onBlurCtxLost);
    this.blurCanvas.addEventListener('contextrestored', this.onBlurCtxRestored);
    this.blurCtx = this.blurCanvas.getContext('2d', {
      ...ctxOptions,
      alpha: true,
      desynchronized: false, // true: Does not work when canvas elements are not hardware accelerated
    });
    if (!this.blurCtx) {
      throw new Error('ProjectorWebGL blur context creation failed');
    }
    this.projectors[0] = {
      elem: this.blurCanvas,
      ctx: this.blurCtx,
    };

    if (this.blurLost) {
      this.blurLost = false;
    }
  }

  async getMajorPerformanceCaveatDetected() {
    try {
      return (await storage.get('majorPerformanceCaveatDetected')) || false;
    } catch (ex) {
      SentryReporter.captureException(ex);
    }
  }

  async majorPerformanceCaveatDetected() {
    this.majorPerformanceCaveat = true;
    const detected = await this.getMajorPerformanceCaveatDetected();
    if (detected) return;

    const message =
      'The browser warned that this is a slow device. If you have a graphics card, make sure to enable hardware acceleration in the browser.\n(The resolution setting has been turned down to 25% for better performance)';
    // console.warn(`ProjectorWebGL: ${message}`)
    this.setWarning(message, true);
    this.settings.set('resolution', 25, true);
    await storage.set('majorPerformanceCaveatDetected', true);
  }

  async noMajorPerformanceCaveatDetected() {
    this.majorPerformanceCaveat = false;
    const detected = await this.getMajorPerformanceCaveatDetected();
    if (detected === false) return;

    await storage.set('majorPerformanceCaveatDetected', false);
  }

  onCtxLost = wrapErrorHandler(
    function projectorCtxLost(event) {
      event.preventDefault();

      this.lost = true;
      this.lostCount++;
      this.program = undefined; // Prevent warning: Cannot delete program from old context. in initCtx
      this.invalidateShaderCache();

      console.log(`ProjectorWebGL context lost (${this.lostCount})`);
      this.setWebGLWarning('restore');
    }.bind(this)
  );

  onCtxRestored = wrapErrorHandler(
    async function projectorCtxRestored() {
      // console.log(`ProjectorWebGL restored (${this.lostCount})`)
      if (this.lostCount >= 3) {
        console.error('ProjectorWebGL context restore failed 3 times');
        this.setWebGLWarning('3 times restore');
        return;
      }
      try {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!(await this.initCtx())) return;
      } catch (ex) {
        this.setWebGLWarning();
        throw ex;
      }

      this.initShadow();
      this.initBlurCtx();
      if (this.ctx) {
        if (!this.ctxIsInvalid) {
          this.initProjectorListeners();
          this.lost = false;
          if (!this.blurLost && !this.ambientlight.projectorBuffer?.lost)
            this.setWarning('');
        }
      } else {
        console.error(
          `ProjectorWebGL context restore failed (${this.lostCount})`
        );
        this.setWebGLWarning('restore');
        return;
      }

      if (this.handleRestored) this.handleRestored();
    }.bind(this)
  );

  webglcontextcreationerrors = [];
  onCtxCreationError = wrapErrorHandler(
    function projectorCtxCreationError(e) {
      // console.warn(`ProjectorWebGL creationerror: ${e.statusMessage}`)
      this.webglcontextcreationerrors.push({
        webGLVersion: this.webGLVersion,
        failIfMajorPerformanceCaveat:
          this.ctxOptions.failIfMajorPerformanceCaveat,
        message: e.statusMessage || '?',
        time: performance.now(),
      });
    }.bind(this)
  );

  // syncCompilation prevents black flickering while settings are changed
  async initCtx(syncCompilation = false) {
    if (this.cancelCompilation) return false;
    if (this.compilationPromise) {
      this.cancelCompilation = true;
      await this.compilationPromise;
      this.cancelCompilation = undefined;
    }

    if (
      (this.webGLVersion === 2 || this.webGLVersion === 1) &&
      !this.ctx &&
      this.elem
    ) {
      this.elem.removeEventListener('contextlost', this.onCtxLost);
      this.elem.removeEventListener('contextrestored', this.onCtxRestored);
      this.elem.removeEventListener(
        'webglcontextcreationerror',
        this.onCtxCreationError
      );
      this.elem = undefined;
      this.webGLVersion = undefined;
    }

    if (!this.elem) {
      this.elem = new SafeOffscreenCanvas(1, 1);
      this.elem.addEventListener('webglcontextlost', this.onCtxLost, false);
      this.elem.addEventListener(
        'webglcontextrestored',
        this.onCtxRestored,
        false
      );
      this.elem.addEventListener(
        'webglcontextcreationerror',
        this.onCtxCreationError,
        false
      );
    }

    if (!this.ctx) {
      this.ctxOptions = {
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: false, // Allows the browser to swap the visible- and drawbuffers, which is faster
        premultipliedAlpha: false,
        alpha: true,
        depth: false,
        antialias: false,
        desynchronized: false,
      };
      this.webGLVersion = 2;
      this.ctx = this.elem.getContext('webgl2', this.ctxOptions);
      if (this.ctx) {
        this.noMajorPerformanceCaveatDetected();
      } else {
        this.webGLVersion = 1;
        this.ctx = this.elem.getContext('webgl', this.ctxOptions);
        if (this.ctx) {
          this.noMajorPerformanceCaveatDetected();
        } else {
          this.ctxOptions.failIfMajorPerformanceCaveat = false;
          this.webGLVersion = 2;
          this.ctx = this.elem.getContext('webgl2', this.ctxOptions);
          if (this.ctx) {
            this.majorPerformanceCaveatDetected();
          } else {
            this.webGLVersion = 1;
            this.ctx = this.elem.getContext('webgl', this.ctxOptions);
            if (this.ctx) {
              this.majorPerformanceCaveatDetected();
            } else {
              this.webGLVersion = undefined;
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for any additional webglcontextcreationerrors to be captured

              const errors = this.webglcontextcreationerrors;
              this.webglcontextcreationerrors = [];

              let lastErrorMessage = '';
              for (const error of errors) {
                const duplicate = error.message === lastErrorMessage;
                lastErrorMessage = error.message;
                if (duplicate) error.message = '"';
              }

              throw new AmbientlightError(
                `ProjectorWebGL context creation failed: ${lastErrorMessage}`,
                errors
              );
            }
          }
        }
      }
    }

    if (!this.ctx || this.ctx.isContextLost()) return;

    if (
      'drawingBufferColorSpace' in this.ctx &&
      'unpackColorSpace' in this.ctx
    ) {
      this.ctx.drawingBufferColorSpace = ctxOptions.colorSpace;
      this.ctx.unpackColorSpace = ctxOptions.colorSpace;
    }

    this.projectors[1] = {
      elem: this.elem,
      ctx: this,
    };

    // Program
    const program = this.ctx.createProgram();

    // Textures
    this.ctx.hint(this.ctx.GENERATE_MIPMAP_HINT, this.ctx.NICEST);
    const tfaExt =
      this.ctx.getExtension('EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const maxAnisotropy = tfaExt
      ? Math.min(
          16,
          this.ctx.getParameter(tfaExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1
        )
      : 0;

    // Texture - Shadow
    this.shadowTexture = this.ctx.createTexture();
    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.shadowTexture);
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MIN_FILTER,
      this.ctx.LINEAR
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MAG_FILTER,
      this.ctx.LINEAR
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_S,
      this.ctx.CLAMP_TO_EDGE
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_T,
      this.ctx.CLAMP_TO_EDGE
    );
    this.ctx.texImage2D(
      this.ctx.TEXTURE_2D,
      0,
      this.ctx.RGBA,
      1,
      1,
      0,
      this.ctx.RGBA,
      this.ctx.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );

    // Texture - Projectors
    this.projectorsTexture = [];
    const maxTextures = Math.min(
      this.ctx.getParameter(this.ctx.MAX_TEXTURE_IMAGE_UNITS) || 8,
      16
    ); // MAX_TEXTURE_IMAGE_UNITS can be more than 16 in software mode
    const maxProjectorTextures = maxTextures - 1;
    ProjectorWebGL.subProjectorDimensionMax = this.webGLVersion === 2 ? 3 : 2; // WebGL1 does not allow non-power-of-two textures
    this.subProjectorsCount = 1;
    const frameFading = Math.round(Math.pow(this.settings.frameFading, 2));
    for (
      let i = 1;
      i < ProjectorWebGL.subProjectorDimensionMax &&
      frameFading + 1 > maxProjectorTextures * Math.pow(i, 2);
      i++
    ) {
      this.subProjectorsCount = Math.pow(i + 1, 2);
    }
    this.projectorsCount = Math.min(
      frameFading + 1,
      maxProjectorTextures * this.subProjectorsCount
    );
    const projectorsTextureCount = Math.ceil(
      this.projectorsCount / this.subProjectorsCount
    );
    for (let i = 0; i < projectorsTextureCount; i++) {
      this.projectorsTexture[i] = this.ctx.createTexture();
      this.ctx.activeTexture(this.ctx[`TEXTURE${i + 1}`]);
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.projectorsTexture[i]);
      this.ctx.texParameteri(
        this.ctx.TEXTURE_2D,
        this.ctx.TEXTURE_MIN_FILTER,
        this.ctx.LINEAR_MIPMAP_LINEAR
      );
      this.ctx.texParameteri(
        this.ctx.TEXTURE_2D,
        this.ctx.TEXTURE_MAG_FILTER,
        this.ctx.LINEAR
      );
      this.ctx.texParameteri(
        this.ctx.TEXTURE_2D,
        this.ctx.TEXTURE_WRAP_S,
        this.ctx.CLAMP_TO_EDGE
      );
      this.ctx.texParameteri(
        this.ctx.TEXTURE_2D,
        this.ctx.TEXTURE_WRAP_T,
        this.ctx.CLAMP_TO_EDGE
      );
      if (this.webGLVersion !== 1) {
        this.ctx.texParameteri(
          this.ctx.TEXTURE_2D,
          this.ctx.TEXTURE_MAX_LEVEL,
          16
        );
      }
      if (maxAnisotropy) {
        this.ctx.texParameteri(
          this.ctx.TEXTURE_2D,
          tfaExt.TEXTURE_MAX_ANISOTROPY_EXT,
          maxAnisotropy
        );
      }
      this.ctx.texImage2D(
        this.ctx.TEXTURE_2D,
        0,
        this.ctx.RGBA,
        1,
        1,
        0,
        this.ctx.RGBA,
        this.ctx.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D);
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
    `
      .replace(/\n {6}/g, '\n')
      .replace(/ +\n/g, '')
      .replace(/\n+/g, '\n')
      .trim();
    const vertexShader = this.ctx.createShader(this.ctx.VERTEX_SHADER);
    this.ctx.shaderSource(vertexShader, vertexShaderSrc);
    this.ctx.compileShader(vertexShader);
    this.ctx.attachShader(program, vertexShader);

    const fragmentShaderSrc = `
      precision lowp float;
      varying vec2 fUV;
      uniform sampler2D textureSampler[${this.projectorsTexture.length}];
      uniform float fTextureMipmapLevel;
      ${
        this.projectorsCount > 1
          ? `uniform float fTextureOpacity[${this.projectorsCount}];`
          : ''
      }
      uniform vec2 fCropOffsetUV;
      uniform vec2 fCropScaleUV;
      uniform sampler2D shadowSampler;
      uniform vec2 fScale;
      uniform vec2 fScaleStep;
      ${this.settings.vibrance !== 100 ? 'uniform float fVibrance;' : ''}

      vec4 multiTexture() {
        vec2 direction = ceil(fUV * 2.) - 1.;
        vec2 iUV = ((direction - fUV) * fScale) / ((direction - .5) * fScaleStep);
        int impreciseI = int(min(iUV[0], iUV[1]));
        for (int preciseI = 0; preciseI < 200; preciseI++) {
          if (preciseI < impreciseI) continue;
          int i = ${this.webGLVersion === 1 ? 'impreciseI' : 'preciseI'};
          vec2 scaledUV = (fUV - .5) * (fScale / (fScale - fScaleStep * vec2(i)));
          vec2 croppedUV = fCropOffsetUV + (scaledUV / fCropScaleUV);
          
          ${(() => {
            if (this.projectorsCount > 1) {
              const subProjectorsDimensionMultiplier = Math.sqrt(
                this.subProjectorsCount
              );
              const croppedUvScale = (1 / subProjectorsDimensionMultiplier)
                .toString()
                .padEnd(2, '.');

              return `${new Array(this.subProjectorsCount)
                .fill(undefined)
                .map((_, i) => {
                  if (i === 0)
                    return `vec2 uv0 = ${
                      croppedUvScale !== '1.'
                        ? `(croppedUV * ${croppedUvScale})`
                        : 'croppedUV'
                    };`;

                  const xIndex = i % subProjectorsDimensionMultiplier;
                  const yIndex =
                    Math.floor(i / subProjectorsDimensionMultiplier) %
                    subProjectorsDimensionMultiplier;
                  const offsetUVx = (
                    (1 / subProjectorsDimensionMultiplier) *
                    xIndex
                  )
                    .toString()
                    .padEnd(2, '.');
                  const offsetUVy = (
                    (1 / subProjectorsDimensionMultiplier) *
                    yIndex
                  )
                    .toString()
                    .padEnd(2, '.');

                  // Todo: Ommit the drawBorder by calculating the rescale caused by: .5 - drawBorder
                  return `vec2 uv${i} = uv0${
                    offsetUVx !== '0.' || offsetUVy !== '0.'
                      ? ` + vec2(${offsetUVx},${offsetUVy})`
                      : ''
                  };`;
                })
                .join('\n')}`;
            } else {
              return ``;
            }
          })()}

          return ${(() => {
            if (this.projectorsCount > 1) {
              return `${new Array(this.projectorsCount)
                .fill(undefined)
                .map((_, i) => {
                  const projectorIndex = Math.floor(
                    i / this.subProjectorsCount
                  );
                  const subIndex = i % this.subProjectorsCount;

                  // Todo: Ommit the drawBorder by calculating the rescale caused by: .5 - drawBorder
                  return `(fTextureOpacity[${i}] * texture2D(textureSampler[${projectorIndex}], uv${subIndex}, fTextureMipmapLevel))`;
                })
                .join('\n+ ')};`;
            } else {
              return `texture2D(textureSampler[0], croppedUV, fTextureMipmapLevel);`;
            }
          })()}
        }
        return vec4(0.0, 0.0, 0.0, 1.0);
      }
      
      ${
        this.settings.vibrance !== 100
          ? `
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
      `
          : ''
      }

      void main(void) {
        vec3 ambientlight = multiTexture().rgb;
        float shadowAlpha = texture2D(shadowSampler, fUV).a;
        ${
          this.settings.vibrance !== 100
            ? `
          if(fVibrance != 0.) {
            vec3 ambientlightHSV = rgb2hsv(ambientlight);
            ambientlightHSV[1] = saturate(ambientlightHSV[1], fVibrance);
            ambientlight = hsv2rgb(ambientlightHSV);
          }
        `
            : ''
        }
        gl_FragColor = vec4(ambientlight, 1. - shadowAlpha);
      }
    `
      .replace(/\n {6}/g, '\n')
      .replace(/ +\n/g, '')
      .replace(/\n+/g, '\n')
      .trim();
    const fragmentShader = this.ctx.createShader(this.ctx.FRAGMENT_SHADER);
    this.ctx.shaderSource(fragmentShader, fragmentShaderSrc);
    this.ctx.compileShader(fragmentShader);
    this.ctx.attachShader(program, fragmentShader);

    // Delete previous program
    if (this.program) {
      try {
        this.ctx.finish(); // Wait for any pending draw calls to finish
        this.ctx.deleteProgram(this.program); // Free GPU memory
      } catch (ex) {
        console.warn('Failed to delete previous ProjectorWebGL program', ex);
      }
      this.program = undefined;
      this.invalidateShaderCache();
    }

    // Program
    this.ctx.linkProgram(program);

    const parallelShaderCompileExt = syncCompilation
      ? undefined
      : this.ctx.getExtension('KHR_parallel_shader_compile');
    if (parallelShaderCompileExt?.COMPLETION_STATUS_KHR) {
      let resolveCompilationPromise;
      this.compilationPromise = new Promise(
        (resolve) =>
          (resolveCompilationPromise = async () => {
            resolveCompilationPromise = undefined;
            await new Promise((resolve) => setTimeout(resolve, 0)); // Make sure to finish the current task first
            this.compilationPromise = undefined;
            resolve();
          })
      );

      // The first getProgramParameter COMPLETION_STATUS_KHR request returns always false on chromium and the return value seems to be cached between animation frames
      this.ctx.getProgramParameter(
        program,
        parallelShaderCompileExt.COMPLETION_STATUS_KHR
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));

      try {
        let compiled = false;
        while (!compiled) {
          const completionStatus = this.ctx.getProgramParameter(
            program,
            parallelShaderCompileExt.COMPLETION_STATUS_KHR
          );
          // COMPLETION_STATUS_KHR can be null because of webgl-lint
          if (completionStatus === false) {
            await new Promise((resolve) =>
              requestIdleCallback(resolve, { timeout: 200 })
            );
            await new Promise((resolve) => requestAnimationFrame(resolve));
          } else {
            compiled = true;
          }
        }

        if (this.cancelCompilation && compiled) {
          try {
            compiled = false;
            this.ctx.deleteProgram(program); // Free GPU memory
          } catch (ex) {
            console.warn('Failed to delete new ProjectorWebGL program', ex);
          }
        }

        resolveCompilationPromise();
        if (!compiled) return false;
      } catch (ex) {
        try {
          ex.details = {
            program: program?.toString(),
            webGLVersion: this.webGLVersion,
            majorPerformanceCaveat: this.majorPerformanceCaveat,
            ctxOptions: this.ctxOptions,
          };
        } catch (ex) {
          ex.details = {
            detailsException: ex,
          };
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

        resolveCompilationPromise();
        throw ex;
      }
    }

    // Validate these parameters after program compilation to prevent render blocking validation
    const vertexShaderCompiled = this.ctx.getShaderParameter(
      vertexShader,
      this.ctx.COMPILE_STATUS
    );
    const fragmentShaderCompiled = this.ctx.getShaderParameter(
      fragmentShader,
      this.ctx.COMPILE_STATUS
    );
    const programLinked = this.ctx.getProgramParameter(
      program,
      this.ctx.LINK_STATUS
    );
    if (!vertexShaderCompiled || !fragmentShaderCompiled || !programLinked) {
      const programCompilationError = new Error('Program compilation failed');
      programCompilationError.name = 'WebGLError';
      programCompilationError.details = {
        webGLVersion: this.webGLVersion,
        ctxOptions: this.ctxOptions,
      };

      try {
        programCompilationError.details = {
          ...programCompilationError.details,
          vertexShaderCompiled,
          vertexShaderInfoLog: this.ctx.getShaderInfoLog(vertexShader),
          fragmentShaderCompiled,
          fragmentShaderInfoLog: this.ctx.getShaderInfoLog(fragmentShader),
          programLinked,
          programInfoLog: this.ctx.getProgramInfoLog(program),
        };
      } catch (ex) {
        programCompilationError.details.getCompiledAndLinkedInfoLogsError = ex;
      }

      try {
        this.ctx.validateProgram(program);
        programCompilationError.details.programValidated =
          this.ctx.getProgramParameter(program, this.ctx.VALIDATE_STATUS);
        programCompilationError.details.programValidationInfoLog =
          this.ctx.getProgramInfoLog(program);
      } catch (ex) {
        programCompilationError.details.validateProgramError = ex;
      }

      try {
        const ext = this.ctx.getExtension('WEBGL_debug_shaders');
        if (ext) {
          programCompilationError.details.Ωsources = {
            vertexShader: ext.getTranslatedShaderSource(vertexShader),
            fragmentShader: ext.getTranslatedShaderSource(fragmentShader),
          };
          if (!programCompilationError.details.Ωsources.vertexShader) {
            programCompilationError.details.Ωsources.vertexShaderCode =
              vertexShaderSrc;
          }
          if (!programCompilationError.details.Ωsources.fragmentShader) {
            programCompilationError.details.Ωsources.fragmentShaderCode =
              fragmentShaderSrc;
          }
        }
      } catch (ex) {
        programCompilationError.details.debugShadersError = ex;
      }

      try {
        const debugRendererInfo = this.ctx.getExtension(
          'WEBGL_debug_renderer_info'
        );
        programCompilationError.details.gpuVendor =
          debugRendererInfo?.UNMASKED_VENDOR_WEBGL
            ? this.ctx.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
            : 'unknown';
        programCompilationError.details.gpuRenderer =
          debugRendererInfo?.UNMASKED_RENDERER_WEBGL
            ? this.ctx.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
            : 'unknown';
      } catch (ex) {
        programCompilationError.details.gpuError = ex;
      }

      if (
        programCompilationError.details.vertexShaderInfoLog ||
        programCompilationError.details.fragmentShaderInfoLog ||
        programCompilationError.details.getCompiledAndLinkedInfoLogsError ||
        programCompilationError.details.programValidationInfoLog ||
        programCompilationError.details.validateProgramError ||
        programCompilationError.details.Ωsources?.vertexShader ||
        programCompilationError.details.Ωsources?.vertexShaderCode ||
        programCompilationError.details.Ωsources?.fragmentShader ||
        programCompilationError.details.Ωsources?.fragmentShaderCode ||
        programCompilationError.details.debugShadersError
      ) {
        programCompilationError.name = 'WebGLErrorWithInfoLog';
      }

      throw programCompilationError;
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

    this.ctx.useProgram(program);
    this.program = program;

    // Buffers
    const vUVLoc = this.ctx.getAttribLocation(this.program, 'vUV');
    this.vUVBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vUVBuffer);
    this.ctx.vertexAttribPointer(
      vUVLoc,
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    this.ctx.enableVertexAttribArray(vUVLoc);

    const vPositionLoc = this.ctx.getAttribLocation(this.program, 'vPosition');
    this.vPositionBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vPositionBuffer);
    this.ctx.vertexAttribPointer(
      vPositionLoc,
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    this.ctx.enableVertexAttribArray(vPositionLoc);

    const shadowSamplerLoc = this.ctx.getUniformLocation(
      this.program,
      'shadowSampler'
    );
    this.ctx.uniform1i(shadowSamplerLoc, 0);

    const textureSamplerLoc = this.ctx.getUniformLocation(
      this.program,
      'textureSampler'
    );
    this.ctx.uniform1iv(
      textureSamplerLoc,
      this.projectorsTexture.map((_, i) => 1 + i)
    );

    this.fTextureMipmapLevelLoc = this.ctx.getUniformLocation(
      this.program,
      'fTextureMipmapLevel'
    );
    this.ctx.uniform1f(this.fTextureMipmapLevelLoc, 0);

    if (this.settings.vibrance !== 100) {
      this.fVibranceLoc = this.ctx.getUniformLocation(
        this.program,
        'fVibrance'
      );
      this.ctx.uniform1f(this.fVibranceLoc, 0);
    }

    this.fScaleLoc = this.ctx.getUniformLocation(this.program, 'fScale');
    this.ctx.uniform2fv(this.fScaleLoc, new Float32Array([1, 1]));

    this.fScaleStepLoc = this.ctx.getUniformLocation(
      this.program,
      'fScaleStep'
    );
    this.ctx.uniform2fv(this.fScaleStepLoc, new Float32Array([1, 1]));

    this.fCropOffsetUVLoc = this.ctx.getUniformLocation(
      this.program,
      'fCropOffsetUV'
    );
    this.ctx.uniform2fv(this.fCropOffsetUVLoc, new Float32Array([0, 0]));

    this.fCropScaleUVLoc = this.ctx.getUniformLocation(
      this.program,
      'fCropScaleUV'
    );
    this.ctx.uniform2fv(this.fCropScaleUVLoc, new Float32Array([0, 0]));

    if (this.projectorsCount > 1) {
      this.fTextureOpacityLoc = this.ctx.getUniformLocation(
        this.program,
        'fTextureOpacity'
      );
      this.ctx.uniform1fv(
        this.fTextureOpacityLoc,
        new Float32Array(Array(this.projectorsCount).fill(0))
      );
    }

    this.invalidateShaderCache();

    this.updateCtx();
    return true;
  }

  rescale(scales, lastScale, projectorSize, crop, settings) {
    if (this.shadow) {
      this.shadow.rescale(lastScale, projectorSize, settings);
    }

    this.scaleStep = {
      x: scales[2]?.x - scales[1]?.x,
      y: scales[2]?.y - scales[1]?.y,
    };
    this.scale = lastScale;
    this.scalesLength = scales.length;
    this.crop = crop;

    const width = Math.floor(projectorSize.w * this.scale.x);
    const height = Math.floor(projectorSize.h * this.scale.y);
    if (this.elem) {
      this.elem.width = width;
      this.elem.height = height;
    }

    this.blurCanvasScale = settings.blur2 > 1 ? 2 : 1;
    const blurPx = settings.blur2 * (this.height / 512) * 1.275;
    const blurRadius = 2.64;
    this.blurBound = Math.max(1, Math.ceil(blurPx * blurRadius));
    if (this.blurCanvas) {
      const blurCanvasWidth = width + this.blurBound * 2;
      const blurCanvasHeight = height + this.blurBound * 2;
      // Scale down when blur > 1 for a free performance boost on Firefox
      const scaledWidth = Math.floor(blurCanvasWidth / this.blurCanvasScale);
      const scaledHeight = Math.floor(blurCanvasHeight / this.blurCanvasScale);
      if (this.blurCanvas.width !== scaledWidth)
        this.blurCanvas.width = scaledWidth;
      if (this.blurCanvas.height !== scaledHeight)
        this.blurCanvas.height = scaledHeight;
      this.blurCanvas.style.transform = `scale(${
        this.scale.x + (this.blurBound * 2) / projectorSize.w
      }, ${this.scale.y + (this.blurBound * 2) / projectorSize.h})`;
    }
    if (this.blurCtx) {
      this.blurCtx.filter = `blur(${blurPx / this.blurCanvasScale}px)`;
    }

    this.updateCtx();
  }

  async updateVibrance() {
    const hadVibranceFilter = this.fVibrance !== undefined;
    const hasVibranceFilter = this.settings.vibrance !== 100;
    if (hasVibranceFilter === hadVibranceFilter) return true;

    return await this.initCtx();
  }

  updateCtx() {
    if (this.ctxIsInvalid || this.lost) return;

    if (this.settings.vibrance !== 100) {
      let vibrance = this.settings.vibrance / 100 - 1;
      vibrance =
        (vibrance < 0 ? -1 : 1) * (1 - Math.pow(1 - Math.abs(vibrance), 3));
      const fVibranceChanged = this.fVibrance !== vibrance;
      if (fVibranceChanged) {
        this.fVibrance = vibrance;
        this.ctx.uniform1f(this.fVibranceLoc, this.fVibrance);
      }
    }

    const fScaleChanged =
      this.fScale?.x !== this.scale?.x || this.fScale?.y !== this.scale?.y;
    if (fScaleChanged) {
      this.fScale = this.scale;
      this.ctx.uniform2fv(
        this.fScaleLoc,
        new Float32Array([this.fScale?.x, this.fScale?.y])
      );
    }

    const fScaleStepChanged =
      this.fScaleStep?.x !== this.scaleStep?.x ||
      this.fScaleStep?.y !== this.scaleStep?.y;
    if (fScaleStepChanged) {
      this.fScaleStep = this.scaleStep;
      this.ctx.uniform2fv(
        this.fScaleStepLoc,
        new Float32Array([this.fScaleStep?.x, this.fScaleStep?.y])
      );
    }

    const crop = this.crop || [0, 0];
    const fCropChanged = crop.some(
      (crop, i) => crop !== (this.fCrop || [undefined, undefined])[i]
    );
    if (fCropChanged) {
      this.fCrop = crop;
      const fCropScaleUV = crop.map((crop) => 1 / (1 - crop * 2));
      const fCropOffsetUV = fCropScaleUV.map(
        (cropScale, i) => crop[i] + 1 / (cropScale * 2)
      );
      this.ctx.uniform2fv(
        this.fCropOffsetUVLoc,
        new Float32Array(fCropOffsetUV)
      );
      this.ctx.uniform2fv(this.fCropScaleUVLoc, new Float32Array(fCropScaleUV));
    }

    if (this.projectorsCount > 1) {
      const fTextureOpacityChanged =
        this.projectorsCount > 1 &&
        !(this.fTextureOpacity?.length === this.projectorsCount);
      if (fTextureOpacityChanged) {
        const easing = (x) => x * x;
        this.fTextureOpacity = new Array(this.projectorsCount)
          .fill(undefined)
          .map((_, i) => easing((i + 1) / this.projectorsCount))
          .map((e, i, list) => (!i ? e : e - list[i - 1]));
      }
    }

    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.texImage2D(
      this.ctx.TEXTURE_2D,
      0,
      this.ctx.ALPHA,
      this.ctx.ALPHA,
      this.ctx.UNSIGNED_BYTE,
      this.shadow.elem
    );
    this.ctx.activeTexture(this.ctx.TEXTURE1);

    if (
      !this.viewport ||
      this.viewport.width !== this.ctx.drawingBufferWidth ||
      this.viewport.height !== this.ctx.drawingBufferHeight
    ) {
      this.viewport = {
        width: this.ctx.drawingBufferWidth,
        height: this.ctx.drawingBufferHeight,
      };
      this.ctx.viewport(
        0,
        0,
        this.ctx.drawingBufferWidth,
        this.ctx.drawingBufferHeight
      );
    }

    if (!this.cropped) {
      this.updateCrop();
    }

    if (!this.vPosition || !this.vUV) {
      this.updatePositionAndUvCoordinates();
    }
  }

  updateCrop() {
    if (
      this.ctxIsInvalid ||
      this.lost ||
      !this.blurCanvas ||
      !this.ambientlight?.videoContainerElem
    )
      return;

    const videoBoundingElem = this.ambientlight.shouldStyleVideoParentElem
      ? this.ambientlight.videoContainerElem
      : this.ambientlight.videoElem;
    if (!videoBoundingElem) return;

    let videoRect = videoBoundingElem.getBoundingClientRect();
    if (!videoRect?.width || !videoRect?.height) return;

    const canvasRect = this.blurCanvas.getBoundingClientRect();
    if (!canvasRect?.width || !canvasRect?.height) return;

    const blurScale = canvasRect.height / this.blurCanvas.height; // Todo: The blurRadius is appearently incorrect?
    const blurSize = this.blurBound * blurScale;
    const windowRect = {
      left: -blurSize,
      top: -window.scrollY - blurSize,
      right: window.innerWidth + blurSize,
      bottom: window.innerHeight + blurSize,
    };
    const canvasRectCenter = {
      x: canvasRect.left + canvasRect.width / 2,
      y: canvasRect.top + canvasRect.height / 2,
    };
    const cropRect = {
      left: Math.max(canvasRect.left, windowRect.left),
      top: Math.max(canvasRect.top, windowRect.top),
      right: Math.min(canvasRect.right, windowRect.right),
      bottom: Math.min(
        canvasRect.bottom,
        windowRect.bottom + (this.settings.fixedPosition ? 0 : 100)
      ), // 100 = a single scroll step
    };
    const cropPerc = {
      left:
        (canvasRectCenter.x - cropRect.left) /
        (canvasRectCenter.x - canvasRect.left),
      top:
        (canvasRectCenter.y - cropRect.top) /
        (canvasRectCenter.y - canvasRect.top),
      right:
        (cropRect.right - canvasRectCenter.x) /
        (canvasRect.right - canvasRectCenter.x),
      bottom:
        this.atTop || this.settings.fixedPosition
          ? (cropRect.bottom - canvasRectCenter.y) /
            (canvasRect.bottom - canvasRectCenter.y)
          : 1,
    };
    const crop = {
      t: Math.max(0, cropPerc.top.toFixed(4)),
      r: Math.max(0, cropPerc.right.toFixed(4)),
      b: -Math.max(0, cropPerc.bottom.toFixed(4)),
      l: -Math.max(0, cropPerc.left.toFixed(4)),
    };

    videoRect =
      this.settings.fixedPosition && !this.atTop
        ? {
            left: canvasRectCenter.x,
            top: canvasRectCenter.y,
            right: canvasRectCenter.x,
            bottom: canvasRectCenter.y,
          }
        : {
            left: videoRect.left + blurSize,
            top: videoRect.top + blurSize,
            right: videoRect.right - blurSize,
            bottom: videoRect.bottom - blurSize,
          };
    const cutPerc = {
      left:
        (canvasRectCenter.x - videoRect.left) /
        (canvasRectCenter.x - canvasRect.left),
      top:
        (canvasRectCenter.y - videoRect.top) /
        (canvasRectCenter.y - canvasRect.top),
      right:
        (videoRect.right - canvasRectCenter.x) /
        (canvasRect.right - canvasRectCenter.x),
      bottom:
        (videoRect.bottom - canvasRectCenter.y) /
        (canvasRect.bottom - canvasRectCenter.y),
    };
    const cut = {
      t: Math.min(Math.max(0, cutPerc.top.toFixed(4)), crop.t),
      r: Math.min(Math.max(0, cutPerc.right.toFixed(4)), crop.r),
      b: -Math.min(Math.max(0, cutPerc.bottom.toFixed(4)), -crop.b),
      l: -Math.min(Math.max(0, cutPerc.left.toFixed(4)), -crop.l),
    };

    this.updatePositionAndUvCoordinates(crop, cut);
    this.cropped = true;
  }

  updatePositionAndUvCoordinates(
    crop = { t: 1, r: 1, b: -1, l: -1 },
    cut = { t: 0, r: 0, b: 0, l: 0 }
  ) {
    // Convert cut and crop rectangles to position coordinates
    //   [p1x, p1y, p2x, p2y, p3x, p3y] = triangle points
    const vPosition = [
      // Bottom
      crop.l,
      crop.b,
      crop.r,
      crop.b,
      cut.r,
      cut.b,
      crop.l,
      crop.b,
      cut.r,
      cut.b,
      cut.l,
      cut.b,

      // Right
      crop.r,
      crop.t,
      crop.r,
      crop.b,
      cut.r,
      cut.t,
      crop.r,
      crop.b,
      cut.r,
      cut.b,
      cut.r,
      cut.t,

      // Top
      crop.l,
      crop.t,
      cut.r,
      cut.t,
      cut.l,
      cut.t,
      crop.l,
      crop.t,
      crop.r,
      crop.t,
      cut.r,
      cut.t,

      // Left
      crop.l,
      crop.t,
      crop.l,
      crop.b,
      cut.l,
      cut.t,
      crop.l,
      crop.b,
      cut.l,
      cut.b,
      cut.l,
      cut.t,
    ];

    if (JSON.stringify(this.vPosition) === JSON.stringify(vPosition)) return;

    this.vPosition = vPosition;

    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT);

    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vPositionBuffer);
    this.ctx.bufferData(
      this.ctx.ARRAY_BUFFER,
      new Float32Array(this.vPosition),
      this.ctx.STATIC_DRAW
    );

    // Convert positions coordinates to UV coördinates
    this.vUV = this.vPosition.map(
      (p, i) =>
        ((i % 2 == 0 ? p : -p) + // Flip the y-axis of UV coördinates
          1) /
        2
    );

    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vUVBuffer);
    this.ctx.bufferData(
      this.ctx.ARRAY_BUFFER,
      new Float32Array(this.vUV),
      this.ctx.STATIC_DRAW
    );
  }

  clearRect() {
    this.invalidateShaderCache();

    if (this.shadow?.elem) {
      this.shadow.elem.width = 1;
    }

    if (this.ctx && !this.ctx.isContextLost() && this.program) {
      // Shadow
      this.ctx.activeTexture(this.ctx.TEXTURE0);
      this.ctx.texImage2D(
        this.ctx.TEXTURE_2D,
        0,
        this.ctx.RGBA,
        1,
        1,
        0,
        this.ctx.RGBA,
        this.ctx.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      // this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.ALPHA, this.ctx.ALPHA, this.ctx.UNSIGNED_BYTE, null)

      // Video textures
      for (let i = 0; i < this.projectorsTexture.length; i++) {
        this.ctx.activeTexture(this.ctx[`TEXTURE${i + 1}`]);
        this.ctx.texImage2D(
          this.ctx.TEXTURE_2D,
          0,
          this.ctx.RGBA,
          1,
          1,
          0,
          this.ctx.RGBA,
          this.ctx.UNSIGNED_BYTE,
          new Uint8Array([0, 0, 0, 255])
        );
        this.ctx.generateMipmap(this.ctx.TEXTURE_2D);
        // this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null)
      }

      this.ctx.clear(this.ctx.COLOR_BUFFER_BIT);
    }

    if (
      this.blurCtx &&
      (!this.blurCtx.isContextLost || !this.blurCtx.isContextLost())
    ) {
      this.blurCtx.clearRect(
        0,
        0,
        this.blurCanvas.width,
        this.blurCanvas.height
      );
    }
  }

  get ctxIsInvalid() {
    const invalid =
      !this.ctx ||
      this.ctx.isContextLost() ||
      !this.program ||
      !this.blurCtx ||
      (this.blurCtx.isContextLost && this.blurCtx.isContextLost());
    if (invalid && !this.ctxIsInvalidWarned && !this.program) {
      this.ctxIsInvalidWarned = true;
      console.log(`ProjectorWebGL context is lost`);
    }
    return invalid;
  }
}
