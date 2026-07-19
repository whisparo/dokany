const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), '.open-next', 'worker.js');
const targetPath = path.join(process.cwd(), '.open-next', '_worker.js');

// إذا كان الملف موجوداً بالفعل باسم _worker.js، لا تفعل شيئاً
if (fs.existsSync(targetPath)) {
  console.log('✅ _worker.js already exists, skipping rename.');
} else if (fs.existsSync(workerPath)) {
  fs.renameSync(workerPath, targetPath);
  console.log('✅ Renamed worker.js to _worker.js');
} else {
  console.error('❌ worker.js not found. Build may have failed.');
  process.exit(1); // فشل البناء
}