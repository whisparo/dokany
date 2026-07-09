// scripts/add-routes.js
const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: []
};

const outputDir = path.join(process.cwd(), '.open-next');
const routesPath = path.join(outputDir, '_routes.json');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
console.log('✅ _routes.json generated successfully in .open-next');