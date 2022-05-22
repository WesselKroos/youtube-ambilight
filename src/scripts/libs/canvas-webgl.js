import AmbilightSentry, { AmbilightError } from './ambilight-sentry';
import { wrapErrorHandler } from './generic';

export class WebGLCanvas {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas._getContext = this.canvas.getContext;
    this.canvas.getContext = (type, options) => {
      if(type === '2d') {
        this.canvas.ctx = new WebGLContext(this.canvas, type, options);
      } else {
        this.canvas.ctx = this.canvas._getContext(type, options);
      }
      return this.canvas.ctx;
    }
    return this.canvas;
  }
}

export class WebGLOffscreenCanvas {
  constructor(width, height, setWarning) {
    this.setWarning = setWarning
    if(typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = width;
      this.canvas.height = height;
    }
    
    this.canvas._getContext = this.canvas.getContext;
    this.canvas.getContext = (type, options = {}) => {
      if(type === '2d') {
        this.canvas.ctx = new WebGLContext(this.canvas, type, options, this.setWarning);
      } else {
        this.canvas.ctx = this.canvas._getContext(type, options);
      }
      return this.canvas.ctx;
    }
    return this.canvas;
  }
}

export class WebGLContext {
  lostCount = 0

  constructor(canvas, type, options, setWarning) {
    this.setWarning = setWarning;
    this.canvas = canvas;
    this.canvas.addEventListener('webglcontextlost', wrapErrorHandler(function canvasWebGLContextLost(event) {
      event.preventDefault();
      this.lost = true
      this.lostCount++
      this.viewport = undefined
      this.scaleX = undefined
      this.scaleY = undefined
      console.warn(`Ambient light for YouTube™ | WebGLContext lost (${this.lostCount})`)
      this.setWebGLWarning('restore')
    }.bind(this)), false);
    this.canvas.addEventListener('webglcontextrestored', wrapErrorHandler(function canvasWebGLContextRestored() {
      if(this.lostCount >= 3) {
        console.error('Ambient light for YouTube™ | WebGLContext restore failed 3 times')
        this.setWebGLWarning('3 times restore')
        return
      }
      this.initCtx()
      if(this.ctx && !this.ctx.isContextLost()) {
        this.lost = false
        this.lostCount = 0
        this.setWarning('')
      } else {
        console.error(`Ambient light for YouTube™ | WebGLContext restore failed (${this.lostCount})`)
        this.setWebGLWarning('restore')
      }
    }.bind(this)), false);
    this.canvas.addEventListener('webglcontextcreationerror', wrapErrorHandler(function canvasWebGLContextCreationError(e) {
      this.webglcontextcreationerrors.push({
        message: e.statusMessage || '?',
        time: performance.now(),
        webGLVersion: this.webGLVersion
      })
    }.bind(this)), false);

    this.options = options;
    try {
      this.initCtx(options);
    } catch(ex) {
      this.setWebGLWarning('create', false)
      AmbilightSentry.captureExceptionWithDetails(ex)
      this.ctx = undefined
    }
  }

  setWebGLWarning(action = 'restore', reloadTip = true) {
    this.setWarning(`Failed to ${action} the WebGL renderer.${reloadTip ? '\nReload the page to try it again.' : ''}\nA possible workaround could be to turn off the "WebGL renderer" setting`)
  }

