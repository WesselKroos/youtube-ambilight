import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import eslint from '@rollup/plugin-eslint';
import fs from 'fs';

const common = {
  context: 'window',
  plugins: [
    eslint(),
    resolve(),
    babel({
      babelHelpers: 'bundled',
      comments: false,
      sourceMaps: false,
      plugins: [
        ['@babel/plugin-proposal-class-properties', { loose: true }],
        '@babel/plugin-proposal-optional-chaining',
        [
          'babel-plugin-transform-replace-expressions',
          {
            replace: {
              'instrumentFetch()': 'window', // Removes Sentry iframe injection
              'getNativeFetchImplementation()': 'window.fetch', // Removes Sentry iframe injection
            },
          },
        ],
      ],
    }),
  ],
};

const scripts = [
  'background',
  'options',
  'content',
  'content-main',
  'injected',
];

export default scripts.map((script) =>
  Object.assign(
    {},
    {
      input: `./src/scripts/${script}.js`,
      output: {
        file: `./dist/scripts/${script}.js`,
        format: 'iife',
        intro: fs.readFileSync('./src/scripts/intros/console.js', 'utf8'),
      },
    },
    common
  )
);
