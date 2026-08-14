// src/lib/db/schema/order-items.ts
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

import { orders } from './orders';
import { products } from './products';

// ============================================
// 📥 أنواع TypeScript
// ============================================

export type OrderItemStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled';
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'processed' | 'refunded';

export type ProductOptions = {
  color?: string;
  size?: string;
  material?: string;
  style?: string;
  sleeveLength?: string;
  neckType?: string;
  [key: string]: string | undefined;
};

export type OrderItemMetadata = {
  batchNumber?: string;
  manufacturingDate?: string;
  qualityChecked?: boolean;
  qualityInspector?: string;
  [key: string]: unknown;
};

// ============================================
// 📋 جدول عناصر الطلب (Order Items) - D1 Optimized
// ============================================

export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // 🔗 العلاقات الأساسية
    orderId: text('order_id').notNull(),
    productId: text('product_id'),
    storeId: text('store_id').notNull(),

    variantSku: text('variant_sku').notNull(),

    // ============================================
    // 📸 Snapshot البيانات لحظة الشراء
    // ============================================
    productName: text('product_name').notNull(),
    productSlug: text('product_slug'),
    productImage: text('product_image'),
    productSku: text('product_sku').notNull(),

    productOptions: text('product_options', { mode: 'json' })
      .$type<ProductOptions>()
      .notNull()
      .default(sql`'{}'`),

    // ============================================
    // 📦 الكميات
    // ============================================
    orderedQty: integer('ordered_qty').notNull().default(1),
    cancelledQty: integer('cancelled_qty').notNull().default(0),
    shippedQty: integer('shipped_qty').notNull().default(0),
    returnedQty: integer('returned_qty').notNull().default(0),

    // ============================================
    // 💰 الأسعار والمبالغ (integer - قروش)
    // ============================================
    price: integer('price').notNull(),
    lineTotal: integer('line_total').notNull(),
    originalPrice: integer('original_price').notNull(),
    haggleDiscount: integer('haggle_discount').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    taxRate: integer('tax_rate').notNull().default(0),
    shippingCost: integer('shipping_cost').notNull().default(0),
    shippingMethod: text('shipping_method'),
    commissionRate: integer('commission_rate').notNull().default(0),
    commissionAmount: integer('commission_amount').notNull().default(0),
    netAmount: integer('net_amount').notNull(),

    // 🚚 أبعاد الشحن
    weight: text('weight'),
    length: text('length'),
    width: text('width'),
    height: text('height'),

    // 🎯 الحالة والتتبع
    status: text('status').notNull().default('pending'),
    fulfillmentStatus: text('fulfillment_status').notNull().default('unfulfilled'),

    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    carrier: text('carrier'),
    shippedAt: integer('shipped_at', { mode: 'timestamp' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),

    // ↩️ الإرجاع
    returnStatus: text('return_status'),
    returnReason: text('return_reason'),
    returnRequestedAt: integer('return_requested_at', { mode: 'timestamp' }),
    returnProcessedAt: integer('return_processed_at', { mode: 'timestamp' }),
    refundAmount: integer('refund_amount').notNull().default(0),

    // 🗃️ المخزن والملاحظات
    warehouseLocation: text('warehouse_location'),
    batchNumber: text('batch_number'),
    expiryDate: integer('expiry_date', { mode: 'timestamp' }),
    notes: text('notes'),

    metadata: text('metadata', { mode: 'json' })
      .$type<OrderItemMetadata>()
      .notNull()
      .default(sql`'{}'`),

    // ✅ التوقيت التلقائي المباشر عبر DB Engine
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
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'order_items_order_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'order_items_product_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس
    // ============================================
    // ✅ الفهرس الفريد آمن تماماً للعملاء المتغيرين والـ Nullable Products
    uniqueIndex('order_items_order_variant_unique')
      .on(table.orderId, table.variantSku),

    index('order_items_order_idx').on(table.orderId),
    index('order_items_product_idx').on(table.productId).where(sql`${table.productId} IS NOT NULL`),
    index('order_items_store_idx').on(table.storeId),
    index('order_items_variant_sku_idx').on(table.variantSku),
    index('order_items_product_sku_idx').on(table.productSku),
    index('order_items_status_idx').on(table.status),
    index('order_items_fulfillment_idx').on(table.fulfillmentStatus),
    
    index('order_items_tracking_idx').on(table.trackingNumber).where(sql`${table.trackingNumber} IS NOT NULL`),
    index('order_items_carrier_idx').on(table.carrier).where(sql`${table.carrier} IS NOT NULL`),
    index('order_items_return_status_idx').on(table.returnStatus).where(sql`${table.returnStatus} IS NOT NULL`),
    
    index('order_items_store_order_idx').on(table.storeId, table.orderId),
    index('order_items_store_status_idx').on(table.storeId, table.status),
    index('order_items_order_status_idx').on(table.orderId, table.status),

    // ============================================
    // 🛡️ القيود المنطقية (Check Constraints)
    // ============================================
    check('chk_item_status', sql`${table.status} IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')`),
    check('chk_fulfillment_status', sql`${table.fulfillmentStatus} IN ('unfulfilled', 'partial', 'fulfilled')`),
    check('chk_return_status', sql`${table.returnStatus} IS NULL OR ${table.returnStatus} IN ('requested', 'approved', 'rejected', 'processed', 'refunded')`),
    
    // قيود الكميات
    check('chk_qty_positive', sql`${table.orderedQty} > 0`),
    check('chk_cancelled_positive', sql`${table.cancelledQty} >= 0`),
    check('chk_shipped_positive', sql`${table.shippedQty} >= 0`),
    check('chk_returned_positive', sql`${table.returnedQty} >= 0`),
    check('chk_qty_integrity', sql`${table.cancelledQty} + ${table.shippedQty} <= ${table.orderedQty}`),
    check('chk_return_limit', sql`${table.returnedQty} <= ${table.shippedQty}`),

    // النطاقات المئوية
    check('chk_tax_rate_range', sql`${table.taxRate} >= 0 AND ${table.taxRate} <= 100`),
    check('chk_commission_rate_range', sql`${table.commissionRate} >= 0 AND ${table.commissionRate} <= 100`),

    // قيود المبالغ (integer)
    check('chk_price_positive', sql`${table.price} >= 0`),
    check('chk_line_total_positive', sql`${table.lineTotal} >= 0`),
    check('chk_original_price_positive', sql`${table.originalPrice} >= 0`),
    check('chk_haggle_discount_non_negative', sql`${table.haggleDiscount} >= 0`),
    check('chk_discount_non_negative', sql`${table.discount} >= 0`),
    check('chk_tax_non_negative', sql`${table.taxAmount} >= 0`),
    check('chk_shipping_non_negative', sql`${table.shippingCost} >= 0`),
    check('chk_commission_non_negative', sql`${table.commissionAmount} >= 0`),
    check('chk_net_amount_positive', sql`${table.netAmount} >= 0`),

    // سلامة النصوص
    check('chk_sku_not_empty', sql`${table.productSku} != ''`),
    check('chk_variant_sku_not_empty', sql`${table.variantSku} != ''`),
    check('chk_product_name_not_empty', sql`${table.productName} != ''`),
  ]
);

