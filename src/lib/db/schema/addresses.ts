// src/lib/db/schema/addresses.ts

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

import { customers } from './customers';
import { users } from './users';

// ============================================
// 📍 جدول عناوين العملاء (Addresses) - D1 Compatible
// ============================================

export const addresses = sqliteTable(
  'addresses',
  {
    // ✅ UUID يُولَّد في التطبيق
    id: text('id').primaryKey(), 

    // 🔗 العلاقات - text ليطابق الحقول المرتبطة
    customerId: text('customer_id').notNull(),

    // 🏷️ تصنيف العنوان
    label: text('label').notNull().default('home'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),

    // 👤 بيانات المستلم
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),

    // 📮 العنوان بالتفصيل
    country: text('country').notNull().default('EG'),
    city: text('city').notNull(),
    area: text('area'),
    street: text('street').notNull(),
    building: text('building'),
    floor: text('floor'),
    apartment: text('apartment'),
    postalCode: text('postal_code'),
    landmark: text('landmark'),

    // 🗺️ الإحداثيات (مخزنة كـ text للدقة العالية وتجنب مشاكل العشري في SQLite)
    latitude: text('latitude'),
    longitude: text('longitude'),

    notes: text('notes'),

    // 🗃️ Soft Delete
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),

    // ⏱️ التواقيت بنظام الـ Unix Timestamp الملي ثانية
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys (Cascades & Actions)
    // ============================================
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'addresses_customer_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [users.id],
      name: 'addresses_deleted_by_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة المشروطة (Partial Unique Indexes)
    // ============================================
    // يضمن وجود عنوان افتراضي واحد فقط "لكل عميل" للمتاجر الحية
    uniqueIndex('addresses_default_unique_idx')
      .on(table.customerId)
      .where(sql`${table.isDefault} = 1 AND ${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ فهارس تحسين أداء الاستعلامات (Performance Indexes)
    // ============================================
    index('addresses_customer_idx').on(table.customerId),
    
    index('addresses_customer_default_idx')
      .on(table.customerId, table.isDefault)
      .where(sql`${table.isDefault} = 1 AND ${table.deletedAt} IS NULL`),
    
    index('addresses_country_city_idx').on(table.country, table.city),
    
    index('addresses_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),

    index('addresses_postal_code_idx').on(table.postalCode),
    index('addresses_phone_idx').on(table.recipientPhone),

    index('addresses_customer_label_idx')
      .on(table.customerId, table.label)
      .where(sql`${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_recipient_name_not_empty', sql`${table.recipientName} != ''`),
    check('chk_recipient_phone_not_empty', sql`${table.recipientPhone} != ''`),
    check('chk_city_not_empty', sql`${table.city} != ''`),
    check('chk_street_not_empty', sql`${table.street} != ''`),
    check('chk_label_not_empty', sql`${table.label} != ''`),
    
    // التحقق من كود الدولة بنظام حرفين كبيرين (ISO)
    check('chk_country_code', sql`${table.country} GLOB '[A-Z][A-Z]'`),

    // تأمين فحص رقم الهاتف بصيغة متوافقة تماماً مع معايير SQLite D1
    check(
      'chk_phone_format',
      sql`(${table.recipientPhone} GLOB '[+0-9]*') AND (length(${table.recipientPhone}) BETWEEN 7 AND 20)`
    ),

    // قياسات الـ CAST الدقيقة لنطاق الإحداثيات الجغرافية
    check(
      'chk_lat_range',
      sql`${table.latitude} IS NULL OR (CAST(${table.latitude} AS REAL) BETWEEN -90.0 AND 90.0)`
    ),
    check(
      'chk_lon_range',
      sql`${table.longitude} IS NULL OR (CAST(${table.longitude} AS REAL) BETWEEN -180.0 AND 180.0)`
    ),

    // قيود اتساق الـ Soft Delete والعناوين الافتراضية
    check(
      'chk_deleted_by_consistency',
      sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`
    ),

    check(
      'chk_default_not_deleted',
      sql`NOT (${table.isDefault} = 1 AND ${table.deletedAt} IS NOT NULL)`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript الجاهزة للاستخدام
// ============================================
export type Address = InferSelectModel<typeof addresses>;
export type NewAddress = InferInsertModel<typeof addresses>;