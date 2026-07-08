// src/lib/db/schema/categories.ts

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
// 🗂️ جدول الفئات (Categories) - D1 Compatible
// ============================================

export const categories = sqliteTable(
  'categories',
  {
    // UUID يُولَّد في التطبيق
    id: text('id').primaryKey(), 
    
    storeId: text('store_id').notNull(),
    parentId: text('parent_id'),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    image: text('image_url'),

    level: integer('level').notNull().default(0),
    path: text('path'), 

    order: integer('order').notNull().default(0),
    productsCount: integer('products_count').notNull().default(0),

    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    
    // ✅ الإصلاح النهائي والأدق لخناقة الـ Type Checker بدون any وبدون خط أحمر
    mediaIds: text('media_ids').$type<string[]>().notNull().default(sql`'[]'`),

    // ✅ إضافة deletedBy لتتبع من قام بالحذف (لاتساق النظام)
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
    // 🔗 العلاقات الخارجيّة الصارمة (Foreign Keys)
    // ============================================
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'categories_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    // Self-referencing foreign key آمن ومحمي
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'categories_parent_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ✅ إضافة foreignKey لـ deletedBy
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'categories_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة (Unique Indexes)
    // ============================================
    uniqueIndex('categories_slug_unique')
      .on(table.storeId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ الفهارس المطورة والمحسنة (Performance Indexes)
    // ============================================
    
    // الفهرس المركب الذكي لجلب الأبناء محصوراً بالمتجر
    index('categories_store_parent_idx')
      .on(table.storeId, table.parentId)
      .where(sql`${table.parentId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    
    index('categories_path_idx')
      .on(table.path)
      .where(sql`${table.path} IS NOT NULL`),
    
    index('categories_level_idx')
      .on(table.storeId, table.level)
      .where(sql`${table.deletedAt} IS NULL`),
    
    index('categories_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),

    // ✅ فهرس إضافي لتسريع جلب الفئات النشطة فقط
    index('categories_active_idx')
      .on(table.storeId, table.isActive)
      .where(sql`${table.isActive} = 1 AND ${table.deletedAt} IS NULL`),

    // الفهرس المثالي للاستعلام السريع لشجرة التصنيفات في الـ Storefront
    index('categories_store_parent_order_idx')
      .on(table.storeId, table.parentId, table.order)
      .where(sql`${table.isActive} = 1 AND ${table.deletedAt} IS NULL`),

    // بحث سريع بـ COLLATE NOCASE يدعم محرك الـ Search
    index('categories_name_idx')
      .on(table.storeId, sql`${table.name} COLLATE NOCASE`)
      .where(sql`${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية (Check Constraints)
    // ============================================
    check('chk_cat_name_not_empty', sql`length(${table.name}) > 0`),
    check('chk_cat_slug_not_empty', sql`length(${table.slug}) > 0`),
    check('chk_parent_not_self', sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`),
    check('chk_level_range', sql`${table.level} >= 0 AND ${table.level} <= 10`),
    check('chk_products_count_positive', sql`${table.productsCount} >= 0`),

    // ✅ حماية السيو: دعم العربي والإنجليزي والشرطات ومنع المسافات الوهمية فقط
    check('chk_slug_format', sql`${table.slug} NOT LIKE '% %'`),

    // الـ Path يبدأ بـ / دائماً في حالة وجود شجرة فئات عميقة
    check(
      'chk_path_format',
      sql`${table.path} IS NULL OR ${table.path} GLOB '/*'`
    ),

    // ✅ تناسق الحذف المنطقي
    check(
      'chk_deleted_by_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript المستنتجة
// ============================================
export type Category = InferSelectModel<typeof categories>;
export type NewCategory = InferInsertModel<typeof categories>;