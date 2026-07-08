// src/lib/db/schema/idempotency.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

export const idempotency = sqliteTable('idempotency', {
  key: text('key').primaryKey(),
  
  // الحالات المدعومة: 'pending' | 'completed' | 'failed'
  // ملاحظة: SQLite لا يدعم ENUM، لذا نضبطه عبر TypeScript فقط.
  status: text('status').notNull().default('pending'),
  
  result: text('result'),
  
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
    
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// ✅ إعادة تعريف الأنواع لتشمل 'failed'
export type Idempotency = InferSelectModel<typeof idempotency> & {
  status: 'pending' | 'completed' | 'failed';
};
export type NewIdempotency = InferInsertModel<typeof idempotency> & {
  status?: 'pending' | 'completed' | 'failed';
};