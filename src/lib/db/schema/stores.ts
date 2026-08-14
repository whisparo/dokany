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
// 📥 الأنواع المساعدة (Types)
// ============================================

export type StoreSettings = {
  allowGuestCheckout?: boolean;
  enableReviews?: boolean;
  autoApproveOrders?: boolean;
  inventoryThreshold?: number;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
  [key: string]: unknown;
};

export type StoreTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  bannerUrl?: string;
  [key: string]: unknown;
};

// ============================================
// 🏪 1. جدول المتاجر الرئيسي (stores) - D1 Optimized
// ============================================

export const stores = sqliteTable(
  'stores',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    ownerId: text('owner_id').notNull(),
    deletedBy: text('deleted_by'),
    verifiedBy: text('verified_by'),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shopName: text('shop_name'),
    description: text('description'),
    logo: text('logo_url'),
    coverImage: text('cover_image_url'),

    phone: text('phone'),
    email: text('email'),

    telegramChatId: text('telegram_chat_id'),
    telegramUsername: text('telegram_username'),

    country: text('country').notNull().default('EG'),
    city: text('city'),
    address: text('address'),
    currency: text('currency').notNull().default('EGP'),
    paymentGateway: text('payment_gateway').notNull().default('stripe'),

    // ✅ تم إضافة { mode: 'json' } والأنواع البرمجية
    settings: text('settings', { mode: 'json' })
      .$type<StoreSettings>()
      .notNull()
      .default(sql`'{}'`),

    theme: text('theme', { mode: 'json' })
      .$type<StoreTheme>()
      .notNull()
      .default(sql`'{}'`),

    templateVersion: text('template_version').notNull().default('v1'),

    cloudinaryAccountIndex: integer('cloudinary_account_index'),

    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),

    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletionReason: text('deletion_reason'),

    // ✅ استخدام unixepoch أسرع وموحد مع D1
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // 🔗 Foreign Keys
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

    // 🔒 Unique Indexes
    uniqueIndex('stores_slug_unique')
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('stores_telegram_chat_unique')
      .on(table.telegramChatId)
      .where(sql`${table.telegramChatId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    uniqueIndex('stores_telegram_username_unique')
      .on(table.telegramUsername)
      .where(sql`${table.telegramUsername} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // 🎯 Performance Indexes
    index('stores_owner_idx').on(table.ownerId),
    index('stores_deleted_by_idx').on(table.deletedBy),

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

    // 🛡️ Check Constraints
    check('chk_store_name_not_empty', sql`${table.name} != ''`),
    check('chk_store_slug_not_empty', sql`${table.slug} != ''`),

    check('chk_store_slug_format', sql`length(${table.slug}) >= 2 AND ${table.slug} NOT LIKE '-%' AND ${table.slug} NOT LIKE '%-'`),
    check('chk_country_code', sql`length(${table.country}) = 2`),
    check('chk_currency_code', sql`length(${table.currency}) = 3`),
    check('chk_payment_gateway', sql`${table.paymentGateway} IN ('stripe', 'paypal', 'paymob', 'cash')`),

    check('chk_store_phone_not_empty', sql`${table.phone} IS NULL OR ${table.phone} != ''`),

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
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    totalProducts: integer('total_products').notNull().default(0),
    totalOrders: integer('total_orders').notNull().default(0),
    totalCustomers: integer('total_customers').notNull().default(0),

    // المبالغ بالسنتات/القروش
    totalRevenue: integer('total_revenue').notNull().default(0),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex('store_stats_store_idx').on(table.storeId),
    index('store_stats_revenue_idx').on(table.totalRevenue),
    index('store_stats_orders_idx').on(table.totalOrders),
    index('store_stats_products_idx').on(table.totalProducts),

    check('chk_stats_products_positive', sql`${table.totalProducts} >= 0`),
    check('chk_stats_orders_positive', sql`${table.totalOrders} >= 0`),
    check('chk_stats_customers_positive', sql`${table.totalCustomers} >= 0`),
    check('chk_stats_revenue_positive', sql`${table.totalRevenue} >= 0`),
  ]
);

// ============================================
// 📐 أنواع Infer
// ============================================

export type Store = InferSelectModel<typeof stores>;
export type NewStore = InferInsertModel<typeof stores>;

export type StoreStat = InferSelectModel<typeof storeStats>;
export type NewStoreStat = InferInsertModel<typeof storeStats>;