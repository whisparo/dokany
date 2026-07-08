// src/lib/db/schema/stores.ts

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

import { users } from './users';

// ============================================
// 🏪 1. جدول المتاجر الرئيسي (stores)
// ============================================

export const stores = sqliteTable(
  'stores',
  {
    // ✅ UUID يُولَّد في كود التطبيق (nanoid/crypto)
    id: text('id').primaryKey(),

    // 🔗 العلاقات مع جدول المستخدمين (Text الموحد لمنع تعارض الأنواع)
    ownerId: text('owner_id').notNull(),
    deletedBy: text('deleted_by'),
    verifiedBy: text('verified_by'), // لمن قام بتوثيق المتجر من الإدارة

    // 📝 البيانات الأساسية
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shopName: text('shop_name'),
    description: text('description'),
    logo: text('logo_url'),
    coverImage: text('cover_image_url'),

    // 📞 الاتصال
    phone: text('phone'),
    email: text('email'),

    // 🔐 تيليجرام
    telegramChatId: text('telegram_chat_id'),
    telegramUsername: text('telegram_username'),

    // 🌍 الموقع، العملة، وبوابة الدفع الافتراضية
    country: text('country').notNull().default('EG'),
    city: text('city'),
    address: text('address'),
    currency: text('currency').notNull().default('EGP'),
    paymentGateway: text('payment_gateway').notNull().default('stripe'), // stripe, paypal, paymob, cash

    // ✅ التحديث التكتيكي: حماية قيم الـ JSON الافتراضية بـ sql لمنع الـ compiler errors
    settings: text('settings').notNull().default(sql`'{}'`),
    theme: text('theme').notNull().default(sql`'{}'`),
    templateVersion: text('template_version').notNull().default('v1'),
    
    cloudinaryAccountIndex: integer('cloudinary_account_index'),

    // 🏷️ الحالات البوليانية (مخزنة كـ integer في SQLite)
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),

    // 🗄️ الرقابة والـ Soft Delete
    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletionReason: text('deletion_reason'),

    // ⏱️ التواقيت بنظام الـ Unix Timestamp الملي ثانية
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // العلاقات الخارجية الصارمة بصيغة الـ Array الآمنة للدريزل والـ Self-contained
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [users.id],
      name: 'stores_owner_id_fkey',
    }).onDelete('restrict').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'stores_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.verifiedBy],
      foreignColumns: [users.id],
      name: 'stores_verified_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // الفهارس الفريدة المشروطة (Partial Unique Indexes) لمنع التكرار للمتاجر الحية فقط
    uniqueIndex('stores_slug_unique')
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('stores_telegram_chat_unique')
      .on(table.telegramChatId)
      .where(sql`${table.telegramChatId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    uniqueIndex('stores_telegram_username_unique')
      .on(table.telegramUsername)
      .where(sql`${table.telegramUsername} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // ⚡ فهارس تحسين الاستعلامات للأداء العالي جداً
    index('stores_owner_idx').on(table.ownerId),
    index('stores_deleted_by_idx').on(table.deletedBy),
    
    // الفهرس الأكثر أهمية لتصفح المتجر من قبل العملاء (الـ Slug والنشاط)
    index('stores_slug_active_idx')
      .on(table.slug, table.isActive)
      .where(sql`${table.deletedAt} IS NULL`),
      
    index('stores_geo_active_idx')
      .on(table.country, table.city, table.isActive)
      .where(sql`${table.isActive} = 1 AND ${table.deletedAt} IS NULL`),
      
    index('stores_featured_idx')
      .on(table.isFeatured)
      .where(sql`${table.isFeatured} = 1 AND ${table.deletedAt} IS NULL`),
      
    index('stores_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
      
    index('stores_created_idx').on(table.createdAt),

    // 🛡️ التحققات والقيود المنطقية الصارمة (Database Constraints)
    check('chk_store_name_not_empty', sql`${table.name} != ''`),
    check('chk_store_slug_not_empty', sql`${table.slug} != ''`),
    
    // دعم الحلاف الصغيرة والأرقام والشرطة بدون فراغات
    check('chk_store_slug_format', sql`${table.slug} GLOB '[a-z0-9]*[a-z0-9-]*'`),
    check('chk_country_code', sql`${table.country} GLOB '[A-Z][A-Z]'`),
    check('chk_currency_code', sql`${table.currency} GLOB '[A-Z][A-Z][A-Z]'`),
    check('chk_payment_gateway', sql`${table.paymentGateway} IN ('stripe', 'paypal', 'paymob', 'cash')`),
    
    check(
      'chk_store_phone_format',
      sql`${table.phone} IS NULL OR ${table.phone} GLOB '+[1-9][0-9]*'`
    ),
    
    check(
      'chk_store_email_format',
      sql`${table.email} IS NULL OR ${table.email} LIKE '%_@_%._%'`
    ),
    
    check(
      'chk_deleted_by_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),

    check(
      'chk_verified_by_consistency',
      sql`(${table.isVerified} = 0 OR ${table.verifiedBy} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📊 2. جدول إحصائيات المتجر (store_stats)
// ============================================

export const storeStats = sqliteTable(
  'store_stats',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    
    totalProducts: integer('total_products').notNull().default(0),
    totalOrders: integer('total_orders').notNull().default(0),
    totalCustomers: integer('total_customers').notNull().default(0),
    
    // تخزين مالي كـ TEXT لضمان أعلى مستويات الدقة الفلكية ومنع الـ Floating Point Bugs
    totalRevenue: text('total_revenue').notNull().default('0'),
    
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    uniqueIndex('store_stats_store_idx').on(table.storeId),
    index('store_stats_revenue_idx').on(table.totalRevenue),
    index('store_stats_orders_idx').on(table.totalOrders),
    index('store_stats_products_idx').on(table.totalProducts),
    
    // ✅ تحسين أمان القيود: فصل الشروط داخل الـ check لضمان ترجمة الـ CAST بشكل سليم وبدون تعقيد
    check('chk_stats_products_positive', sql`${table.totalProducts} >= 0`),
    check('chk_stats_orders_positive', sql`${table.totalOrders} >= 0`),
    check('chk_stats_customers_positive', sql`${table.totalCustomers} >= 0`),
    check('chk_stats_revenue_positive', sql`CAST(${table.totalRevenue} AS REAL) >= 0.0`),
  ]
);

// ============================================
// 📚 أنواع TypeScript الجاهزة
// ============================================

export type Store = InferSelectModel<typeof stores>;
export type NewStore = InferInsertModel<typeof stores>;

export type StoreStat = InferSelectModel<typeof storeStats>;
export type NewStoreStat = InferInsertModel<typeof storeStats>;