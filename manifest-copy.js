import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { replaceInFileSync } from 'replace-in-file';
import packageJson from './package.json' with { type: 'json' };

const options = {
  files: 'dist/manifest.json',
  from: /"version": "0.0.0"/g,
  to: `"version": "${packageJson.version}"`,
}

if(!existsSync('dist')) mkdirSync('dist');
copyFileSync('src/manifest.json', options.files);
replaceInFileSync(options);
