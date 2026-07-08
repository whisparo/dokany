// src/lib/db/db.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as authSchema from './schema/users'; // ✅ استيراد سكيما المستخدمين والجلسات الموحدة مباشرة

// تجميع السكيمات في كائن واحد محلي للـ Drizzle دون تصديره كـ Global Type يضرب الـ Auth
const appSchema = {
  ...authSchema,
};

/**
 * جلب كائن الداتابيز (Drizzle Instance) بشكل آمن ومتوافق مع أي Bindings
 */
export function getDb(env: { DB: D1Database } & Record<string, unknown>) {
  // ✅ تمرير الـ appSchema محلياً للـ instance
  return drizzle(env.DB, { schema: appSchema });
}

// ✅ نوع كائن الـ Database المرتجع للاستخدام في الأماكن الأخرى
export type DbInstance = ReturnType<typeof getDb>;

/**
 * ✅ استخراج نوع المعاملة (Transaction) بشكل ديناميكي وصارم 100%
 */
export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];

// 🛡️ بدلاً من export { schema } التي تمرر الأنواع القديمة وتسبب التعارض:
// نصدر الجداول كـ كائنات مستقلة للـ Queries عند الحاجة
export const dbTables = authSchema;