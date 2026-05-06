const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const targetDir = path.join(rootDir, 'public', 'vendor', 'ffmpeg-core');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!fs.existsSync(sourceDir)) {
  const message = '@ffmpeg/core is not installed. Run npm install before building video-rendering assets.';
  if (process.env.npm_lifecycle_event === 'prebuild') {
    console.error(`[prebuild] ${message}`);
    process.exit(1);
  }
  console.warn(`[postinstall] ${message}`);
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}

console.log(`[postinstall] Copied FFmpeg core assets to ${path.relative(rootDir, targetDir)}`);
