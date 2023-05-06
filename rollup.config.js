import resolve from '@rollup/plugin-node-resolve'
import stripCode from "rollup-plugin-strip-code"
import babel from '@rollup/plugin-babel'

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
      babelHelpers: 'bundled',
      comments: false,
      sourceMaps: false,
      plugins: [
        ['@babel/plugin-proposal-class-properties', { loose: true }],
        '@babel/plugin-proposal-optional-chaining'
      ],
    })
  ]
}

const scripts = ['background', 'options', 'content', 'injected']

export default scripts.map(script => Object.assign({}, {
  input:  `./src/scripts/${script}.js`,
  output:  { 
   file: `./dist/scripts/${script}.js`,
   format: 'iife'
 }
}, common))