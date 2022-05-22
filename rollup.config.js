import babel from '@rollup/plugin-babel'
import resolve from '@rollup/plugin-node-resolve'
import cleanup from 'rollup-plugin-cleanup'
import stripCode from "rollup-plugin-strip-code"

const common = {
  context: 'window',
  plugins: [
    resolve(),
    stripCode({
      pattern: /var script = global\.document\.createElement\('script'\);(.*?)appendChild\(script\);(.*?)\}/gs // Removes Sentry script injection
    }),
    stripCode({
      pattern: /var sandbox = doc(.*?)\.createElement\('iframe'\);(.*?)removeChild\(sandbox\);/gs // Removes Sentry iframe injection
    }),
    babel({
      exclude: 'node_modules/**',
      babelHelpers: 'bundled'
    }),
    cleanup({
      comments: 'none',
      sourcemap: false
    })
  ]
}

const scripts = ['background', 'options', 'content', 'youtube-ambilight']

export default scripts.map(script => Object.assign({}, {
  input:  `./src/scripts/${script}.js`,
  output:  { 
   file: `./dist/scripts/${script}.js`,
   format: 'iife'
 }
}, common))