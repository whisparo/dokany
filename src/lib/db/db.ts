// src/lib/db/db.ts

import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare'; // 👈 إضافة الاستيراد
import * as schema from './schema';

export interface EnvWithDb {
  DB: D1Database;
}

export type DbInstance = DrizzleD1Database<typeof schema>;

export function getDb(env: EnvWithDb): DbInstance {
  if (!env?.DB) {
    throw new Error('❌ D1 Database binding (DB) is missing from env');
  }
  return drizzle(env.DB, { schema });
}

// 🚀 إضافة المساعد الموحد للـ Server Actions
export async function getAppDb() {
  const { env } = await getCloudflareContext();
  return {
    db: getDb(env),
    env,
  };
}

export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];