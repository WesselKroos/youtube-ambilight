import babel from 'rollup-plugin-babel'
import resolve from 'rollup-plugin-node-resolve'
import cleanup from 'rollup-plugin-cleanup'
import stripCode from "rollup-plugin-strip-code"

const common = {
  context: 'window',
  plugins: [
    resolve(),
    babel({
      exclude: 'node_modules/**'
    }),
    stripCode({
      pattern: /var script = document\.createElement\('script'\);(.*?)appendChild\(script\);/gs // Removes Sentry script injection
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
    format: 'iife'
  }
}

const content = {
   input:  './src/scripts/content.js',
   output:  { 
    file: './dist/scripts/content.js',
    format: 'iife'
  }
}

const youtubeAmbilight = {
   input:  './src/scripts/youtube-ambilight.js',
   output:  { 
    file: './dist/scripts/youtube-ambilight.js',
    format: 'iife'
  }
}

export default [
  Object.assign({}, background, common),
  Object.assign({}, content, common),
  Object.assign({}, youtubeAmbilight, common)
]