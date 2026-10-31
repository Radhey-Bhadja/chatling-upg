const fs = require('fs');
const path = require('path');

console.log('==> Building Chatling static distribution...');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy static assets from root to public
const files = ['index.html', 'logo.png'];
for (const file of files) {
  const src = path.join(__dirname, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> public/${file}`);
  }
}

const dirs = ['css', 'js'];
for (const dir of dirs) {
  const src = path.join(__dirname, dir);
  const dest = path.join(publicDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir}/ -> public/${dir}/`);
  }
}

console.log('==> Build completed successfully! Ready for Vercel deployment.');
