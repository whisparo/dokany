// src/lib/db/schema/idempotency.ts

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const idempotency = sqliteTable(
  'idempotency',
  {
    key: text('key').primaryKey(),
    status: text('status', { enum: ['pending', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    result: text('result'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(), // 👈 حقل انتهاء الصلاحية الأساسي للـ TTL
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('idempotency_expires_at_idx').on(table.expiresAt),
    index('idempotency_status_idx').on(table.status),
  ]
);

export type Idempotency = InferSelectModel<typeof idempotency>;
export type NewIdempotency = InferInsertModel<typeof idempotency>;