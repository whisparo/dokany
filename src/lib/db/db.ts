// src/lib/db/db.ts
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema'; // 👈 استيراد كامل الـ Schema

export interface EnvWithDb {
  DB: D1Database;
  [key: string]: unknown;
}

// 🎯 تعريف نوع قاعدة البيانات صراحة لمنع الـ Types من أن تنزل لـ {}
export type DbInstance = DrizzleD1Database<typeof schema>;

export function getDb(env?: { DB?: D1Database } | { env?: { DB?: D1Database } }): DbInstance {
  let dbBinding: D1Database | undefined;

  if (env && typeof env === 'object') {
    if ('DB' in env && env.DB) dbBinding = env.DB;
    else if ('env' in env && env.env?.DB) dbBinding = env.env.DB;
  }

  if (!dbBinding && typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as { env?: EnvWithDb };
    if (g.env?.DB) dbBinding = g.env.DB;
  }

  if (!dbBinding && typeof process !== 'undefined' && process.env) {
    dbBinding = (process.env as unknown as EnvWithDb).DB;
  }

  // دعم مرحلة Build بدون إلقاء Error يوقف الـ Next Build
  if (!dbBinding) {
    return drizzle({} as unknown as D1Database, { schema });
  }

  return drizzle(dbBinding, { schema });
}

export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];