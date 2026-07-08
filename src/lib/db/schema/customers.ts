// src/lib/db/schema/customers.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

import { users } from './users';

// ============================================
// 🛍️ جدول العملاء (Customers) - D1 Compatible
// ============================================

export const customers = sqliteTable(
  'customers',
  {
    // ✅ UUID يُولَّد في التطبيق قبل عملية الـ Insert
    id: text('id').primaryKey(),

    // 🔗 العلاقات الخارجية المباشرة (تمنع الـ Deprecation Warning تماماً)
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
      
    deletedBy: text('deleted_by')
      .references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // 📞 بيانات الاتصال الأساسية
    phone: text('phone').notNull(),
    email: text('email'),
    name: text('name'),

    // 🤖 تكامل القنوات التلقائية (تليجرام)
    telegramChatId: text('telegram_chat_id'),

    // ⚙️ تفضيلات العميل مخزنة كـ TEXT (JSON) مع ربط نوع TypeScript للتوثيق البرمجي
    preferences: text('preferences')
      .$type<CustomerPreferences>()
      .notNull()
      .default(sql`'{}'`),
    // ⏱️ نظام الـ Soft Delete والتواقيت بنظام الـ Unix Timestamp (الملي ثانية)
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
      
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ============================================
    // 🗝️ الفهارس الفريدة الجزئية (Partial Unique Indexes)
    // ============================================
    uniqueIndex('customers_phone_unique')
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('customers_email_unique')
      .on(sql`${table.email} COLLATE NOCASE`)
      .where(sql`${table.email} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    uniqueIndex('customers_telegram_unique')
      .on(table.telegramChatId)
      .where(sql`${table.telegramChatId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ فهارس الأداء العالي والتصفية (High-Performance Indexes)
    // ============================================
    index('customers_user_id_idx').on(table.userId),
    index('customers_deleted_by_idx').on(table.deletedBy),
    index('customers_name_idx').on(table.name),
    index('customers_created_idx').on(table.createdAt),
    
    index('customers_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),

    index('customers_phone_idx').on(table.phone),
    index('customers_email_idx').on(sql`${table.email} COLLATE NOCASE`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    // قيد التحقق الصارم من صيغة الهاتف الدولية (تبدأ بـ + ومتبوعة بأرقام)
    check('chk_phone_format', sql`${table.phone} GLOB '+[1-9][0-9][0-9][0-9][0-9][0-9][0-9]*'`),

    // قيد تحقق أساسي ومبسط للإيميل متوافق مع SQLite
    check('chk_email_format', sql`${table.email} IS NULL OR ${table.email} LIKE '%_@_%._%'`),

    check('chk_customer_name_not_empty', sql`${table.name} IS NULL OR ${table.name} != ''`),
    check('chk_deleted_by_consistency', sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`),

    // التحقق من صحة العملة الثلاثية داخل الـ JSON ( preferences )
    check('chk_preferences_currency', sql`
      json_extract(${table.preferences}, '$.currency') IS NULL 
      OR json_extract(${table.preferences}, '$.currency') GLOB '[A-Z][A-Z][A-Z]'
    `),
  ]
);

// ============================================
// 📊 جدول إحصائيات العميل (منع الـ Write Locks والـ Hot Rows)
// ============================================

export const customerStats = sqliteTable(
  'customer_stats',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    
    // 💰 مبالغ مالية مخزنة كـ TEXT للحفاظ على دقة الكسور متوافقة مع الـ D1
    totalSpent: text('total_spent').notNull().default('0'),
    ordersCount: integer('orders_count').notNull().default(0),
    lastOrderAt: integer('last_order_at', { mode: 'timestamp' }),
    
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    uniqueIndex('customer_stats_customer_idx').on(table.customerId),
    index('customer_stats_total_spent_idx').on(table.totalSpent),
    index('customer_stats_orders_idx').on(table.ordersCount),
    
    // ⚡ فهرس مركب ذكي لتسريع لوحات تحكم الـ Leaderboards و كبار العملاء
    index('customer_stats_dashboard_idx').on(table.customerId, table.ordersCount, table.totalSpent),
    
    // 🛡️ الأمان المالي الصارم
    check('chk_stats_non_negative', sql`
      CAST(coalesce(${table.totalSpent}, '0') AS REAL) >= 0.0 
      AND ${table.ordersCount} >= 0
    `),
  ]
);

// ============================================
// 💰 جدول محفظة ونقاط الولاء للعميل (تحديثات مالية معزولة)
// ============================================

export const customerWallets = sqliteTable(
  'customer_wallets',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    
    // الرصيد مخزن كـ text حمايةً من مشاكل الـ floating point للعملات
    balance: text('balance').notNull().default('0'),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    uniqueIndex('customer_wallets_customer_idx').on(table.customerId),
    index('customer_wallets_balance_idx').on(table.balance),
    index('customer_wallets_loyalty_idx').on(table.loyaltyPoints),
    
    // 🛡️ منع الحسابات المكشوفة أو النقاط السالبة نهائياً
    check('chk_wallet_non_negative', sql`CAST(coalesce(${table.balance}, '0') AS REAL) >= 0.0`),
    check('chk_loyalty_non_negative', sql`${table.loyaltyPoints} >= 0`),
  ]
);

// ============================================
// 📚 أنواع الـ TypeScript المخرجة للتحقق البرمجي
// ============================================
export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;
export type CustomerStat = InferSelectModel<typeof customerStats>;
export type NewCustomerStat = InferInsertModel<typeof customerStats>;
export type CustomerWallet = InferSelectModel<typeof customerWallets>;
export type NewCustomerWallet = InferInsertModel<typeof customerWallets>;

// ============================================
// 📝 النوع الهيكلي لحقل التفضيلات
// ============================================
export type CustomerPreferences = {
  language?: 'ar' | 'en';
  currency?: string; // يتم التحقق منه ثلاثياً مثل EGP, USD عبر الـ Constraint
  notifications?: boolean;
  marketingEmails?: boolean;
  theme?: 'light' | 'dark' | 'system';
};