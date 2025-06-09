import path from 'path';
import { renameSync, mkdirSync, readdirSync, copyFileSync } from 'fs';

function copyMapFiles(srcDir, destDir) {
  readdirSync(srcDir, { withFileTypes: true }).forEach((dirent) => {
    const srcPath = path.join(srcDir, dirent.name);
    const destPath = path.join(destDir, dirent.name);

    if (dirent.isDirectory()) {
      copyMapFiles(srcPath, destPath);
    } else if (dirent.isFile() && path.extname(dirent.name) === '.map') {
      mkdirSync(path.dirname(destPath), { recursive: true });
      renameSync(srcPath, destPath);
    } else if (dirent.isFile() && path.extname(dirent.name) === '.js') {
      mkdirSync(path.dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  });
}

copyMapFiles('dist', 'sourcemaps');
