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

const youtubeAmbilight = {
   input:  './src/scripts/youtube-ambilight.js',
   output:  { 
    file: './dist/scripts/youtube-ambilight.js',
    format: 'iife',
    globals: {},
  }
}

export default [
  Object.assign({}, background, common),
  Object.assign({}, youtubeAmbilight, common)
]