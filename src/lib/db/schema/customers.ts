// src/lib/db/schema/customers.ts
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
// 📦 الأنواع المساعدة
// ============================================
export type CustomerPreferences = {
  language?: 'ar' | 'en';
  currency?: string;
  notifications?: boolean;
  marketingEmails?: boolean;
  theme?: 'light' | 'dark' | 'system';
};

// ============================================
// 👤 جدول العملاء (Customers) - D1 Optimized
// ============================================
export const customers = sqliteTable(
  'customers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    userId: text('user_id'),
    deletedBy: text('deleted_by'),

    phone: text('phone').notNull(),
    email: text('email'),
    name: text('name'),
    telegramChatId: text('telegram_chat_id'),

    // ✅ وضع mode: 'json' لضمان المعالجة التلقائية بواسطة Drizzle
    preferences: text('preferences', { mode: 'json' })
      .$type<CustomerPreferences>()
      .notNull()
      .default(sql`'{}'`),

    deletedAt: integer('deleted_at', { mode: 'timestamp' }),

    // ✅ استخدام unixepoch الموحد والأسرع مع D1
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // 🔗 العلاقات الخارجية
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'customers_user_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'customers_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // 🔒 الفهارس الفريدة
    uniqueIndex('customers_phone_unique')
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('customers_email_unique')
      .on(sql`${table.email} COLLATE NOCASE`)
      .where(sql`${table.email} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    uniqueIndex('customers_telegram_unique')
      .on(table.telegramChatId)
      .where(sql`${table.telegramChatId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // 🎯 فهارس الأداء
    index('customers_user_id_idx').on(table.userId),
    index('customers_deleted_by_idx').on(table.deletedBy),
    index('customers_name_idx').on(table.name),
    index('customers_created_idx').on(table.createdAt),
    index('customers_deleted_idx').on(table.deletedAt).where(sql`${table.deletedAt} IS NULL`),
    index('customers_phone_idx').on(table.phone),
    index('customers_email_idx').on(sql`${table.email} COLLATE NOCASE`),

    // 🛡️ القيود المنطقية (Check Constraints)
    check('chk_phone_not_empty', sql`${table.phone} != ''`),
    check('chk_email_format', sql`${table.email} IS NULL OR ${table.email} LIKE '%_@_%._%'`),
    check('chk_customer_name_not_empty', sql`${table.name} IS NULL OR ${table.name} != ''`),
    check('chk_deleted_by_consistency', sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`),
    check('chk_preferences_currency', sql`
      json_extract(${table.preferences}, '$.currency') IS NULL 
      OR json_extract(${table.preferences}, '$.currency') GLOB '[A-Z][A-Z][A-Z]'
    `),
  ]
);

// ============================================
// 📊 جدول إحصائيات العميل (Customer Stats)
// ============================================
export const customerStats = sqliteTable(
  'customer_stats',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    totalSpent: integer('total_spent').notNull().default(0),
    ordersCount: integer('orders_count').notNull().default(0),
    lastOrderAt: integer('last_order_at', { mode: 'timestamp' }),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex('customer_stats_customer_idx').on(table.customerId),
    index('customer_stats_total_spent_idx').on(table.totalSpent),
    index('customer_stats_orders_idx').on(table.ordersCount),
    index('customer_stats_dashboard_idx').on(table.customerId, table.ordersCount, table.totalSpent),

    check('chk_stats_non_negative', sql`${table.totalSpent} >= 0 AND ${table.ordersCount} >= 0`),
  ]
);

// ============================================
// 💰 جدول المحفظة ونقاط الولاء (Customer Wallets)
// ============================================
export const customerWallets = sqliteTable(
  'customer_wallets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    balance: integer('balance').notNull().default(0),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex('customer_wallets_customer_idx').on(table.customerId),
    index('customer_wallets_balance_idx').on(table.balance),
    index('customer_wallets_loyalty_idx').on(table.loyaltyPoints),

    check('chk_wallet_non_negative', sql`${table.balance} >= 0`),
    check('chk_loyalty_non_negative', sql`${table.loyaltyPoints} >= 0`),
  ]
);

// ============================================
// 📐 أنواع Infer
// ============================================
export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type CustomerStat = InferSelectModel<typeof customerStats>;
export type NewCustomerStat = InferInsertModel<typeof customerStats>;

export type CustomerWallet = InferSelectModel<typeof customerWallets>;
export type NewCustomerWallet = InferInsertModel<typeof customerWallets>;