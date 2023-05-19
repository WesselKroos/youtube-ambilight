import { AmbientlightError } from './sentry-reporter';
import { ctxOptions, requestIdleCallback, wrapErrorHandler } from './generic';

// export class WebGLCanvas {
//   constructor(width, height) {
//     this.canvas = document.createElement('canvas');
//     this.canvas.width = width;
//     this.canvas.height = height;
//     this.canvas._getContext = this.canvas.getContext;
//     this.canvas.getContext = async (type, options) => {
//       if(type === '2d') {
//         this.canvas.ctx = this.ctx = this.ctx || await new WebGLContext(this.canvas, type, options);
//       } else {
//         this.canvas.ctx = this.ctx = this.canvas._getContext(type, options);
//       }
//       return this.ctx;
//     }
//     return this.canvas;
//   }
// }

export class WebGLOffscreenCanvas {
  constructor(width, height, ambientlight, settings) {
    if(typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = width;
      this.canvas.height = height;
    }
    
    this.canvas._getContext = this.canvas.getContext;
    this.canvas.getContext = async (type, options = {}) => {
      if(type === '2d') {
        this.canvas.ctx = this.ctx = this.canvas.ctx || await new WebGLContext(this.canvas, type, options, ambientlight, settings);
      } else {
        this.canvas.ctx = this.ctx = this.canvas._getContext(type, options);
      }
      return this.ctx;
    }
    return this.canvas;
  }
}

export class WebGLContext {
  lostCount = 0

  constructor(canvas, type, options, ambientlight, settings) {
    return (async function WebGLContextConstructor() {
      this.ambientlight = ambientlight
      this.settings = settings
      this.setWarning = settings.setWarning
      this.canvas = canvas
      this.canvas.addEventListener('webglcontextlost', wrapErrorHandler(function webGLContextLost(event) {
        event.preventDefault()

        this.lost = true
        this.lostCount++
        this.viewport = undefined
        this.scaleX = undefined
        this.scaleY = undefined
        this.program = undefined // Prevent warning: Cannot delete program from old context. in initCtx

        console.log(`Ambient light for YouTube™ | WebGLContext lost (${this.lostCount})`)
        this.setWebGLWarning('restore')
      }.bind(this)), false);
      this.canvas.addEventListener('webglcontextrestored', wrapErrorHandler(async function webGLContextRestored() {
        // console.log(`Ambient light for YouTube™ | WebGLContext restored (${this.lostCount})`)
        if(this.lostCount >= 3) {
          console.error('Ambient light for YouTube™ | WebGLContext was lost 3 times. The current restoration has been aborted to prevent an infinite restore loop.')
          this.setWebGLWarning('3 times restore')
          return
        }

        await new Promise(resolve => requestAnimationFrame(resolve))
        if(!(await this.initCtx())) return

        if(this.ctx && !this.ctx.isContextLost()) {
          this.lost = false
          if(!this.ambientlight.projector?.lost && !this.ambientlight.projector?.blurLost)
            this.setWarning('')
        } else {
          console.error(`Ambient light for YouTube™ | WebGLContext restore failed (${this.lostCount})`)
          this.setWebGLWarning('restore')
        }
      }.bind(this)), false);
      this.canvas.addEventListener('webglcontextcreationerror', wrapErrorHandler(function webGLContextCreationError(e) {
        // console.warn(`Ambient light for YouTube™ | WebGLContext creationerror: ${e.statusMessage}`)
        this.webglcontextcreationerrors.push({
          message: e.statusMessage || '?',
          time: performance.now(),
          webGLVersion: this.webGLVersion
        })
      }.bind(this)), false);

      this.options = options;
      await this.initCtx()
      this.initializedTime = performance.now()

      return this
    }.bind(this))()
  }

  setWebGLWarning(action = 'restore', reloadTip = true) {
    this.setWarning(`Failed to ${action} the WebGL renderer from a GPU crash.${reloadTip ? '\nReload the page to try it again.\nOr the memory on your GPU is in use by another process.' : ''}\nA possible workaround could be to turn off the "Quality" > "WebGL renderer" setting (This is an advanced setting). But if you do so, know that the legacy renderer requires more power.`)
  }

