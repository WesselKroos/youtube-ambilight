import ProjectorShadow from './projector-shadow'

export default class ProjectorWebGL {
  levels = 1
  scales = [{ x: 1, y: 1}]

  constructor(containerElem) {
    this.containerElem = containerElem

    this.canvas = document.createElement('canvas')
    this.canvas.classList.add('ambilight__projector')

    this.blurCanvas = document.createElement('canvas')
    this.blurCanvas.classList.add('ambilight__projector')
    this.containerElem.prepend(this.blurCanvas)
    this.boundaryElem = this.blurCanvas
    this.blurCtx = this.blurCanvas.getContext('2d', {
      alpha: true,
      desynchronized: false
    });

    this.ctx = this.canvas.getContext('webgl2', {
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
      alpha: true,
      desynchronized: true
    });

    this.projectors = [{
      elem: this.canvas,
      ctx: this.ctx
    }]

    this.shadow = new ProjectorShadow()
    
    this.initCtx()
  }

  remove() {
    this.containerElem.remove(this.canvas)
  }

  recreate(levels) {
    this.levels = levels
  }

  // TODO: Cut off left, top and right canvas outside the browser + blur size
  resize(width, height) {
    this.width = width
    this.height = height
  }

  rescale(scales, lastScale, projectorSize, settings) {
    try {
      this.shadow.rescale(lastScale, projectorSize, settings)

      this.scale = scales[scales.length - 1]
      const width = Math.floor(this.width * this.scale.x)
      const height = Math.floor(this.height * this.scale.y)
      const blurPx = Math.round(settings.blur * (this.height / 512) * 1.275)
      this.blurBound = blurPx * 2.64;
      this.blurCanvas.style.transform = `scale(${this.scale.x + ((this.blurBound * 2) / this.width)}, ${this.scale.y + ((this.blurBound * 2) / this.height)})`

      // Todo: Cut in half when above a certain size
      this.canvas.width = width
      this.blurCanvas.width = width + this.blurBound * 2
      this.canvas.height = height
      this.blurCanvas.height = height + this.blurBound * 2

      this.scales = scales.map(({x, y}) => ({
        x: this.scale.x / x,
        y: this.scale.y / y
      }))

      this.updateCtx()

      this.blurCtx.filter = `blur(${blurPx}px)`
    } catch(ex) {
      console.warn(ex)
    }
  }

  draw(src) {
    this.drawImage(src)
  }

  drawImage = (src, srcX, srcY, srcWidth, srcHeight, destX, destY, destWidth, destHeight) => {
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, src);
    this.ctx.drawArrays(this.ctx.TRIANGLE_FAN, 0, 4);

