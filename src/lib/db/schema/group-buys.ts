// src/lib/db/schema/group-buys.ts

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
// 📝 أنواع TypeScript للـ Enums (Strict Types)
// ============================================

export type GroupBuyStatus = 
  | 'active' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'expired';

// ============================================
// 👥 جدول الشراء الجماعي (Group Buys) - D1 Compatible
// ============================================

export const groupBuys = sqliteTable(
  'group_buys',
  {
    // ✅ UUID يُولَّد في كود التطبيق
    id: text('id').primaryKey(),
    
    groupCode: text('group_code').notNull(),

    // المعرفات (العلاقات الخارجية مربوطة بالأسفل بشكل مستقل)
    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),
    leaderId: text('leader_id'),

    // الأسعار والمبالغ مخزنة كنصوص لحماية الدقة العشرية للعملات
    originalPrice: text('original_price').notNull(),
    groupPrice: text('group_price').notNull(),
    
    // نسبة الخصم (عدد صحيح بين 1 و 100)
    discountPercentage: integer('discount_percentage').notNull(),

    // المشاركون والحدود
    requiredParticipants: integer('required_participants').notNull(),
    currentParticipants: integer('current_participants').notNull().default(0),
    maxParticipants: integer('max_participants'),

    // ✅ الحالة مع توثيق النوع الصارم
    status: text('status').$type<GroupBuyStatus>().notNull().default('active'),

    // فترات الصلاحية والنشاط
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),

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
      name: 'group_buys_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'group_buys_product_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.leaderId],
      foreignColumns: [customers.id],
      name: 'group_buys_leader_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'group_buys_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة والمشروطة (Indexes)
    // ============================================
    uniqueIndex('group_buys_code_unique_idx')
      .on(table.groupCode)
      .where(sql`${table.deletedAt} IS NULL`),

    index('group_buys_store_idx').on(table.storeId),
    index('group_buys_product_idx').on(table.productId),
    index('group_buys_expires_idx').on(table.expiresAt),
    index('group_buys_leader_idx').on(table.leaderId),
    
    // فهرس مركب للاستعلام السريع عن المجموعات النشطة أو التي تحت المعالجة في الفرونت إند
    index('group_buys_active_status_idx')
      .on(table.storeId, table.status)
      .where(sql`${table.status} IN ('active', 'processing') AND ${table.deletedAt} IS NULL`),

    // تحسين فهرس الـ Soft Delete للـ Admin Trash Queries
    index('group_buys_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),

    // 🔒 قيد فريد صارم: يمنع فتح أكتر من مجموعة نشطة لنفس المنتج داخل نفس المتجر لمنع تشتيت المشترين
    uniqueIndex('group_buys_active_product_unique_idx')
      .on(table.storeId, table.productId)
      .where(sql`${table.status} IN ('active', 'processing') AND ${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_group_buy_status', sql`${table.status} IN ('active', 'processing', 'completed', 'failed', 'cancelled', 'expired')`),
    
    // منع قيم الرموز الفاضية
    check('chk_group_code_format', sql`length(${table.groupCode}) > 0`),
    
    // تأمين قيود الـ CAST والعمليات الحسابية للمبالغ المالية العشرية
    check('chk_group_prices', sql`CAST(${table.groupPrice} AS REAL) < CAST(${table.originalPrice} AS REAL)`),
    check('chk_group_price_positive', sql`CAST(${table.groupPrice} AS REAL) > 0.0`),
    check('chk_original_price_positive', sql`CAST(${table.originalPrice} AS REAL) > 0.0`),
    
    // النطاقات والنسب
    check('chk_discount_range', sql`${table.discountPercentage} > 0 AND ${table.discountPercentage} <= 100`),
    check('chk_required_participants', sql`${table.requiredParticipants} >= 2`),
    check('chk_current_participants_positive', sql`${table.currentParticipants} >= 0`),
    
    // ألا يتجاوز عدد المشاركين الحاليين الحد الأقصى للمجموعة (أو الحد المطلوب في حال غياب الأقصى)
    check(
      'chk_current_participants_upper',
      sql`${table.currentParticipants} <= COALESCE(${table.maxParticipants}, ${table.requiredParticipants})`
    ),
    
    check(
      'chk_max_participants',
      sql`${table.maxParticipants} IS NULL OR ${table.maxParticipants} >= ${table.requiredParticipants}`
    ),

    // ✅ التعديل الهندسي لحماية قيد الصلاحية وضمان عدم تعارضه مع الـ Insert Defaults في SQLite
    check(
      'chk_group_buy_expires_after_created',
      sql`${table.expiresAt} > CAST(strftime('%s', 'now') * 1000 AS INTEGER)`
    ),

    // ✅ التحقق من اكتمال المجموعة (إذا كانت الحالة completed، يجب أن يكون completedAt غير NULL)
    check(
      'chk_completed_at_consistency',
      sql`(${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL)`
    ),

    // التحقق من حوكمة الحذف المنطقي
    check(
      'chk_group_buy_deleted_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript الجاهزة للاستخدام
// ============================================
export type GroupBuy = InferSelectModel<typeof groupBuys>;
export type NewGroupBuy = InferInsertModel<typeof groupBuys>;