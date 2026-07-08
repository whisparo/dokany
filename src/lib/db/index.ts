// src/lib/db/index.ts

// 1. استورد الـ getDb والـ D1Transaction فقط من ملف db.ts
export { getDb, type D1Transaction, type DbInstance } from './db';

// 2. استورد الجداول (اللي إنت سميتها dbTables) من ملف db.ts
// وغيرنا الاسم هنا عشان الـ index.ts يصدّرها باسم schema للـ Next.js
export { dbTables as schema } from './db';

// 3. لو عندك ملف schema.ts تاني منفصل، سيب ده زي ما هو، لو مفيش، ممكن تستغنى عنه
export * from './schema';