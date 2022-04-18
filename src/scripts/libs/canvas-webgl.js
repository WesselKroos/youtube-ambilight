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
  constructor(width, height) {
    if(typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = width;
      this.canvas.height = height;
    }
    
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

export class WebGLContext {
  lostCount = 0

  constructor(canvas, type, options = {}) {
    this.canvas = canvas;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true
      this.lostCount++
      this.viewport = undefined
      this.scaleX = undefined
      this.scaleY = undefined
      console.error(`Ambient light for YouTube™ | Canvas ctx lost (${this.lostCount})`)
    }, false);
    this.canvas.addEventListener("webglcontextrestored", () => {
      console.error(`Ambient light for YouTube™ | Canvas ctx restoring (${this.lostCount})`)
      if(this.lostCount >= 3) {
        console.error('Ambient light for YouTube™ | WebGL crashed 3 times. Stopped re-initializing WebGL.')
        return
      }
      this.initCtx()
      if(this.ctx && !this.ctx.isContextLost()) {
        this.lost = false
        console.error(`Ambient light for YouTube™ | Canvas ctx restored (${this.lostCount})`)
      } else {
        console.error(`Ambient light for YouTube™ | Canvas ctx restore failed (${this.lostCount})`)
      }
    }, false);

    this.options = options;
    this.initCtx(options);
  }

  initCtx = () => {
    const ctxOptions = {
      failIfMajorPerformanceCaveat: true,
      preserveDrawingBuffer: false,
      alpha: false,
      depth: false,
      antialias: false,
      desynchronized: true,
      ...this.options
    }
    this.ctx = this.canvas.getContext('webgl2', ctxOptions);
    if(this.ctx) {
      this.webGLVersion = 2
    } else {
      this.ctx = this.canvas.getContext('webgl', ctxOptions);
      if(this.ctx) {
        this.webGLVersion = 1
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
      console.error('vertexShader', this.ctx.getShaderInfoLog(vertexShader));
      return;
    }
    if (!this.ctx.getShaderParameter(fragmentShader, this.ctx.COMPILE_STATUS)) {
      console.error('fragmentShader', this.ctx.getShaderInfoLog(fragmentShader));
      return;
    }

    // Program
    var program = this.ctx.createProgram();
    this.ctx.attachShader(program, vertexShader);
    this.ctx.attachShader(program, fragmentShader);
    this.ctx.linkProgram(program);
    if (!this.ctx.getProgramParameter(program, this.ctx.LINK_STATUS)) {
      console.error('program', this.ctx.getProgramInfoLog(program));
      return;
    }
    this.ctx.validateProgram(program);
    if( !this.ctx.getProgramParameter(program, this.ctx.VALIDATE_STATUS)) {
      console.error('program', this.ctx.getProgramInfoLog(program));
      return;
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
    //this.ctx.pixelStorei(this.ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
    if (this.webGLVersion == 1) {
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
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

    srcWidth = srcWidth || src.videoWidth || src.width
    srcHeight = srcHeight || src.videoHeight || src.height
    destWidth = destWidth || this.ctx.drawingBufferWidth
    destHeight = destHeight || this.ctx.drawingBufferHeight
    
    // Fill texture
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);

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

    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null);
  }

  getImageDataBuffers = []
  getImageDataBuffersIndex = 0
  getImageData = (x = 0, y = 0, width = this.ctx.drawingBufferWidth, height = this.ctx.drawingBufferHeight) => {
    if(this.ctxIsInvalid) return

    // Enough for 5 ImageData objects for the blackbar detection
    if(this.getImageDataBuffersIndex > 4) {
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
      console.warn(`Ambient light for YouTube™ | Invalid Canvas ctx: ${this.ctx ? 'Lost' : 'Is null'}`)
    }
    // if(this.ctx && this.ctx.isContextLost() && this.lostCount < 3) {
    //   console.warn(`Ambient light for YouTube™ | Restoring context try ${this.lostCount}`)
    //   this.initCtx()
    //   if(this.ctx || this.ctx.isContextLost()) {
    //     this.lostCount++
    //   } else {
    //     console.warn(`Ambient light for YouTube™ | Restored in ${this.lostCount} tries`)
    //     this.lost = false
    //     return false
    //   }
    // }
    return invalid;
  }
}