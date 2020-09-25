import babel from 'rollup-plugin-babel'
import resolve from 'rollup-plugin-node-resolve'
import cleanup from 'rollup-plugin-cleanup'

const common = {
  context: 'window',
  plugins: [
    resolve(),
    babel({
      exclude: 'node_modules/**'
    }),
    cleanup({
      comments: 'none',
      sourcemap: false
    })
  ]
}

const background = {
   input:  './src/scripts/background.js',
   output:  { 
    file: './dist/scripts/background.js',
    format: 'iife',
    globals: {},
  }
}

const content = {
   input:  './src/scripts/content.js',
   output:  { 
    file: './dist/scripts/content.js',
    format: 'iife',
    globals: {},
  }
}

const youtubeAmbilight = {
   input:  './src/scripts/youtube-ambilight.js',
   output:  { 
    file: './dist/scripts/youtube-ambilight.js',
    format: 'iife',
    globals: {},
  }
}

const gpuJs = {
  input : './node_modules/gpu.js/dist/gpu-browser.js',
  output:  { 
   file: './dist/scripts/gpu-browser.js',
   format: 'iife',
   globals: {},
 }
}

export default [
  Object.assign({}, background, common),
  Object.assign({}, content, common),
  Object.assign({}, youtubeAmbilight, common),
  Object.assign({}, gpuJs, common)
]