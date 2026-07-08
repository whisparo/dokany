// src/lib/db/db.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { schema } from './index'; // ✅ استيراد الـ schema الشامل من الملف الرئيسي

/**
 * جلب كائن الداتابيز (Drizzle Instance) بشكل آمن ومتوافق مع أي Bindings
 */
export function getDb(env: { DB: D1Database } & Record<string, unknown>) {
  // ✅ نمرر schema كامل (جميع الجداول) بدلاً من authSchema فقط
  return drizzle(env.DB, { schema });
}

// ✅ نوع كائن الـ Database المرتجع للاستخدام في الأماكن الأخرى
export type DbInstance = ReturnType<typeof getDb>;

/**
 * ✅ استخراج نوع المعاملة (Transaction) بشكل ديناميكي وصارم 100%
 */
export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];

// 🛡️ احتفظنا بـ dbTables (لكن الآن أصبح يعكس كل الجداول)
// حتى لا نكسر أي ملف كان يستخدمه (نادراً)، لكن يمكن إزالته إن لم يُستخدم.
export const dbTables = schema;