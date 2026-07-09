// scripts/add-routes.js
const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: []
};

// 🎯 التعديل السنيور: المسار المباشر جوه مجلد .open-next الرئيسي
const outputDir = path.join(process.cwd(), '.open-next');
const routesPath = path.join(outputDir, '_routes.json');

// تأكد من وجود المجلد الرئيسي
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// اكتب الملف مباشرة في الـ Root
fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));

console.log(`✅ _routes.json generated directly in .open-next Root!`);