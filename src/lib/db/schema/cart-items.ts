// src/lib/db/schema/cart-items.ts
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

// ============================================
// 📥 أنواع TypeScript
// ============================================

export type CartVariant = {
  color?: string;
  size?: string;
  material?: string;
  style?: string;
  [key: string]: string | undefined;
};

// ============================================
// 📋 جدول عناصر سلة التسوق (Cart Items) - D1 Optimized
// ============================================

export const cartItems = sqliteTable(
  'cart_items',
  {
    // ✅ توليد تلقائي للـ ID باستخدام Web Crypto API
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // 🔗 هاتف العميل أو الجلسة
    sessionId: text('session_id'),
    customerId: text('customer_id'),

    // 🔗 علاقات المتجر والمنتج
    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),

    // 🎨 خيارات المتغير المخزنة كـ JSON
    variant: text('variant', { mode: 'json' })
      .$type<CartVariant>()
      .notNull()
      .default(sql`'{}'`),

    variantSku: text('variant_sku').notNull(),
    quantity: integer('quantity').notNull().default(1),

    // 💰 السعر لحظة الإضافة (قروش/أصغر وحدة نقدية)
    priceAtAdd: integer('price_at_add').notNull(),
    source: text('source').notNull().default('web'),

    // ✅ التوقيت الموحد السريع عبر D1/SQLite Native Engine
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
      name: 'cart_items_customer_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'cart_items_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'cart_items_product_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس لسرعة الاستعلام
    // ============================================
    index('cart_session_idx')
      .on(table.sessionId)
      .where(sql`${table.sessionId} IS NOT NULL`),

    index('cart_customer_idx')
      .on(table.customerId)
      .where(sql`${table.customerId} IS NOT NULL`),

    index('cart_store_idx').on(table.storeId),
    index('cart_product_idx').on(table.productId),
    index('cart_stale_idx').on(table.createdAt),

    // ⚡ فهارس مركبة سريعة لاستعلامات المتجر والسلة المحمّلة
    index('cart_store_customer_idx')
      .on(table.storeId, table.customerId)
      .where(sql`${table.customerId} IS NOT NULL`),

    index('cart_store_session_idx')
      .on(table.storeId, table.sessionId)
      .where(sql`${table.sessionId} IS NOT NULL`),

    // ============================================
    // 🔒 الفهارس الفريدة (المنع من تكرار نفس الـ SKU للسلة)
    // ============================================
    uniqueIndex('cart_customer_unique_idx')
      .on(table.customerId, table.productId, table.variantSku)
      .where(sql`${table.customerId} IS NOT NULL`),

    uniqueIndex('cart_session_unique_idx')
      .on(table.sessionId, table.productId, table.variantSku)
      .where(sql`${table.sessionId} IS NOT NULL`),

    // ============================================
    // 🛡️ القيود المنطقية (Check Constraints)
    // ============================================
    check('chk_cart_qty_positive', sql`${table.quantity} > 0`),
    check('chk_cart_price_positive', sql`${table.priceAtAdd} >= 0`),

    // التأكد من أن السلة تابعة إما لمستخدم مسجل أو جلسة زائر
    check(
      'chk_cart_owner_exists',
      sql`${table.sessionId} IS NOT NULL OR ${table.customerId} IS NOT NULL`
    ),

    check('chk_variant_sku_not_empty', sql`${table.variantSku} != ''`),
  ]
);

export type CartItem = InferSelectModel<typeof cartItems>;
export type NewCartItem = InferInsertModel<typeof cartItems>;