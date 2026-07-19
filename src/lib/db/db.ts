// src/lib/db/db.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { schema } from './index'; // ✅ الـ schema الكامل

export function getDb(env: { DB: D1Database }) {
  return drizzle(env.DB, { schema });
}

// ✅ هذا هو النوع الدقيق الذي نريده
export type DbInstance = ReturnType<typeof getDb>;

export type D1Transaction = Parameters<Parameters<DbInstance['transaction']>[0]>[0];