const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: []
};

const outputDir = path.join(process.cwd(), '.open-next');

// في الجذر
fs.writeFileSync(path.join(outputDir, '_routes.json'), JSON.stringify(routes, null, 2));

// في functions/
const functionsDir = path.join(outputDir, 'functions');
if (!fs.existsSync(functionsDir)) fs.mkdirSync(functionsDir, { recursive: true });
fs.writeFileSync(path.join(functionsDir, '_routes.json'), JSON.stringify(routes, null, 2));

console.log('✅ _routes.json generated');