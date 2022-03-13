export class WebGLCanvas {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas._getContext = this.canvas.getContext;
    this.canvas.getContext = (type, options) => {
      if(type === '2d') {
        return new WebGLContext(this.canvas, type, options);
      } else {
        return this.canvas._getContext(type, options);
      }
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
        return new WebGLContext(this.canvas, type, options);
      } else {
        return this.canvas._getContext(type, options);
      }
    }
    return this.canvas;
  }
}

export class WebGLContext {
  constructor(canvas, type, options = {}) {
    this.canvas = canvas;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.viewport = undefined
      this.scaleX = undefined
      this.scaleY = undefined
    }, false);
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.initCtx()
    }, false);

    this.options = options;
    this.initCtx(options);
  }

  initCtx = () => {
    this.ctx = this.canvas._getContext('webgl2', { preserveDrawingBuffer: false, alpha: false, desynchronized: true, ...this.options });

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
    
    // Texture
    var texture = this.ctx.createTexture();
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, texture);
    this.ctx.pixelStorei(this.ctx.UNPACK_FLIP_Y_WEBGL, true);
    //this.ctx.pixelStorei(this.ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
  }

  clearRect = (x, y, width, height) => {
    if(this.ctx.isContextLost()) return
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT); // Or set preserveDrawingBuffer to false te always draw from a clear canvas
  }

  drawImage = (src, srcX, srcY, srcWidth, srcHeight, destX, destY, destWidth, destHeight) => {
    if(this.ctx.isContextLost()) return

    if (!this.viewport || this.viewport.width !== this.ctx.drawingBufferWidth || this.viewport.height !== this.ctx.drawingBufferHeight) {
      this.viewport = { width: this.ctx.drawingBufferWidth, height: this.ctx.drawingBufferHeight };
      this.ctx.viewport(0, 0, this.ctx.drawingBufferWidth, this.ctx.drawingBufferHeight);
    }

    // const ext = (
    //   this.ctx.getExtension('WEBGL_compressed_texture_s3tc') ||
    //   this.ctx.getExtension('MOZ_WEBGL_compressed_texture_s3tc') ||
    //   this.ctx.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc')
    // );
    // console.log(ext);
    // this.ctx.compressedTexImage2D(this.ctx.TEXTURE_2D, 0, ext.COMPRESSED_RGBA_S3TC_DXT5_EXT, this.ctx.drawingBufferWidth, this.ctx.drawingBufferHeight, 0, src);

    srcWidth = srcWidth || src.videoWidth || src.width
    srcHeight = srcHeight || src.videoHeight || src.height
    destWidth = destWidth || this.ctx.drawingBufferWidth
    destHeight = destHeight || this.ctx.drawingBufferHeight

    const scaleX = 1 + (srcX / srcWidth) * 2
    const scaleY = 1 + (srcY / srcHeight) * 2
    if (scaleX !== this.scaleX || scaleY !== this.scaleY) {
      this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
        -scaleX, scaleY, 
        -scaleX, -scaleY, 
        scaleX, -scaleY, 
        scaleX, scaleY
      ]), this.ctx.STATIC_DRAW);

      this.scaleX = scaleX
      this.scaleY = scaleY
    }

    // this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, width, height, 0, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);
    // this.ctx.texSubImage2D(this.ctx.TEXTURE_2D, 0, srcX, srcY, srcWidth, srcHeight, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);
    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);
  }

  getImageDataBuffers = []
  getImageDataBuffersIndex = 0
  getImageData = (x = 0, y = 0, width = this.ctx.drawingBufferWidth, height = this.ctx.drawingBufferHeight) => {
    if(this.ctx.isContextLost()) return

    if(this.getImageDataBuffersIndex > 4) {
      this.getImageDataBuffersIndex = 0;
    } else {
      this.getImageDataBuffersIndex++;
    }

    const buffer = this.getImageDataBuffers[this.getImageDataBuffersIndex];
    // if (!buffer || buffer.width !== width || buffer.height !== height) {
    //   buffer = new ImageData(width, height);
    // }
    const bufferLength = width * height * 4;
    if (buffer.length !== bufferLength) {
      buffer = new Uint8Array(bufferLength);
    }
    this.getImageDataBuffers[this.getImageDataBuffersIndex] = buffer

    this.ctx.readPixels(x, y, width, height, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, buffer);
    return buffer;
  }
}