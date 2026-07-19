// src/lib/db/db.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { schema } from './index';

// ✅ النوع اللي بنتعامل معاه
type EnvWithDB = {
  DB: D1Database;
};

// ✅ دالة واضحة وبدون any (تقبل أي object فيه خاصية DB)
export function getDb(env: EnvWithDB): ReturnType<typeof drizzle> {
  return drizzle(env.DB, { schema });
}

// ✅ دالة مساعدة للبيئات المختلفة (مع أي للاستخدام الداخلي)
export function getDbSafe(env?: any) {
  const db = env?.DB 
    ?? (globalThis as any).env?.DB 
    ?? process.env.DB;

  if (!db) {
    throw new Error('❌ D1 Database binding not found');
  }

  return drizzle(db, { schema });
}