    this.blurCtx.clearRect(0, 0, this.blurCanvas.width, this.blurCanvas.height);
    this.blurCtx.drawImage(this.canvas, this.blurBound, this.blurBound);
  }

  initCtx() {
    // Program
    this.program = this.ctx.createProgram();

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
    if (!this.ctx.getShaderParameter(vertexShader, this.ctx.COMPILE_STATUS)) {
      console.error('vertexShader', this.ctx.getShaderInfoLog(vertexShader));
      return;
    }
    this.ctx.attachShader(this.program, vertexShader);

    this.updateCtx()
  }

  updateCtx() {
    if (this.fragmentShader) {
      this.ctx.detachShader(this.program, this.fragmentShader);
    }

    // Todo: Replace for loop with a direct [x,y] to scale conversion (GPU 65% -> 45%)
    const fragmentShaderSrc = `
      precision lowp float;
      varying vec2 fUV;
      uniform sampler2D ambilightSampler;
      uniform sampler2D shadowSampler;
      uniform vec2 fScales[${this.scales.length}];
      uniform vec2 fScalesMinus[${this.scales.length}];
      uniform vec4 fBorderColor;
    
      vec4 multiTexture(sampler2D sampler, vec2 uv) {
        for (int i = 0; i < ${this.scales.length}; i++) {
          vec2 scaledUV = vec2(
            uv[0] * fScales[i][0] - fScalesMinus[i][0],
            uv[1] * fScales[i][1] - fScalesMinus[i][1]
          );
          if (
            scaledUV[0] > 0. && scaledUV[0] < 1. &&
            scaledUV[1] > 0. && scaledUV[1] < 1.
          ) {
            return texture2D(sampler, scaledUV);
          }
        }
        return fBorderColor;
      }
      
      void main(void) {
        vec4 ambilight = multiTexture(ambilightSampler, fUV);
        float shadowAlpha = texture2D(shadowSampler, fUV).a;
        ambilight[3] = 1. - shadowAlpha;
        gl_FragColor = ambilight;
      }
    `;
    const fragmentShader = this.ctx.createShader(this.ctx.FRAGMENT_SHADER);
    this.ctx.shaderSource(fragmentShader, fragmentShaderSrc);
    this.ctx.compileShader(fragmentShader);
    if (!this.ctx.getShaderParameter(fragmentShader, this.ctx.COMPILE_STATUS)) {
      console.error('fragmentShader', this.ctx.getShaderInfoLog(fragmentShader));
      return;
    }
    this.ctx.attachShader(this.program, fragmentShader);
    this.fragmentShader = fragmentShader;
    
    this.ctx.linkProgram(this.program);
    if (!this.ctx.getProgramParameter(this.program, this.ctx.LINK_STATUS)) {
      console.error('program', this.ctx.getProgramInfoLog(this.program));
      return;
    }
    this.ctx.validateProgram(this.program);
    if( !this.ctx.getProgramParameter(this.program, this.ctx.VALIDATE_STATUS)) {
      console.error('program', this.ctx.getProgramInfoLog(this.program));
      return;
    }
    this.ctx.useProgram(this.program);

    // Buffers
    const vUVBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vUVBuffer);
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
      0, 1, 
      0, 0, 
      1, 0, 
      1, 1
    ]), this.ctx.STATIC_DRAW);
    const vUVLoc = this.ctx.getAttribLocation(this.program, 'vUV');
    this.ctx.vertexAttribPointer(vUVLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vUVLoc);

    const vPositionBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vPositionBuffer);
    this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array([
      -1, 1, 
      -1, -1, 
      1, -1, 
      1, 1
    ]), this.ctx.STATIC_DRAW);
    const vPositionLoc = this.ctx.getAttribLocation(this.program, 'vPosition'); 
    this.ctx.vertexAttribPointer(vPositionLoc, 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.ctx.enableVertexAttribArray(vPositionLoc);
      
    const fBorderColorLoc = this.ctx.getUniformLocation(this.program, 'fBorderColor');
    const borderColor = new Float32Array([0, 0, 0, 0]);
    this.ctx.uniform4fv(fBorderColorLoc, borderColor);
    
    const fScalesLoc = this.ctx.getUniformLocation(this.program, 'fScales');
    const fScales = new Float32Array(this.scales.map(({ x, y }) => [x, y]).flat());
    this.ctx.uniform2fv(fScalesLoc, fScales);

    const fScalesMinusLoc = this.ctx.getUniformLocation(this.program, 'fScalesMinus');
    const fScalesMinus = new Float32Array(this.scales.map(({ x, y }) => [((x - 1) / 2), ((y - 1) / 2)]).flat());
    this.ctx.uniform2fv(fScalesMinusLoc, fScalesMinus);

    const shadowSamplerLoc = this.ctx.getUniformLocation(this.program, "shadowSampler");
    this.ctx.uniform1i(shadowSamplerLoc, 0);

    const ambilightSamplerLoc = this.ctx.getUniformLocation(this.program, "ambilightSampler");
    this.ctx.uniform1i(ambilightSamplerLoc, 1);

    // Textures
    this.shadowTexture = this.ctx.createTexture();
    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.shadowTexture);
    this.ctx.pixelStorei(this.ctx.UNPACK_FLIP_Y_WEBGL, true);
    //this.ctx.pixelStorei(this.ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);
    this.ctx.texImage2D(this.ctx.TEXTURE_2D, 0, this.ctx.RGBA, this.ctx.RGBA, this.ctx.UNSIGNED_BYTE, this.shadow.elem);

    this.projectorsTexture = this.ctx.createTexture();
    this.ctx.activeTexture(this.ctx.TEXTURE1);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.projectorsTexture);
    this.ctx.pixelStorei(this.ctx.UNPACK_FLIP_Y_WEBGL, true);
    //this.ctx.pixelStorei(this.ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.MIRRORED_REPEAT);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.MIRRORED_REPEAT);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
    this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MAG_FILTER, this.ctx.LINEAR);

    if (!this.viewport || this.viewport.x !== 0 || this.viewport.y !== 0 || this.viewport.width !== this.ctx.drawingBufferWidth || this.viewport.height !== this.ctx.drawingBufferHeight) {
      this.viewport = { x: 0, y: 0, width: this.ctx.drawingBufferWidth, height: this.ctx.drawingBufferHeight };
      this.ctx.viewport(0, 0, this.ctx.drawingBufferWidth, this.ctx.drawingBufferHeight);
    }
  }

  clearRect () {
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT); // Or set preserveDrawingBuffer to false te always draw from a clear canvas
  }
}