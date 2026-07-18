// scripts/rename-worker.js
const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), '.open-next', 'worker.js');
const targetPath = path.join(process.cwd(), '.open-next', '_worker.js');

if (fs.existsSync(workerPath)) {
  fs.renameSync(workerPath, targetPath);
  console.log('✅ Renamed worker.js to _worker.js');
} else {
  console.warn('⚠️ worker.js not found');
}