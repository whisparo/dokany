// src/lib/db/schema/orders.ts
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
import { customers } from './customers';
import { addresses } from './addresses';
import { coupons } from './coupons';
import { groupBuys } from './group-buys';
import { haggleSessions } from './haggle-sessions';
import { users } from './users';

// ============================================
// 📝 الأنواع المساعدة
// ============================================
export type ShippingAddress = {
  recipientName: string;
  recipientPhone: string;
  country: string;
  city: string;
  area?: string;
  street: string;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
};

// ============================================
// 🛒 جدول الطلبات (Orders) - D1 Compatible
// ============================================
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(),

    storeId: text('store_id').notNull(),
    customerId: text('customer_id').notNull(),
    addressId: text('address_id'),

    // ✅ استخدام mode: 'json' للتوافق التام مع Drizzle ومميزات فك التشفير التلقائي
    shippingAddress: text('shipping_address', { mode: 'json' }).$type<ShippingAddress>().notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),

    currency: text('currency').notNull().default('EGP'),

    // ✅ المبالغ كـ integer (سنتات/أصغر وحدة نقدية)
    subtotal: integer('subtotal').notNull().default(0),
    shippingCost: integer('shipping_cost').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    total: integer('total').notNull(),

    couponCode: text('coupon_code'),
    couponId: text('coupon_id'),

    status: text('status').notNull().default('pending'),
    paymentStatus: text('payment_status').notNull().default('pending'),
    paymentMethod: text('payment_method'),

    customerNotes: text('customer_notes'),
    adminNotes: text('admin_notes'),
    internalNotes: text('internal_notes'),

    haggleSessionId: text('haggle_session_id'),
    originalTotal: integer('original_total'),
    haggleDiscount: integer('haggle_discount').notNull().default(0),
    groupBuyId: text('group_buy_id'),

    source: text('source').default('web'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),

    shippingMethod: text('shipping_method').default('standard'),
    trackingNumber: text('tracking_number'),
    deliveryDate: integer('delivery_date', { mode: 'timestamp' }),

    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    shippedAt: integer('shipped_at', { mode: 'timestamp' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    cancelReason: text('cancel_reason'),
    refundedAt: integer('refunded_at', { mode: 'timestamp' }),
    refundAmount: integer('refund_amount'),

    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),

    // ✅ تعديل صيغة التوقيت لضمان التوافق مع D1 SQLite (unixepoch)
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 العلاقات الخارجية الصارمة (Foreign Keys)
    // ============================================
    foreignKey({ columns: [table.storeId], foreignColumns: [stores.id], name: 'orders_store_id_fkey' }).onDelete('cascade').onUpdate('cascade'),
    foreignKey({ columns: [table.customerId], foreignColumns: [customers.id], name: 'orders_customer_id_fkey' }).onDelete('restrict').onUpdate('cascade'),
    foreignKey({ columns: [table.addressId], foreignColumns: [addresses.id], name: 'orders_address_id_fkey' }).onDelete('set null').onUpdate('cascade'),
    foreignKey({ columns: [table.couponId], foreignColumns: [coupons.id], name: 'orders_coupon_id_fkey' }).onDelete('set null').onUpdate('cascade'),
    foreignKey({ columns: [table.haggleSessionId], foreignColumns: [haggleSessions.id], name: 'orders_haggle_session_id_fkey' }).onDelete('set null').onUpdate('cascade'),
    foreignKey({ columns: [table.groupBuyId], foreignColumns: [groupBuys.id], name: 'orders_group_buy_id_fkey' }).onDelete('set null').onUpdate('cascade'),
    foreignKey({ columns: [table.deletedBy], foreignColumns: [users.id], name: 'orders_deleted_by_fkey' }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🎯 الفهارس الاستراتيجية
    // ============================================
    uniqueIndex('orders_store_number_unique_idx')
      .on(table.storeId, table.orderNumber)
      .where(sql`${table.deletedAt} IS NULL`),

    index('orders_store_idx').on(table.storeId),
    index('orders_customer_idx').on(table.customerId),
    index('orders_status_idx').on(table.status),
    index('orders_store_status_created_idx').on(table.storeId, table.status, table.createdAt),
    index('orders_store_payment_created_idx').on(table.storeId, table.paymentStatus, table.createdAt),
    index('orders_customer_created_idx').on(table.customerId, table.createdAt),
    index('orders_group_buy_idx').on(table.groupBuyId),
    index('orders_haggle_idx').on(table.haggleSessionId),
    index('orders_cancelled_idx').on(table.cancelledAt),
    index('orders_shipped_idx').on(table.shippedAt),
    index('orders_delivery_idx').on(table.deliveryDate),

    index('orders_paid_idx').on(table.paymentStatus).where(sql`${table.paymentStatus} = 'paid'`),
    index('orders_confirmed_unshipped_idx')
      .on(table.status, table.paymentStatus)
      .where(sql`${table.status} = 'confirmed' AND ${table.paymentStatus} = 'paid'`),

    index('orders_not_deleted_idx').on(table.id).where(sql`${table.deletedAt} IS NULL`),
    index('orders_marketing_analytics_idx')
      .on(table.storeId, table.utmSource, table.utmCampaign)
      .where(sql`${table.utmSource} IS NOT NULL`),

    index('orders_payment_method_idx').on(table.paymentMethod),
    index('orders_updated_at_idx').on(table.updatedAt),
    index('orders_deleted_at_idx').on(table.deletedAt),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_order_status', sql`${table.status} IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')`),
    check('chk_payment_status', sql`${table.paymentStatus} IN ('pending', 'paid', 'failed', 'refunded', 'under_review')`),
    check('chk_payment_method', sql`${table.paymentMethod} IS NULL OR ${table.paymentMethod} IN ('cod', 'credit_card', 'wallet', 'bank_transfer', 'installments')`),
    check('chk_shipping_method', sql`${table.shippingMethod} IN ('standard', 'express', 'same-day', 'pickup')`),
    check('chk_order_currency', sql`${table.currency} GLOB '[A-Z][A-Z][A-Z]'`),

    // مبالغ غير سالبة
    check('chk_total_non_negative', sql`${table.total} >= 0`),
    check('chk_subtotal_non_negative', sql`${table.subtotal} >= 0`),
    check('chk_shipping_non_negative', sql`${table.shippingCost} >= 0`),
    check('chk_tax_non_negative', sql`${table.taxAmount} >= 0`),
    check('chk_discount_non_negative', sql`${table.discount} >= 0`),
    check('chk_haggle_discount_non_negative', sql`${table.haggleDiscount} >= 0`),

    // حساب الإجمالي
    check('chk_order_total_calculation', sql`
      ${table.total} = (
        ${table.subtotal} + 
        ${table.shippingCost} + 
        ${table.taxAmount} - 
        ${table.discount}
      )
    `),

    check('chk_recipient_phone', sql`json_extract(${table.shippingAddress}, '$.recipientPhone') IS NOT NULL AND json_extract(${table.shippingAddress}, '$.recipientPhone') != ''`),
    check('chk_recipient_name', sql`json_extract(${table.shippingAddress}, '$.recipientName') IS NOT NULL AND json_extract(${table.shippingAddress}, '$.recipientName') != ''`),
    check('chk_country', sql`json_extract(${table.shippingAddress}, '$.country') IS NOT NULL AND json_extract(${table.shippingAddress}, '$.country') != ''`),

    check('chk_payment_method_required', sql`(${table.paymentMethod} IS NOT NULL) OR (${table.paymentStatus} = 'pending')`),
    check('chk_payment_review', sql`NOT (${table.status} IN ('processing', 'shipped', 'delivered') AND ${table.paymentStatus} = 'under_review')`),
    check('chk_discount_legit', sql`${table.discount} <= ${table.subtotal}`),
    check('chk_haggle_legit', sql`(${table.haggleSessionId} IS NULL) OR (${table.haggleDiscount} <= COALESCE(${table.originalTotal}, 0))`),

    check('chk_no_delete_shipped', sql`(${table.deletedAt} IS NULL) OR (${table.status} NOT IN ('shipped', 'delivered'))`),
    check('chk_coupon_consistency', sql`(${table.couponId} IS NULL) OR (${table.couponCode} IS NOT NULL)`),

    check('chk_confirmed_after_created', sql`(${table.confirmedAt} IS NULL OR ${table.confirmedAt} >= ${table.createdAt})`),
    check('chk_shipped_after_confirmed', sql`(${table.shippedAt} IS NULL OR (${table.confirmedAt} IS NOT NULL AND ${table.shippedAt} >= ${table.confirmedAt}))`),
    check('chk_delivered_after_shipped', sql`(${table.deliveredAt} IS NULL OR (${table.shippedAt} IS NOT NULL AND ${table.deliveredAt} >= ${table.shippedAt}))`),
    check('chk_cancelled_after_created', sql`(${table.cancelledAt} IS NULL OR ${table.cancelledAt} >= ${table.createdAt})`),

    check('chk_status_confirmed', sql`(${table.status} != 'confirmed' OR ${table.confirmedAt} IS NOT NULL)`),
    check('chk_status_shipped', sql`(${table.status} != 'shipped' OR ${table.shippedAt} IS NOT NULL)`),
    check('chk_status_delivered', sql`(${table.status} != 'delivered' OR ${table.deliveredAt} IS NOT NULL)`),
    check('chk_status_cancelled', sql`(${table.status} != 'cancelled' OR ${table.cancelledAt} IS NOT NULL)`),

    check('chk_refund_amount_positive', sql`(${table.refundAmount} IS NULL OR ${table.refundAmount} > 0)`),
    check('chk_refund_amount_max', sql`(${table.refundAmount} IS NULL OR ${table.refundAmount} <= ${table.total})`),
    check('chk_refund_consistency', sql`(${table.refundedAt} IS NULL OR ${table.refundAmount} IS NOT NULL)`),
    check('chk_original_total_exists', sql`(${table.haggleSessionId} IS NULL) OR (${table.originalTotal} IS NOT NULL)`),
    check('chk_deleted_by_consistency', sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`),
  ]
);

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;