// scripts/fix-build.mjs
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const manifestPath = join(process.cwd(), '.next', 'server', 'pages-manifest.json');

// تأكد من وجود المجلد
const dir = join(process.cwd(), '.next', 'server');
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// أنشئ الـ manifest المطلوب
const manifest = {
  '/_app': 'pages/_app.js',
  '/_document': 'pages/_document.js',
  '/_error': 'pages/_error.js',
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✅ Created pages-manifest.json');