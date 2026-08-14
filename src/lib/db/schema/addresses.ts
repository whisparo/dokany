// src/lib/db/schema/addresses.ts

import {
  sqliteTable,
  text,
  integer,
  real,
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
    id: text('id').primaryKey(), 

    customerId: text('customer_id').notNull(),

    label: text('label').notNull().default('home'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),

    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),

    country: text('country').notNull().default('EG'),
    city: text('city').notNull(),
    area: text('area'),
    street: text('street').notNull(),
    building: text('building'),
    floor: text('floor'),
    apartment: text('apartment'),
    postalCode: text('postal_code'),
    landmark: text('landmark'),

    // ✅ الإحداثيات من نوع real لحساب المسافات بكفاءة
    latitude: real('latitude'),
    longitude: real('longitude'),

    notes: text('notes'),

    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),

    // ✅ تم الإصلاح: استخدام unixepoch() بدلاً من strftime للأداء الأفضل في D1
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys
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
    // 🗝️ Partial Unique Indexes
    // ============================================
    uniqueIndex('addresses_default_unique_idx')
      .on(table.customerId)
      .where(sql`${table.isDefault} = 1 AND ${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ Performance Indexes
    // ============================================
    index('addresses_customer_idx').on(table.customerId),
    
    index('addresses_customer_default_idx')
      .on(table.customerId, table.isDefault)
      .where(sql`${table.isDefault} = 1 AND ${table.deletedAt} IS NULL`),
    
    index('addresses_country_city_idx').on(table.country, table.city),
    
    // ✅ الشرط يستهدف العناوين المحذوفة لسلة المهملات
    index('addresses_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),

    index('addresses_postal_code_idx').on(table.postalCode),
    index('addresses_phone_idx').on(table.recipientPhone),

    index('addresses_customer_label_idx')
      .on(table.customerId, table.label)
      .where(sql`${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ Check Constraints
    // ============================================
    check('chk_recipient_name_not_empty', sql`length(${table.recipientName}) > 0`),
    check('chk_recipient_phone_not_empty', sql`length(${table.recipientPhone}) > 0`),
    check('chk_city_not_empty', sql`length(${table.city}) > 0`),
    check('chk_street_not_empty', sql`length(${table.street}) > 0`),
    check('chk_label_not_empty', sql`length(${table.label}) > 0`),
    
    check('chk_country_code', sql`${table.country} GLOB '[A-Z][A-Z]'`),

    check(
      'chk_phone_format',
      sql`(${table.recipientPhone} GLOB '[+0-9]*') AND (length(${table.recipientPhone}) BETWEEN 7 AND 20)`
    ),

    // ✅ قياسات الإحداثيات المباشرة بدون CAST (بفضل real)
    check(
      'chk_lat_range',
      sql`${table.latitude} IS NULL OR (${table.latitude} BETWEEN -90.0 AND 90.0)`
    ),
    check(
      'chk_lon_range',
      sql`${table.longitude} IS NULL OR (${table.longitude} BETWEEN -180.0 AND 180.0)`
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