  webglcontextcreationerrors = []
  initCtx = () => {
    if(!this.ctx) {
      this.webglcontextcreationerrors = []

      const ctxOptions = {
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        alpha: false,
        depth: false,
        antialias: false,
        desynchronized: true,
        ...this.options
      }
      this.webGLVersion = 2
      this.ctx = this.canvas.getContext('webgl2', ctxOptions)
      if(!this.ctx) {
        this.webGLVersion = 1
        this.ctx = this.canvas.getContext('webgl', ctxOptions)
        if(!this.ctx) {
          this.webGLVersion = undefined

          const errors = this.webglcontextcreationerrors
          let lastErrorMessage;
          for(const i in errors) {
            const duplicate = (i > 0 && errors[i].message === lastErrorMessage)
            lastErrorMessage = errors[i].message
            if(duplicate) errors[i].message = '"'
          }

          throw new AmbilightError('WebGLContext creation failed', errors)
        }
      }
    }
    
    if(this.ctxIsInvalid) return

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
      uniform sampler2D sampler;
      
      void main(void) {
        gl_FragColor = texture2D(sampler, fUV);
      }
    `;
    var vertexShader = this.ctx.createShader(this.ctx.VERTEX_SHADER);
    var fragmentShader = this.ctx.createShader(this.ctx.FRAGMENT_SHADER);
    this.ctx.shaderSource(vertexShader, vertexShaderSrc);
    this.ctx.shaderSource(fragmentShader, fragmentShaderSrc);
    this.ctx.compileShader(vertexShader);
    this.ctx.compileShader(fragmentShader);
    if (!this.ctx.getShaderParameter(vertexShader, this.ctx.COMPILE_STATUS)) {
      throw new Error(`VertexShader COMPILE_STATUS: ${this.ctx.getShaderInfoLog(vertexShader)}`)
    }
    if (!this.ctx.getShaderParameter(fragmentShader, this.ctx.COMPILE_STATUS)) {
      throw new Error(`FragmentShader COMPILE_STATUS: ${this.ctx.getShaderInfoLog(fragmentShader)}`)
    }

    // Program
    var program = this.ctx.createProgram();
    this.ctx.attachShader(program, vertexShader);
    this.ctx.attachShader(program, fragmentShader);
    this.ctx.linkProgram(program);
    if (!this.ctx.getProgramParameter(program, this.ctx.LINK_STATUS)) {
      throw new Error(`Program LINK_STATUS: ${this.ctx.getProgramInfoLog(program)}`)
    }
    this.ctx.validateProgram(program);
    if(!this.ctx.getProgramParameter(program, this.ctx.VALIDATE_STATUS)) {
      throw new Error(`Program VALIDATE_STATUS: ${this.ctx.getProgramInfoLog(program)}`)
    }
    this.ctx.useProgram(program);

    // Buffers
    var vUVBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vUVBuffer);
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
      0, 1, 
      0, 0, 
      1, 0, 
      1, 1
    ]), this.ctx.STATIC_DRAW);
    var vUVLoc = this.ctx.getAttribLocation(program, 'vUV');
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
    var vPositionLoc = this.ctx.getAttribLocation(program, 'vPosition'); 
    this.ctx.vertexAttribPointer(vPositionLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vPositionLoc);

    this.texture = this.ctx.createTexture();
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.texture);
    this.ctx.pixelStorei(this.ctx.UNPACK_FLIP_Y_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
    if (this.webGLVersion == 1) {
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
    } else {
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAX_LEVEL, 8);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR_MIPMAP_LINEAR);
      this.ctx.hint(this.ctx.GENERATE_MIPMAP_HINT, this.ctx.NICEST);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.MIRRORED_REPEAT);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.MIRRORED_REPEAT);
    }
    const tfaExt = (
      this.ctx.getExtension('EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
      this.ctx.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    );
    if(tfaExt) {
      let max = this.ctx.getParameter(tfaExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, tfaExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, max));
    }
  }

  clearRect = (x, y, width, height) => {
    if(this.ctxIsInvalid) return
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT); // Or set preserveDrawingBuffer to false te always draw from a clear canvas
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
    if(this.ctxIsInvalid) return

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
    
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src)
    if(this.webGLVersion !== 1) {
      this.ctx.generateMipmap(this.ctx.TEXTURE_2D)
    }

    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null);
  }

  getImageDataBuffers = []
  getImageDataBuffersIndex = 0
  getImageData = (x = 0, y = 0, width = this.ctx.drawingBufferWidth, height = this.ctx.drawingBufferHeight) => {
    if(this.ctxIsInvalid) return

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
    const invalid = !this.ctx || this.ctx.isContextLost();
    if (invalid && !this.ctxIsInvalidWarned) {
      this.ctxIsInvalidWarned = true
      console.warn(`Ambient light for YouTube™ | WebGLContext is invalid: ${this.ctx ? 'Lost' : 'Is null'}`)
    }
    return invalid;
  }
}