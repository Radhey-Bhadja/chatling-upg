const fs = require('fs');
const path = require('path');

console.log('==> Building Chatling static distribution for Vercel...');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

// Ensure destination directories exist
['', 'css', 'js'].forEach(subDir => {
  const dirPath = path.join(publicDir, subDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Files to copy
const filesToCopy = [
  { src: 'index.html', dest: 'public/index.html' },
  { src: 'logo.png', dest: 'public/logo.png' },
  { src: 'css/styles.css', dest: 'public/css/styles.css' },
  { src: 'js/app.js', dest: 'public/js/app.js' },
  { src: 'js/socket.io.min.js', dest: 'public/js/socket.io.min.js' },
  { src: 'js/peerjs.min.js', dest: 'public/js/peerjs.min.js' }
];

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.join(rootDir, src);
  const destPath = path.join(rootDir, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} -> ${dest}`);
  }
});

console.log('==> Build completed successfully! 100% static distribution ready.');