  webglcontextcreationerrors = []
  // syncCompilation prevents black flickering while settings are changed
  async initCtx(syncCompilation = false)  {
    if(this.program) {
      try {
        this.ctx.finish() // Wait for any pending draw calls to finish
        this.ctx.deleteProgram(this.program) // Free GPU memory
      } catch(ex) {
        console.warn('Ambient light for YouTube™ | Failed to delete previous WebGLContext program', ex)
      }
      this.program = undefined
    }

    if(!this.ctx) {
      this.ctxOptions = {
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        alpha: false,
        depth: false,
        antialias: false,
        desynchronized: true,
        ...this.options
      }
      this.webGLVersion = 2
      this.ctx = await this.canvas.getContext('webgl2', this.ctxOptions)
      if(!this.ctx) {
        this.webGLVersion = 1
        this.ctx = await this.canvas.getContext('webgl', this.ctxOptions)
        if(!this.ctx) {
          this.webGLVersion = undefined
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait for any additional webglcontextcreationerrors to be captured

          const errors = this.webglcontextcreationerrors
          this.webglcontextcreationerrors = []

          let lastErrorMessage = ''
          for(const error of errors) {
            const duplicate = error.message === lastErrorMessage
            lastErrorMessage = error.message
            if(duplicate) error.message = '"'
          }

          throw new AmbientlightError(`WebGLContext creation failed: ${lastErrorMessage}`, errors)
        }
      }
    }
    
    if(this.isContextLost()) return

    if ('drawingBufferColorSpace' in this.ctx && 'unpackColorSpace' in this.ctx) {
      this.ctx.drawingBufferColorSpace = ctxOptions.colorSpace
      // // unpacking to another color space seems to be way to expensive on the GPU - dropped support for now
      // this.ctx.unpackColorSpace = ctxOptions.extendedColorSpace === 'rec2020' ? 'srgb' : ctxOptions.colorSpace // Compensate when a rec2020 display is used to compensate the lack of rec2020 support in canvas
    }

    let flickerReductionDifference;
    if(this.settings.flickerReduction) {
      const easing = (x) => 1 - Math.sqrt(1 - Math.pow(x, 2));
      flickerReductionDifference = easing((100 - Math.min(99, 50 + (this.settings.flickerReduction / 2.4))) / 100);
    }

    // Shaders
    var vertexShaderSrc = `
      precision lowp float;
      attribute vec2 vPosition;
      attribute vec2 vUV;
      varying vec2 fUV;
      
      void main(void) {
        fUV = vUV;
        gl_Position = vec4(vPosition, 0, 1);
      }
    `;
    var fragmentShaderSrc = `
      precision lowp float;
      varying vec2 fUV;
      uniform sampler2D textureSampler[${this.settings.flickerReduction ? 2 : 1}];
      uniform float fMipmapLevel;
      ${this.settings.flickerReduction ? 'uniform float fPreviousCleared;' : ''}
      
      void main(void) {
        ${this.settings.flickerReduction ? `
          vec4 currentColor = texture2D(textureSampler[0], fUV${this.webGLVersion !== 1 ? ', fMipmapLevel' : ''});
          vec4 previousColor = texture2D(textureSampler[1], fUV${this.webGLVersion !== 1 ? ', fMipmapLevel' : ''});
          float percentage = 1.;
          if(fPreviousCleared < .5) {
            percentage = min(1.,
              ${flickerReductionDifference} / abs(
                (currentColor.r * .213 + currentColor.g * .715 + currentColor.b * .072) - 
                (previousColor.r * .213 + previousColor.g * .715 + previousColor.b * .072)
              )
            );
          } 
          gl_FragColor = currentColor * percentage + previousColor * (1. - percentage);
        ` : `
          gl_FragColor = texture2D(textureSampler[0], fUV${this.webGLVersion !== 1 ? ', fMipmapLevel' : ''});
        `}
      }
    `;
    var vertexShader = this.ctx.createShader(this.ctx.VERTEX_SHADER);
    var fragmentShader = this.ctx.createShader(this.ctx.FRAGMENT_SHADER);
    this.ctx.shaderSource(vertexShader, vertexShaderSrc);
    this.ctx.shaderSource(fragmentShader, fragmentShaderSrc);
    this.ctx.compileShader(vertexShader);
    this.ctx.compileShader(fragmentShader);

    // Program
    const program = this.ctx.createProgram();
    this.ctx.attachShader(program, vertexShader);
    this.ctx.attachShader(program, fragmentShader);
    this.ctx.linkProgram(program);
    
    const parallelShaderCompileExt = syncCompilation ? undefined : this.ctx.getExtension('KHR_parallel_shader_compile');
    if(parallelShaderCompileExt?.COMPLETION_STATUS_KHR) {
      // The first getProgramParameter COMPLETION_STATUS_KHR request returns always false on chromium and the return value seems to be cached between animation frames
      this.ctx.getProgramParameter(program, parallelShaderCompileExt.COMPLETION_STATUS_KHR)
      await new Promise(resolve => requestAnimationFrame(resolve))

      try {
        let compiled = false
        while(!compiled) {
          const completionStatus = this.ctx.getProgramParameter(program, parallelShaderCompileExt.COMPLETION_STATUS_KHR);
          // COMPLETION_STATUS_KHR can be null because of webgl-lint
          if(completionStatus === false) {
            await new Promise(resolve => requestIdleCallback(resolve, { timeout: 200 }))
            await new Promise(resolve => requestAnimationFrame(resolve))
          } else {
            compiled = true
          }
        }
        if(!compiled) return
      } catch(ex) {
        ex.details = {}

        try {
          ex.details = {
            program: program?.toString(),
            webGLVersion: this.webGLVersion,
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

        throw ex
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
    // this.ctx.validateProgram(program)
    // const programValidated = this.ctx.getProgramParameter(program, this.ctx.VALIDATE_STATUS)
    // if(!programValidated) {
    //   const programValidationError = new Error('Program validation failed')
    //   programValidationError.details = {}

    //   try {
    //     programValidationError.details = {
    //       vertexShaderInfoLog: this.ctx.getShaderInfoLog(vertexShader),
    //       fragmentShaderInfoLog: this.ctx.getShaderInfoLog(fragmentShader),
    //       programInfoLog: this.ctx.getProgramInfoLog(program)
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

    this.fMipmapLevelLoc = this.ctx.getUniformLocation(this.program, 'fMipmapLevel');

    // Buffers
    var vUVBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vUVBuffer);
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
      0, 0, 
      0, 1, 
      1, 1, 
      1, 0
    ]), this.ctx.STATIC_DRAW);
    var vUVLoc = this.ctx.getAttribLocation(this.program, 'vUV');
    this.ctx.vertexAttribPointer(vUVLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vUVLoc);

    var vPositionBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vPositionBuffer);
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
      -1, 1, 
      -1, -1, 
      1, -1, 
      1, 1
    ]), this.ctx.STATIC_DRAW);
    var vPositionLoc = this.ctx.getAttribLocation(this.program, 'vPosition'); 
    this.ctx.vertexAttribPointer(vPositionLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vPositionLoc);

    this.textures = [];
    for(let i = 0; i < (this.settings.flickerReduction ? 2 : 1); i++) {
      const texture = this.ctx.createTexture();
      this.ctx.activeTexture(this.ctx[`TEXTURE${i}`]);
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, texture);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
      if (this.webGLVersion == 1) {
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
      } else {
        this.ctx.hint(this.ctx.GENERATE_MIPMAP_HINT, this.ctx.NICEST);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAX_LEVEL, 8);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR_MIPMAP_LINEAR);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.MIRRORED_REPEAT);
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.MIRRORED_REPEAT);
      }
      const tfaExt = (
        this.ctx.getExtension('EXT_texture_filter_anisotropic') ||
        this.ctx.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
        this.ctx.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
      );
      if(tfaExt) {
        const max = this.ctx.getParameter(tfaExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
        this.ctx.texParameteri(this.ctx.TEXTURE_2D, tfaExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, max));
      }
      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      this.textures.push(texture);
    }
    this.ctx.activeTexture(this.ctx['TEXTURE0'])

    const textureSamplerLoc = this.ctx.getUniformLocation(this.program, 'textureSampler');
    this.ctx.uniform1iv(textureSamplerLoc, this.textures.map((_, i) => i));
    
    if(this.settings.flickerReduction) {
      this.fPreviousClearedLoc = this.ctx.getUniformLocation(this.program, 'fPreviousCleared');
      this.ctx.uniform1f(this.fPreviousClearedLoc, 1);
      this.fPreviousCleared = 1;
    } else {
      this.fPreviousClearedLoc = undefined
      this.fPreviousCleared = undefined
    }

    return true
  }

  clearRect = () => {
    if(this.ctxIsInvalid || this.lost) return
    
    this.ctx.activeTexture(this.ctx['TEXTURE0'])
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT); // Or set preserveDrawingBuffer to false te always draw from a clear canvas

    this.clearPreviousRect()
  }

  clearPreviousRect = () => {
    if(!this.settings.flickerReduction || !this.fPreviousClearedLoc || this.fPreviousCleared === 1) return

    this.ctx.activeTexture(this.ctx['TEXTURE1'])
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.ctx.activeTexture(this.ctx['TEXTURE0'])

    this.ctx.uniform1f(this.fPreviousClearedLoc, 1)
    this.fPreviousCleared = 1
  }

  defaultScale = new Float32Array([
    -1, 1, 
    -1, -1, 
    1, -1, 
    1, 1
  ])
  _cachedScale = new Float32Array([
    -1, 1, 
    -1, -1, 
    1, -1, 
    1, 1
  ])
  _cachedScaleX = 1
  _cachedScaleY = 1
  getCachedScale(x, y) {
    if(this._cachedScaleX !== x || this._cachedScaleY !== y) {
      this._cachedScale = new Float32Array([
        -x, y, 
        -x, -y, 
        x, -y, 
        x, y
      ])
      this._cachedScaleX = x
      this._cachedScaleY = y
    }
    return this._cachedScale
  }

  drawImage = (src, srcX, srcY, srcWidth, srcHeight, destX, destY, destWidth, destHeight) => {
    if(this.ctxIsInvalid || this.lost) return

    const internalFormat = this.ctx.RGBA;
    const format = this.ctx.RGBA;
    const formatType = this.ctx.UNSIGNED_BYTE;

    if(destX === undefined) {
      destX = srcX
      destY = srcY
      destWidth = srcWidth
      destHeight = srcHeight
      srcX = 0
      srcY = 0
      srcWidth = undefined
      srcHeight = undefined
    }

    srcWidth = srcWidth || src.videoWidth || src.width
    srcHeight = srcHeight || src.videoHeight || src.height
    destWidth = destWidth || this.ctx.drawingBufferWidth
    destHeight = destHeight || this.ctx.drawingBufferHeight

    // Crop src
    const scaleX = 1 + (srcX / srcWidth) * 2
    const scaleY = 1 + (srcY / srcHeight) * 2
    if (scaleX !== this.scaleX || scaleY !== this.scaleY) {
      this.ctx.bufferData(this.ctx.ARRAY_BUFFER, this.getCachedScale(scaleX, scaleY), this.ctx.STATIC_DRAW);
      this.scaleX = scaleX
      this.scaleY = scaleY
    }

    if (!this.viewport || this.viewport.width !== destWidth || this.viewport.height !== destHeight) {
      this.ctx.viewport(0, 0, destWidth, destHeight);
      this.viewport = { width: destWidth, height: destHeight };
    }
    
    const mipmapLevel = 1 // Math.max(0, (Math.log(srcHeight / destHeight) / Math.log(2)) - 2)
    if(mipmapLevel !== this.fMipmapLevel) {
      // console.log('video', mipmapLevel, `${srcHeight} -> ${destHeight}`)
      this.fMipmapLevel = mipmapLevel
      this.ctx.uniform1f(this.fMipmapLevelLoc, mipmapLevel);
    }
    
    let start = this.settings.showResolutions ? performance.now() : undefined
    // Chromium bug 1074473: Using texImage2D because texSubImage2D from a video element is 80x slower than texImage2D
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, internalFormat, format, formatType, src)

    // Don't generate mipmaps in WebGL1 because video resolutions are not a power of 2
    if(this.webGLVersion !== 1) {
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D)
    }
    if(this.settings.showResolutions) this.loadTime = performance.now() - start

    if(this.settings.showResolutions) start = performance.now()
    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4)

    if(this.settings.flickerReduction && this.fPreviousClearedLoc && this.fPreviousCleared === 1) {
      this.fPreviousCleared = 0
      this.ctx.uniform1f(this.fPreviousClearedLoc, 0)
    }

    if(this.settings.flickerReduction) {
      this.ctx.activeTexture(this.ctx['TEXTURE1'])
      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, internalFormat, format, formatType, this.canvas)
      if(this.webGLVersion !== 1) {
        this.ctx.generateMipmap(this.ctx.TEXTURE_2D)
      }
      this.ctx.activeTexture(this.ctx['TEXTURE0'])
    }

    if(this.settings.showResolutions) this.drawTime = performance.now() - start
  }

  getImageDataBuffers = []
  getImageDataBuffersIndex = 0
  getImageData = (x = 0, y = 0, width = this.ctx.drawingBufferWidth, height = this.ctx.drawingBufferHeight) => {
    if(this.ctxIsInvalid || this.lost) return

    // Enough for 10 ImageData objects for the blackbar detection
    if(this.getImageDataBuffersIndex > 9) {
      this.getImageDataBuffersIndex = 0;
    } else {
      this.getImageDataBuffersIndex++;
    }

    let buffer = this.getImageDataBuffers[this.getImageDataBuffersIndex];
    const bufferLength = width * height * 4;
    if (!buffer) {
      this.getImageDataBuffers[this.getImageDataBuffersIndex] = buffer = {
        data: new Uint8Array(bufferLength)
      };
    } else if(buffer.data.length !== bufferLength) {
      buffer.data = new Uint8Array(bufferLength)
    }

    buffer.width = width - x;
    buffer.height = height - y;
    this.ctx.readPixels(x, y, width, height, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, buffer.data);

    return buffer;
  }

  get ctxIsInvalid() {
    const invalid = this.isContextLost() || !this.program;
    if (invalid && !this.ctxIsInvalidWarned && !this.program) {
      this.ctxIsInvalidWarned = true
      console.log('Ambient light for YouTube™ | WebGLContext is lost')
    }
    return invalid;
  }

  isContextLost = () => {
    return !this.ctx || this.ctx.isContextLost();
  }
}