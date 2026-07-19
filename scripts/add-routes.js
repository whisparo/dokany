const fs = require('fs');
const path = require('path');

// 1. نسخ الملفات الثابتة
const staticSrc = path.join(process.cwd(), '.next', 'static');
const staticDest = path.join(process.cwd(), '.open-next', '_next', 'static');

if (fs.existsSync(staticSrc)) {
  if (!fs.existsSync(path.dirname(staticDest))) {
    fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  }
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log('✅ Copied static files to .open-next/_next/static');
} else {
  console.warn('⚠️ .next/static not found');
}

// 2. إنشاء _routes.json بدون تداخل
const routes = {
  version: 1,
  include: ["/*"],  // ✅ كافٍ لتوجيه كل الطلبات للـ Worker
  exclude: [
    "/_next/static/*",
    "/images/*",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ]
};

const outputDir = path.join(process.cwd(), '.open-next');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const routesPath = path.join(outputDir, '_routes.json');
fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
console.log(`✅ _routes.json generated at ${routesPath}`);