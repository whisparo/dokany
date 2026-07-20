const fs = require('fs');
const path = require('path');

// 1. تحديد المسارات الصحيحة الموجهة داخل مجلد assets
const openNextAssetsDir = path.join(process.cwd(), '.open-next', 'assets');
const staticSrc = path.join(process.cwd(), '.next', 'static');
const staticDest = path.join(openNextAssetsDir, '_next', 'static');

// 🚀 أ: ضمان وجود مجلد .open-next/assets
if (!fs.existsSync(openNextAssetsDir)) {
  fs.mkdirSync(openNextAssetsDir, { recursive: true });
}

// 🚀 ب: نسخ ملفات Next.js الثابتة للمكان الذي يقرأ منه Wrangler
if (fs.existsSync(staticSrc)) {
  if (!fs.existsSync(path.dirname(staticDest))) {
    fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  }
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log('✅ Copied static files directly to .open-next/assets/_next/static');
} else {
  console.warn('⚠️ .next/static not found!');
}

// 2. إنشاء _routes.json داخل مجلد assets مباشرة
const routes = {
  version: 1,
  include: ["/*"], // ✅ توجيه كافة الطلبات الديناميكية إلى الـ Worker
  exclude: [
    "/_next/static/*",
    "/images/*",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ]
};

const routesPath = path.join(openNextAssetsDir, '_routes.json');
fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
console.log(`✅ _routes.json successfully generated at: ${routesPath}`);