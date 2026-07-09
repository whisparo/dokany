// scripts/add-routes.js
const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: []
};

const outputDir = path.join(process.cwd(), '.open-next');
// ✅ Pages بتدور على _routes.json في مجلد functions
const functionsDir = path.join(outputDir, 'functions');

// تأكد من وجود المجلد
if (!fs.existsSync(functionsDir)) {
  fs.mkdirSync(functionsDir, { recursive: true });
}

// اكتب الملف في المسار الصحيح
const routesPath = path.join(functionsDir, '_routes.json');
fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));

console.log(`✅ _routes.json generated at ${routesPath}`);