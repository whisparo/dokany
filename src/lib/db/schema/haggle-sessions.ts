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
// 🎯 أنواع TypeScript للـ Enums (Strict Types)
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
// 📝 أنواع مساعدة ومصمتة للـ JSON fields
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
    // ✅ UUID يُولَّد في كود التطبيق
    id: text('id').primaryKey(), 
    
    sessionCode: text('session_code').notNull(),

    // المعرفات (سيتم ربط العلاقات الخارجية بالأسفل بشكل مستقل)
    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),
    customerId: text('customer_id'),

    // الأسعار والمبالغ مخزنة كنصوص لحماية الدقة العشرية للعملات
    originalPrice: text('original_price').notNull(),
    minAllowedPrice: text('min_allowed_price').notNull(),
    currentOffer: text('current_offer').notNull(),

    // ✅ مصفوفات عروض المساومة مخزنة كـ JSON text مع توثيق TypeScript الذكي
    counterOffers: text('counter_offers')
      .$type<CounterOffer[]>()
      .notNull()
      .default(sql`'[]'`),

    roundsCount: integer('rounds_count').notNull().default(0),
    maxRounds: integer('max_rounds').notNull().default(5),

    status: text('status').notNull().default('active'),
    finalPrice: text('final_price'),

    // ✅ فك الـ Circular Dependency بذكاء عبر الحفظ كـ text مباشر
    orderId: text('order_id'),
    discountAmount: text('discount_amount').notNull().default('0'),

    strategyUsed: text('strategy_used'),

    // فترات الصلاحية والنشاط
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

    // ✅ الحوكمة والـ Soft Delete لاتساق النظام
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),
    
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
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
    index('haggle_order_idx').on(table.orderId),
    index('haggle_expires_idx').on(table.expiresAt),
    
    // فهرس مركب سريع جداً للاستعلام عن الجلسات الحية النشطة
    index('haggle_active_status_idx')
      .on(table.storeId, table.status)
      .where(sql`${table.status} = 'active' AND ${table.deletedAt} IS NULL`),

    // تحسين فهرس الـ Soft Delete للـ Admin Trash Queries
    index('haggle_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),

    // ✅ قيد صارم: يمنع فتح أكتر من جلسة حية أو عرض متبادل لنفس العميل على نفس المنتج
    uniqueIndex('haggle_active_unique_idx')
      .on(table.customerId, table.productId)
      .where(sql`${table.status} IN ('active', 'counter_offered') AND ${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_haggle_status', sql`${table.status} IN ('active', 'counter_offered', 'accepted', 'rejected', 'expired', 'cancelled')`),
    check('chk_haggle_strategy', sql`${table.strategyUsed} IS NULL OR ${table.strategyUsed} IN ('aggressive', 'friendly', 'middle_ground')`),
    
    // منع الرموز الفارغة
    check('chk_session_code_format', sql`length(${table.sessionCode}) > 0`),

    // تأمين قيود الـ CAST والعمليات الحسابية للمبالغ المالية
    check('chk_min_price', sql`CAST(${table.minAllowedPrice} AS REAL) > 0.0`),
    check('chk_original_price', sql`CAST(${table.originalPrice} AS REAL) >= CAST(${table.minAllowedPrice} AS REAL)`),
    check('chk_discount', sql`CAST(${table.discountAmount} AS REAL) >= 0.0`),
    
    // ألا يتخطى الخصم المسموح به الفرق بين السعر الأصلي والحد الأدنى
    check(
      'chk_discount_limit',
      sql`CAST(${table.discountAmount} AS REAL) <= (CAST(${table.originalPrice} AS REAL) - CAST(${table.minAllowedPrice} AS REAL))`
    ),
    
    // قيود السعر النهائي بعد موافقة الطرفين
    check('chk_final_price_upper', sql`${table.finalPrice} IS NULL OR CAST(${table.finalPrice} AS REAL) <= CAST(${table.originalPrice} AS REAL)`),
    check('chk_final_price_lower', sql`${table.finalPrice} IS NULL OR CAST(${table.finalPrice} AS REAL) >= CAST(${table.minAllowedPrice} AS REAL)`),
    
    // منطق الـ Rounds والعدادات
    check('chk_rounds', sql`${table.roundsCount} <= ${table.maxRounds} AND ${table.roundsCount} >= 0`),
    check('chk_max_rounds', sql`${table.maxRounds} > 0`),

    // ✅ تعديل هندسي لحماية قيد الصلاحية: مقارنة الـ expiresAt بوقت الإدخال الحقيقي لضمان سلامة الـ Default values
    check(
      'chk_expires_after_created',
      sql`${table.expiresAt} > CAST(strftime('%s', 'now') * 1000 AS INTEGER)`
    ),

    // ✅ فكرتك الممتازة: إلزامية وجود استراتيجية في حال تم الحسم (قبول أو رفض الجلسة)
    check(
      'chk_strategy_required',
      sql`(${table.status} NOT IN ('accepted', 'rejected') OR ${table.strategyUsed} IS NOT NULL)`
    ),

    // التحقق من حوكمة الحذف المنطقي
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