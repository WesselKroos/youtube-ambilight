import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { replaceInFileSync } from 'replace-in-file';
import packageJson from './package.json' with { type: 'json' };

console.log('==> Building scripts (Rollup)...');
execSync('deno run -A npm:rollup -c', { stdio: 'inherit' });

console.log('==> Copying sourcemaps...');
if (existsSync('dist/scripts')) {
  import('./sourcemaps-copy.js');
}

console.log('==> Compiling styles...');
if (!existsSync('dist/styles')) mkdirSync('dist/styles', { recursive: true });
execSync('deno run -A npm:sass --no-source-map src/styles/content.scss dist/styles/content.css', { stdio: 'inherit' });
execSync('deno run -A npm:sass --no-source-map src/styles/live-chat.scss dist/styles/live-chat.css', { stdio: 'inherit' });
copyFileSync('src/styles/options.css', 'dist/styles/options.css');

console.log('==> Generating manifest.json...');
if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
copyFileSync('src/manifest.json', 'dist/manifest.json');
replaceInFileSync({
  files: 'dist/manifest.json',
  from: /"version": "0.0.0"/g,
  to: `"version": "${packageJson.version}"`,
});

console.log('==> Copying locales...');
if (existsSync('src/_locales')) {
  cpSync('src/_locales', 'dist/_locales', { recursive: true });
}

console.log('==> Copying HTML...');
copyFileSync('src/options.html', 'dist/options.html');

console.log('==> Copying images...');
if (existsSync('src/images')) {
  cpSync('src/images', 'dist/images', { recursive: true });
}

console.log('\n✅ Build completed successfully! Output in ./dist');
