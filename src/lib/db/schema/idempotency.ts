// src/lib/db/schema/idempotency.ts

import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================
// 🔒 جدول عدم التكرار (Idempotency Locks) - D1 Compatible
// ============================================

export const idempotency = sqliteTable(
  'idempotency',
  {
    key: text('key').primaryKey(),
    
    status: text('status', { enum: ['pending', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
      
    result: text('result'),

    // ✅ توحيد صيغة الوقت بالثواني ليتوافق مع mode: 'timestamp'
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),

    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => [
    // ============================================
    // ⚡ الفهارس المحسنة للأداء
    // ============================================
    index('idempotency_expires_at_idx').on(table.expiresAt),
    index('idempotency_status_expires_idx').on(table.status, table.expiresAt),

    // ============================================
    // 🛡️ القيود المنطقية
    // ============================================
    check('chk_idempotency_key_not_empty', sql`length(${table.key}) > 0`),
    check('chk_idempotency_expiry_valid', sql`${table.expiresAt} >= ${table.createdAt}`),
  ]
);

// ============================================
// 📚 الأنواع المستنتجة لـ TypeScript
// ============================================
export type Idempotency = InferSelectModel<typeof idempotency>;
export type NewIdempotency = InferInsertModel<typeof idempotency>;