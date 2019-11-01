import babel from 'rollup-plugin-babel'
import resolve from 'rollup-plugin-node-resolve'
import cleanup from 'rollup-plugin-cleanup'

var config =
{
   input:  './src/scripts/youtube-ambilight/index.js',
   output:  { 
    file: './dist/scripts/youtube-ambilight.js',
    format: 'iife',
    globals: {},
  },
  context: 'window',
  plugins: [
    resolve(),
    babel({
      exclude: 'node_modules/**'
    }),
    cleanup()
  ]
}

export default config;