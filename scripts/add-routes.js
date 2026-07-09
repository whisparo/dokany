const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: []
};

const outputDir = path.join(process.cwd(), '.open-next');

// 1. في الجذر
const rootRoutesPath = path.join(outputDir, '_routes.json');
fs.writeFileSync(rootRoutesPath, JSON.stringify(routes, null, 2));
console.log(`✅ _routes.json at ${rootRoutesPath}`);

// 2. في مجلد functions (للأمان)
const functionsDir = path.join(outputDir, 'functions');
if (!fs.existsSync(functionsDir)) {
  fs.mkdirSync(functionsDir, { recursive: true });
}
const functionsRoutesPath = path.join(functionsDir, '_routes.json');
fs.writeFileSync(functionsRoutesPath, JSON.stringify(routes, null, 2));
console.log(`✅ _routes.json at ${functionsRoutesPath}`);