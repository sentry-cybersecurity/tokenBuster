const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../node_modules/@dqbd/tiktoken/tiktoken_bg.wasm');
const destDir = path.resolve(__dirname, '../public');
const dest = path.resolve(destDir, 'tiktoken_bg.wasm');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

fs.copyFileSync(source, dest);

