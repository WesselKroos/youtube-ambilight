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
      this.viewport = undefined
      this.scaleX = undefined
      this.scaleY = undefined
      this.lost = true
      this.lostCount++
    }, false);
    this.canvas.addEventListener("webglcontextrestored", () => {
      if(this.lostCount >= 3) {
        console.error('Ambient light for YouTube™ | WebGL crashed 3 times. Stopped re-initializing WebGL.')
        return
      }
      this.initCtx()
      this.lost = false
    }, false);

    this.options = options;
    this.initCtx(options);
  }

  initCtx = () => {
    const ctxOptions = {
      preserveDrawingBuffer: false,
      alpha: false,
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

    // Frame 1
    this.frame1Texture = this.createTexture()
    this.frame1Buffer = this.ctx.createFramebuffer();

    // Frame 2
    this.frame2Texture = this.createTexture()
    this.frame2Buffer = this.ctx.createFramebuffer();
  }

  createTexture() {
    const texture = this.ctx.createTexture();
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, texture);
    this.ctx.pixelStorei(this.ctx.UNPACK_FLIP_Y_WEBGL, true);
    //this.ctx.pixelStorei(this.ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
    if (this.webGLVersion == 1) {
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
      this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
    }
    return texture;
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
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame2Texture);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);

    // Crop black bars
    const scaleX = 1 + (srcX / srcWidth) * 2
    const scaleY = 1 + (srcY / srcHeight) * 2
    if (scaleX !== this.scaleX || scaleY !== this.scaleY) {
      this.ctx.bufferData(this.ctx.ARRAY_BUFFER, this.getCachedScale(scaleX, scaleY), this.ctx.STATIC_DRAW);

      this.scaleX = scaleX
      this.scaleY = scaleY
    }

    if(this.options.antialiasing) {
      // Resize frame1Buffer
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame1Texture);
      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, destWidth * 4, destHeight * 4, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null);
      
      // Set render buffer to frame1Texture with frame1Buffer
      this.ctx.bindFramebuffer(this.ctx.FRAMEBUFFER, this.frame1Buffer);
      this.ctx.framebufferTexture2D(this.ctx.FRAMEBUFFER, this.ctx.COLOR_ATTACHMENT0, this.ctx.TEXTURE_2D, this.frame1Texture, 0);
      
      // Render frame2Texture to frame1Texture
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame2Texture);
      this.ctx.viewport(0, 0, destWidth * 4, destHeight * 4);
      this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);
      

      // Reset texture scaling
      if (1 !== this.scaleX || 1 !== this.scaleY) {
        this.ctx.bufferData(this.ctx.ARRAY_BUFFER, this.defaultScale, this.ctx.STATIC_DRAW);

        this.scaleX = 1
        this.scaleY = 1
      }


      // Resize frame2Buffer
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame2Texture);
      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, destWidth * 2, destHeight * 2, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null);
      
      // Set render buffer to frame2Texture with frame2Buffer
      this.ctx.bindFramebuffer(this.ctx.FRAMEBUFFER, this.frame2Buffer);
      this.ctx.framebufferTexture2D(this.ctx.FRAMEBUFFER, this.ctx.COLOR_ATTACHMENT0, this.ctx.TEXTURE_2D, this.frame2Texture, 0);
      
      // Render frame1Texture to frame2Texture
      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame1Texture);
      this.ctx.viewport(0, 0, destWidth * 2, destHeight * 2);
      this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);

      this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null); // clear frame1Texture

      this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.frame2Texture);
    }

    // Render to canvas
    this.ctx.bindFramebuffer(this.ctx.FRAMEBUFFER, null);
    this.ctx.viewport(0, 0, destWidth, destHeight);
    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);

    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, 1, 1, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, null); // clear frame2Texture
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
      console.warn(`Ambient light for YouTube™ | ${this.ctx ? 'ContextLost' : 'Context is null'}`)
    }
    return invalid;
  }
}