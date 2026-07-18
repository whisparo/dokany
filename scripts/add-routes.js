// scripts/add-routes.js
const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"], // ✅ جميع الطلبات تذهب إلى الـ Worker
  exclude: [
    "/_next/static/*",    // ✅ ملفات Next.js الثابتة
    "/images/*",          // ✅ مجلد الصور
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
    // ✅ لا حاجة لاستبعاد الامتدادات، Pages سيتعامل معها تلقائياً
  ]
};

const outputDir = path.join(process.cwd(), '.open-next');
const routesPath = path.join(outputDir, '_routes.json');
fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
console.log(`✅ _routes.json generated at ${routesPath}`);