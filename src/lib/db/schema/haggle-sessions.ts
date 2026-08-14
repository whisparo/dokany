// src/lib/db/schema/haggle-sessions.ts
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

import { stores } from './stores';
import { products } from './products';
import { customers } from './customers';
import { users } from './users';

// ============================================
// 🎯 أنواع TypeScript للـ Enums
// ============================================

export type HaggleStatus = 
  | 'active' 
  | 'counter_offered' 
  | 'accepted' 
  | 'rejected' 
  | 'expired' 
  | 'cancelled';

export type HaggleStrategy = 
  | 'aggressive' 
  | 'friendly' 
  | 'middle_ground';

// ============================================
// 📝 أنواع مساعدة للـ JSON fields
// ============================================
export type CounterOffer = {
  from: 'customer' | 'bot';
  price: string; // نصية للحفاظ على دقة المبالغ العشرية الكبيرة
  message?: string;
  timestamp: string; // ISO string
  accepted?: boolean;
};

// ============================================
// 🤝 جدول جلسات المساومة (Haggle Sessions) - D1 Compatible
// ============================================

export const haggleSessions = sqliteTable(
  'haggle_sessions',
  {
    // ✅ UUID يُولَّد تلقائياً
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()), 
    
    sessionCode: text('session_code').notNull(),

    // المعرفات
    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),
    customerId: text('customer_id'), // يمكن أن يكون Null للزوار

    // الأسعار والمبالغ (Formatted strictly as "123.45")
    originalPrice: text('original_price').notNull(),
    minAllowedPrice: text('min_allowed_price').notNull(),
    currentOffer: text('current_offer').notNull(),

    // ✅ مصفوفات عروض المساومة كـ JSON
    counterOffers: text('counter_offers', { mode: 'json' })
      .$type<CounterOffer[]>()
      .notNull()
      .default(sql`'[]'`),

    roundsCount: integer('rounds_count').notNull().default(0),
    maxRounds: integer('max_rounds').notNull().default(5),

    status: text('status').$type<HaggleStatus>().notNull().default('active'),
    finalPrice: text('final_price'),

    // ✅ فك الـ Circular Dependency
    orderId: text('order_id'),
    discountAmount: text('discount_amount').notNull().default('0'),

    strategyUsed: text('strategy_used').$type<HaggleStrategy>(),

    // فترات الصلاحية والنشاط (محددة صراحة بـ timestamp_ms)
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),

    // ✅ الحوكمة والـ Soft Delete
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    deletedBy: text('deleted_by'),
    
    // ⏱️ التواقيت الموحدة بالميلي ثانية
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // ============================================
    // 🔗 العلاقات الخارجية الصارمة (Foreign Keys)
    // ============================================
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'haggle_sessions_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'haggle_sessions_product_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'haggle_sessions_customer_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'haggle_sessions_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة والمشروطة (Indexes)
    // ============================================
    uniqueIndex('haggle_code_unique_idx')
      .on(table.sessionCode)
      .where(sql`${table.deletedAt} IS NULL`),
      
    index('haggle_store_idx').on(table.storeId),
    index('haggle_product_idx').on(table.productId),
    index('haggle_customer_idx').on(table.customerId),
    
    // تحسين فهرس الطلبات باستبعاد الـ Nulls
    index('haggle_order_idx')
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
      
    index('haggle_expires_idx').on(table.expiresAt),
    
    // فهرس مركب للاستعلام عن الجلسات الحية النشطة
    index('haggle_active_status_idx')
      .on(table.storeId, table.status)
      .where(sql`${table.status} = 'active' AND ${table.deletedAt} IS NULL`),

    // فهرس Soft Delete
    index('haggle_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),

    // ✅ قيد فريد يمنع تكرار الجلسات النشطة لنفس العميل المسجل على نفس المنتج
    uniqueIndex('haggle_active_unique_idx')
      .on(table.customerId, table.productId)
      .where(
        sql`${table.customerId} IS NOT NULL AND ${table.status} IN ('active', 'counter_offered') AND ${table.deletedAt} IS NULL`
      ),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_haggle_status', sql`${table.status} IN ('active', 'counter_offered', 'accepted', 'rejected', 'expired', 'cancelled')`),
    check('chk_haggle_strategy', sql`${table.strategyUsed} IS NULL OR ${table.strategyUsed} IN ('aggressive', 'friendly', 'middle_ground')`),
    
    check('chk_session_code_format', sql`length(${table.sessionCode}) > 0`),

    // التحقق المالي
    check('chk_min_price', sql`CAST(${table.minAllowedPrice} AS REAL) > 0.0`),
    check('chk_original_price', sql`CAST(${table.originalPrice} AS REAL) >= CAST(${table.minAllowedPrice} AS REAL)`),
    check('chk_discount', sql`CAST(${table.discountAmount} AS REAL) >= 0.0`),
    
    check(
      'chk_discount_limit',
      sql`CAST(${table.discountAmount} AS REAL) <= (CAST(${table.originalPrice} AS REAL) - CAST(${table.minAllowedPrice} AS REAL))`
    ),
    
    check('chk_final_price_upper', sql`${table.finalPrice} IS NULL OR CAST(${table.finalPrice} AS REAL) <= CAST(${table.originalPrice} AS REAL)`),
    check('chk_final_price_lower', sql`${table.finalPrice} IS NULL OR CAST(${table.finalPrice} AS REAL) >= CAST(${table.minAllowedPrice} AS REAL)`),
    
    // منطق العدادات والتاريخ
    check('chk_rounds', sql`${table.roundsCount} <= ${table.maxRounds} AND ${table.roundsCount} >= 0`),
    check('chk_max_rounds', sql`${table.maxRounds} > 0`),
    check('chk_expires_after_created', sql`${table.expiresAt} > ${table.createdAt}`),

    // إلزامية وجود استراتيجية عند إنهاء الجلسة
    check(
      'chk_strategy_required',
      sql`(${table.status} NOT IN ('accepted', 'rejected') OR ${table.strategyUsed} IS NOT NULL)`
    ),

    // اتساق Soft Delete
    check(
      'chk_haggle_deleted_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript الجاهزة للاستخدام
// ============================================
export type HaggleSession = InferSelectModel<typeof haggleSessions>;
export type NewHaggleSession = InferInsertModel<typeof haggleSessions>;