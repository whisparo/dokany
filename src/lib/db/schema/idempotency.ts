// src/lib/db/schema/idempotency.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

export const idempotency = sqliteTable('idempotency', {
  // الـ key القادم من العميل هو المفتاح الرئيسي والوحيد
  key: text('key').primaryKey(),
  
  // pending | completed
  status: text('status').notNull().default('pending'),
  
  // نتيجة العملية مخزنة كـ نصوص JSON
  result: text('result'),
  
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
    
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export type Idempotency = InferSelectModel<typeof idempotency>;
export type NewIdempotency = InferInsertModel<typeof idempotency>;