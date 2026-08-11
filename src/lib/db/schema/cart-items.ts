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
// 🛒 جدول عناصر السلة (Cart Items) - D1 Compatible
// ============================================

export const cartItems = sqliteTable(
  'cart_items',
  {
    id: text('id').primaryKey(),

    sessionId: text('session_id'),
    customerId: text('customer_id'),

    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),

    variant: text('variant', { mode: 'json' })
      .$type<{
        color?: string;
        size?: string;
        material?: string;
        style?: string;
      }>()
      .default(sql`'{}'`),

    variantSku: text('variant_sku').notNull(),
    quantity: integer('quantity').notNull().default(1),

    priceAtAdd: text('price_at_add').notNull(),
    source: text('source').default('web'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
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

    index('cart_session_idx')
      .on(table.sessionId)
      .where(sql`${table.sessionId} IS NOT NULL`),

    index('cart_customer_idx')
      .on(table.customerId)
      .where(sql`${table.customerId} IS NOT NULL`),

    index('cart_store_idx').on(table.storeId),
    index('cart_product_idx').on(table.productId),
    index('cart_stale_idx').on(table.createdAt),

    uniqueIndex('cart_customer_unique_idx')
      .on(table.customerId, table.productId, table.variantSku)
      .where(sql`${table.customerId} IS NOT NULL`),

    uniqueIndex('cart_session_unique_idx')
      .on(table.sessionId, table.productId, table.variantSku)
      .where(sql`${table.sessionId} IS NOT NULL`),

    check('chk_cart_qty_positive', sql`${table.quantity} > 0`),
    check('chk_cart_qty_limit', sql`${table.quantity} <= 999`),
    check('chk_cart_price_positive', sql`CAST(${table.priceAtAdd} AS REAL) >= 0`),

    // قيد الملكية الحصري (إما session أو customer وليس كلاهما)
    check(
      'chk_cart_owner_exists',
      sql`
        (${table.sessionId} IS NOT NULL OR ${table.customerId} IS NOT NULL) 
        AND NOT (${table.sessionId} IS NOT NULL AND ${table.customerId} IS NOT NULL)
      `
    ),

    check('chk_variant_sku_not_empty', sql`${table.variantSku} != ''`),
  ]
);

export type CartItem = InferSelectModel<typeof cartItems>;
export type NewCartItem = InferInsertModel<typeof cartItems>;

export type CartVariant = {
  color?: string;
  size?: string;
  material?: string;
  style?: string;
};