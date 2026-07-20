// src/lib/db/db.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { schema } from './index';

// ✅ إضافة index signature لمنع خطأ الـ Type Constraint
export interface EnvWithDb {
  DB: D1Database;
  [key: string]: unknown;
}

/**
 * جلب كائن قاعدة البيانات Drizzle
 * - يقبل تمرير env.DB صراحة (وهو النمط المستخدم في Auth و API routes)
 * - أو يقرأ من البيئة المحيطة (globalThis) بدون الحاجة لـ async/await
 */
export function getDb(env?: { DB?: D1Database } | { env?: { DB?: D1Database } }) {
  let dbBinding: D1Database | undefined;

  // 1. فحص إذا كان الممرر هو env مباشر أو كائن يحتوي على env
  if (env) {
    if ('DB' in env && env.DB) {
      dbBinding = env.DB;
    } else if ('env' in env && env.env?.DB) {
      dbBinding = env.env.DB;
    }
  }

  // 2. كحل احتياطي في بيئة Cloudflare Pages Worker (globalThis)
  if (!dbBinding && typeof globalThis !== 'undefined') {
    const globalEnv = (globalThis as unknown as { env?: EnvWithDb }).env;
    if (globalEnv?.DB) {
      dbBinding = globalEnv.DB;
    }
  }

  // 3. كحل احتياطي من process.env (للتطوير المحلي / Drizzle Studio)
  if (!dbBinding && typeof process !== 'undefined' && process.env) {
    dbBinding = (process.env as unknown as EnvWithDb).DB;
  }

  if (!dbBinding) {
    throw new Error('❌ [D1 Database] Binding "DB" was not found in environment.');
  }

  return drizzle(dbBinding, { schema });
}

// ✅ الحفاظ الكامل والرمي الصريح للتايبات التي تعتمد عليها باقي الملفات (Auth وغيره)
export type DbInstance = ReturnType<typeof getDb>;
export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];