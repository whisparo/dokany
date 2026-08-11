// src/lib/db/db.ts

import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

// ✅ التعديل هنا: نطلب DB فقط بدون [key: string]: unknown
export interface EnvWithDb {
  DB: D1Database;
}

export type DbInstance = DrizzleD1Database<typeof schema>;

export function getDb(env: EnvWithDb): DbInstance {
  if (!env.DB) {
    throw new Error('❌ D1 Database binding (DB) is missing from env');
  }
  return drizzle(env.DB, { schema });
}

export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];