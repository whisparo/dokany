// src/lib/db/db.ts


import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export interface EnvWithDb {
  DB: D1Database;
  [key: string]: unknown;
}

export type DbInstance = DrizzleD1Database<typeof schema>;

/**
 * الحصول على اتصال D1 من كائن البيئة (env)
 * يجب تمرير env من السياق (من الصفحة أو الـ Worker)
 */
export function getDb(env: EnvWithDb): DbInstance {
  if (!env.DB) {
    throw new Error('❌ D1 Database binding (DB) is missing from env');
  }
  return drizzle(env.DB, { schema });
}

export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];