export type OrderItem = InferSelectModel<typeof orderItems>;
export type NewOrderItem = InferInsertModel<typeof orderItems>;

// ============================================
// 🛠️ الدوال المساعدة
// ============================================

export function calculateLineTotal(price: number, quantity: number): number {
  return price * quantity;
}

export function calculateCommission(lineTotal: number, rate: number): number {
  return Math.round((lineTotal * rate) / 100);
}

export function calculateTax(lineTotal: number, rate: number): number {
  return Math.round((lineTotal * rate) / 100);
}

export function calculateNetAmount(lineTotal: number, discount: number, tax: number, commission: number): number {
  return lineTotal - discount + tax - commission;
}

export function canReturnItem(item: OrderItem): boolean {
  return (
    item.status === 'delivered' &&
    item.returnedQty < item.shippedQty &&
    (!item.returnStatus || item.returnStatus === 'rejected')
  );
}

export function getReturnableQuantity(item: OrderItem): number {
  return item.shippedQty - item.returnedQty;
}

export function canShipItem(item: OrderItem): boolean {
  return (
    (item.status === 'pending' || item.status === 'processing') &&
    item.shippedQty < item.orderedQty - item.cancelledQty
  );
}

export function getShippableQuantity(item: OrderItem): number {
  return item.orderedQty - item.cancelledQty - item.shippedQty;
}

export function updateFulfillmentStatus(item: OrderItem): FulfillmentStatus {
  if (item.shippedQty === 0) return 'unfulfilled';
  if (item.shippedQty >= item.orderedQty - item.cancelledQty) return 'fulfilled';
  return 'partial';
}