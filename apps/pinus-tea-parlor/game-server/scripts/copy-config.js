const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'config');
const dest = path.join(__dirname, '..', 'dist', 'config');

function copyDir(s, d) {
  if (!fs.existsSync(s)) return;
  fs.mkdirSync(d, { recursive: true });
  for (const name of fs.readdirSync(s)) {
    const sp = path.join(s, name);
    const dp = path.join(d, name);
    if (fs.statSync(sp).isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

copyDir(src, dest);
console.log('[copy-config] ok -> dist/config');
