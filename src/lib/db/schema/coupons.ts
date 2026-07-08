// src/lib/db/schema/coupons.ts

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
import { users } from './users';

// ============================================
// 🎟️ جدول الكوبونات (Coupons) - D1 Compatible
// ============================================

export const coupons = sqliteTable(
  'coupons',
  {
    // ✅ UUID يُولَّد في كود التطبيق
    id: text('id').primaryKey(),
    
    storeId: text('store_id').notNull(),

    code: text('code').notNull(),
    description: text('description'),

    // النوع والقيمة النصية (percentage | fixed)
    type: text('type').notNull(), 
    value: text('value').notNull(),

    // الشروط المالية النصية لحماية الخانات العشرية
    minOrderAmount: text('min_order_amount').notNull().default('0'),
    maxDiscountAmount: text('max_discount_amount'),
    
    // ✅ مصفوفات المعرفات (UUIDs) مخزنة كـ JSON text مع توثيق TypeScript الذكي
    applicableCategories: text('applicable_categories')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
      
    applicableProducts: text('applicable_products')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),

    // الحدود والعدادات
    maxUses: integer('max_uses'),
    maxUsesPerCustomer: integer('max_uses_per_customer').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),

    // فترات الصلاحية والنشاط
    startsAt: integer('starts_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

    // ✅ الحوكمة والـ Soft Delete لاتساق النظام
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),

    // التواقيت بنظام الـ Unix Timestamp الملي ثانية (BigInt-like representation)
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
      name: 'coupons_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'coupons_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة والمشروطة (Indexes)
    // ============================================
    // رمز الكوبون فريد على مستوى المتجر الواحد للكوبونات الحية فقط (Partial Index)
    uniqueIndex('coupons_code_store_unique_idx')
      .on(table.storeId, table.code)
      .where(sql`${table.deletedAt} IS NULL`),

    index('coupons_store_idx').on(table.storeId),
    
    // فهرس مركب سريع جداً للـ Queries الخاصة بالكوبونات الشغالة في الفرونت إند
    index('coupons_active_idx')
      .on(table.storeId, table.isActive)
      .where(sql`${table.isActive} = 1 AND ${table.deletedAt} IS NULL`),

    // تحسين فهرس الـ Soft Delete للـ Admin Trash Queries
    index('coupons_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_coupon_type', sql`${table.type} IN ('percentage', 'fixed')`),
    
    // دعم الحروف الكبيرة، الأرقام، والرموز المقبولة مع منع الفراغات والنصوص الفارغة
    check('chk_code_format', sql`length(${table.code}) > 0 AND ${table.code} GLOB '[A-Z0-9_-]*'`),
    
    // تأمين قيود الـ CAST والعمليات الحسابية للمبالغ المخزنة كنصوص
    check('chk_value_positive', sql`CAST(${table.value} AS REAL) > 0.0`),
    check('chk_min_order_positive', sql`CAST(${table.minOrderAmount} AS REAL) >= 0.0`),
    check('chk_max_discount_positive', sql`${table.maxDiscountAmount} IS NULL OR CAST(${table.maxDiscountAmount} AS REAL) > 0.0`),
    
    // التحقق من نطاق النسبة المئوية (لا تتخطى 100% ولا تقل عن 1%)
    check(
      'chk_percentage_range',
      sql`${table.type} != 'percentage' OR (CAST(${table.value} AS REAL) >= 1.0 AND CAST(${table.value} AS REAL) <= 100.0)`
    ),
    
    // قيود العدادات والحد الأقصى للاستخدام
    check('chk_max_uses', sql`${table.maxUses} IS NULL OR ${table.maxUses} > 0`),
    check('chk_used_count_range', sql`${table.maxUses} IS NULL OR ${table.usedCount} <= ${table.maxUses}`),
    check('chk_max_uses_per_customer', sql`${table.maxUsesPerCustomer} >= 0`),
    
    // تأمين منطق اتساق التواريخ مع الـ NULL في محرك SQLite بشكل صريح
    check('chk_coupon_dates', sql`
      ${table.startsAt} IS NULL OR 
      ${table.expiresAt} IS NULL OR 
      ${table.expiresAt} > ${table.startsAt}
    `),

    // التحقق من حوكمة الحذف المنطقي
    check(
      'chk_deleted_by_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript الجاهزة للاستخدام
// ============================================
export type Coupon = InferSelectModel<typeof coupons>;
export type NewCoupon = InferInsertModel<typeof coupons>;

// ============================================
// 📝 أنواع مساعدة ومصمتة (Strict Types)
// ============================================
export type CouponType = 'percentage' | 'fixed';