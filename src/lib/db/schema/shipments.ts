// src/lib/db/schema/shipments.ts

import type { D1Database } from '@cloudflare/workers-types'; // ✅ تمت الإضافة
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql, eq, and, isNull, desc, count } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { classifyError } from '@/lib/errors/classifier';

// ... باقي الكود (الأنواع، الجدول، الدوال المساعدة) بدون أي تغيير ...
// ============================================
// 📦 أنواع TypeScript
// ============================================

export type ShipmentStatus =
  | 'pending'
  | 'label_created'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_other'
  | 'returned'
  | 'delivery_attempt_failed'
  | 'pickup_failed'
  | 'address_invalid'
  | 'cancelled';

export type ShipmentEvent = {
  timestamp: string;
  status: ShipmentStatus;
  location?: string;
  description?: string;
  actor?: 'system' | 'courier' | 'merchant' | 'customer';
  coordinates?: { latitude: number; longitude: number };
};

export type CustomsInfo = {
  declaredValue?: string;
  harmonizedCode?: string;
  countryOfOrigin?: string;
  description?: string;
  weight?: string;
  quantity?: number;
};

export type ShipmentMetadata = {
  carrierReference?: string;
  serviceLevel?: string;
  insurancePolicyNumber?: string;
  codReceiptNumber?: string;
  [key: string]: unknown;
};

// ============================================
// 🚚 جدول الشحنات (Shipments) - D1 Native
// ============================================

export const shipments = sqliteTable(
  'shipments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // 🔗 العلاقات الأساسية (Tenant Isolation)
    orderId: text('order_id').notNull(),
    storeId: text('store_id').notNull(),
    customerId: text('customer_id'),
    addressId: text('address_id'),

    // 🏢 مزود الشحن ('custom' للتاجر نفسه، أو 'bosta', 'aramex' مستقبلاً)
    provider: text('provider').notNull().default('custom'),
    providerShipmentId: text('provider_shipment_id'),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    carrierService: text('carrier_service'), // ground, air, etc.

    // 🎯 الحالة ونوع الخدمة
    status: text('status').$type<ShipmentStatus>().notNull().default('pending'),
    shippingMethod: text('shipping_method').notNull().default('standard'), // standard, express

    // 💰 التكاليف (تم تحويلها لـ integer بالقرش لسلامة وسرعة العمليات الحسابية)
    cost: integer('cost').notNull().default(0),
    chargedToCustomer: integer('charged_to_customer').notNull().default(0),
    estimatedCost: integer('estimated_cost').notNull().default(0),
    actualCost: integer('actual_cost'),

    // 🛡️ التأمين والدفع عند الاستلام
    insuranceAmount: integer('insurance_amount').notNull().default(0),
    insuranceProvider: text('insurance_provider'),
    codAmount: integer('cod_amount').notNull().default(0),
    codCollected: integer('cod_collected', { mode: 'boolean' }).notNull().default(false),
    codCollectedAt: integer('cod_collected_at', { mode: 'timestamp' }),

    // 📦 الأبعاد والوزن
    weight: text('weight'), // kg
    length: text('length'), // cm
    width: text('width'),   // cm
    height: text('height'),  // cm
    packageCount: integer('package_count').notNull().default(1),

    // 👤 بيانات المستلم السريعة
    recipientName: text('recipient_name'),
    recipientPhone: text('recipient_phone'),
    recipientEmail: text('recipient_email'),

    // 📍 تفاصيل الاستلام والتسليم
    pickupLocation: text('pickup_location'),
    pickupAddress: text('pickup_address', { mode: 'json' }).$type<{ street?: string; city?: string; country?: string }>(),
    
    pickupScheduledAt: integer('pickup_scheduled_at', { mode: 'timestamp' }),
    pickedUpAt: integer('picked_up_at', { mode: 'timestamp' }),
    estimatedDelivery: integer('estimated_delivery', { mode: 'timestamp' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),

    deliveryAttempts: integer('delivery_attempts').notNull().default(0),

    // 🔗 البوليسات والملصقات
    labelUrl: text('label_url'),
    returnLabelUrl: text('return_label_url'),
    returnTrackingNumber: text('return_tracking_number'),

    // ✍️ إثبات الاستلام
    signatureUrl: text('signature_url'),
    signatureCollectedAt: integer('signature_collected_at', { mode: 'timestamp' }),
    deliveryPhotos: text('delivery_photos', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    deliveryInstructions: text('delivery_instructions'),

    // 🌍 الجمارك وسجل تتبع الأحداث والـ Metadata
    customsInfo: text('customs_info', { mode: 'json' }).$type<CustomsInfo>(),
    events: text('events', { mode: 'json' }).$type<ShipmentEvent[]>().notNull().default(sql`'[]'`),
    metadata: text('metadata', { mode: 'json' }).$type<ShipmentMetadata>().notNull().default(sql`'{}'`),
    
    notes: text('notes'),
    failureReason: text('failure_reason'),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    // ============================================
    // 🗝️ الفهارس الفريدة (Unique Indexes)
    // ============================================
    uniqueIndex('shipments_provider_shipment_unique')
      .on(table.provider, table.providerShipmentId)
      .where(sql`provider_shipment_id IS NOT NULL`),

    uniqueIndex('shipments_tracking_number_unique')
      .on(table.trackingNumber)
      .where(sql`tracking_number IS NOT NULL`),

    // ============================================
    // ⚡ فهارس الأداء السريعة (Performance Indexes)
    // ============================================
    index('shipments_order_idx').on(table.orderId),
    index('shipments_store_idx').on(table.storeId),
    index('shipments_customer_idx').on(table.customerId).where(sql`customer_id IS NOT NULL`),
    index('shipments_status_idx').on(table.status),
    index('shipments_deleted_idx').on(table.deletedAt).where(sql`deleted_at IS NULL`),
    
    // Composite indexes للـ Admin Dashboard والفلترة السريعة
    index('shipments_store_status_idx').on(table.storeId, table.status),
    index('shipments_store_created_idx').on(table.storeId, table.createdAt),

    // ============================================
    // 🛡️ القيود والتحققات (Check Constraints)
    // ============================================
    check('chk_shipment_status', sql`${table.status} IN ('pending', 'label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_other', 'returned', 'delivery_attempt_failed', 'pickup_failed', 'address_invalid', 'cancelled')`),
    check('chk_shipping_method', sql`${table.shippingMethod} IN ('standard', 'express', 'same_day', 'next_day', 'economy', 'freight')`),
    
    check('chk_cost_non_negative', sql`${table.cost} >= 0`),
    check('chk_charged_non_negative', sql`${table.chargedToCustomer} >= 0`),
    check('chk_cod_amount_non_negative', sql`${table.codAmount} >= 0`),
    check('chk_package_count_positive', sql`${table.packageCount} >= 1`),
    check('chk_delivery_attempts_non_negative', sql`${table.deliveryAttempts} >= 0`),
    
    check('chk_delivery_photos_limit', sql`json_array_length(${table.deliveryPhotos}) <= 10`),
    check('chk_events_valid', sql`json_valid(${table.events}) = 1`),
    check('chk_metadata_valid', sql`json_valid(${table.metadata}) = 1`),
    check('chk_provider_not_empty', sql`length(${table.provider}) > 0`),
    check('chk_cod_consistency', sql`(${table.codCollected} = 0) OR (${table.codCollected} = 1 AND ${table.codCollectedAt} IS NOT NULL)`),
  ]
);

export type Shipment = InferSelectModel<typeof shipments>;
export type NewShipment = InferInsertModel<typeof shipments>;

// ============================================
// 🛠️ الفانكشنز المساعدة المطهرة (Drizzle Engine)
// ============================================

export function canTransitionStatus(currentStatus: ShipmentStatus, newStatus: ShipmentStatus): boolean {
  const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
    pending: ['label_created', 'cancelled'],
    label_created: ['pickup_scheduled', 'cancelled'],
    pickup_scheduled: ['picked_up', 'pickup_failed', 'cancelled'],
    picked_up: ['in_transit', 'cancelled'],
    in_transit: ['out_for_delivery', 'returned', 'cancelled'],
    out_for_delivery: ['delivered', 'delivery_attempt_failed', 'returned'],
    delivered: ['returned'],
    failed_other: [],
    returned: [],
    delivery_attempt_failed: ['out_for_delivery', 'returned'],
    pickup_failed: ['pickup_scheduled', 'cancelled'],
    address_invalid: ['cancelled'],
    cancelled: [],
  };
  return transitions[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * ✅ جلب شحنة برقم التتبع
 */
export async function getShipmentByTrackingNumber(
  d1Database: D1Database,
  trackingNumber: string
): Promise<Shipment | null> {
  const db = drizzle(d1Database);
  return await db
    .select()
    .from(shipments)
    .where(and(eq(shipments.trackingNumber, trackingNumber), isNull(shipments.deletedAt)))
    .get() || null;
}

/**
 * ✅ جلب شحنات المتجر بالـ Pagination والـ Status الفوري
 */
export async function getStoreShipments(
  d1Database: D1Database,
  storeId: string,
  page: number = 1,
  limit: number = 20,
  status?: ShipmentStatus
): Promise<{ shipments: Shipment[]; total: number }> {
  const db = drizzle(d1Database);
  const offset = (page - 1) * limit;

  const conditions = [eq(shipments.storeId, storeId), isNull(shipments.deletedAt)];
  if (status) conditions.push(eq(shipments.status, status));

  const baseCondition = and(...conditions);

  const shipmentsList = await db
    .select()
    .from(shipments)
    .where(baseCondition)
    .orderBy(desc(shipments.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const totalCount = await db
    .select({ count: count(shipments.id) })
    .from(shipments)
    .where(baseCondition)
    .get();

  return {
    shipments: shipmentsList,
    total: totalCount?.count || 0,
  };
}

/**
 * ✅ تحديث حالة الشحنة وبناء الـ Timeline Events بشكل آلي بالكامل
 */
export async function updateShipmentStatus(
  d1Database: D1Database,
  shipmentId: string,
  newStatus: ShipmentStatus,
  description?: string,
  actor: 'system' | 'courier' | 'merchant' | 'customer' = 'system'
): Promise<Shipment> {
  const db = drizzle(d1Database);

  const currentShipment = await db
    .select()
    .from(shipments)
    .where(and(eq(shipments.id, shipmentId), isNull(shipments.deletedAt)))
    .get();

  if (!currentShipment) {
    throw classifyError(
      new Error('BIZ_404: Shipment not found or already deleted')
    );
  }

  if (!canTransitionStatus(currentShipment.status, newStatus)) {
    throw classifyError(
      new Error(`BIZ_400: Cannot transition shipment state from ${currentShipment.status} to ${newStatus}`),
      { storeId: currentShipment.storeId }
    );
  }

  // إعداد الحدث الجديد
  const newEvent: ShipmentEvent = {
    timestamp: new Date().toISOString(),
    status: newStatus,
    description,
    actor,
  };
  
  const updatedEvents = [...(currentShipment.events || []), newEvent];

  // تجميع التحديثات الزمنية والعدادات ديناميكياً
  const updates: Partial<typeof shipments.$inferInsert> = {
    status: newStatus,
    events: updatedEvents,
    updatedAt: new Date(),
  };

  if (newStatus === 'picked_up') updates.pickedUpAt = new Date();
  if (newStatus === 'delivered') updates.deliveredAt = new Date();
  if (newStatus === 'delivery_attempt_failed') {
    updates.deliveryAttempts = currentShipment.deliveryAttempts + 1;
    updates.lastAttemptAt = new Date();
  }

  const result = await db
    .update(shipments)
    .set(updates)
    .where(eq(shipments.id, shipmentId))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('SYS_500: Failed to update shipment record in D1 engine'),
      { storeId: currentShipment.storeId }
    );
  }
  return result;
}

/**
 * ✅ تسجيل تحصيل مبالغ الـ COD عند الاستلام
 */
export async function recordCODCollection(
  d1Database: D1Database,
  shipmentId: string
): Promise<Shipment> {
  const db = drizzle(d1Database);
  
  const result = await db
    .update(shipments)
    .set({
      codCollected: true,
      codCollectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(shipments.id, shipmentId), isNull(shipments.deletedAt)))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Shipment not found for COD collection process')
    );
  }
  return result;
}

/**
 * ✅ جلب الشحنات المتأخرة عن موعد التوصيل المتوقع لمتابعتها
 */
export async function getDelayedShipments(d1Database: D1Database): Promise<Shipment[]> {
  const db = drizzle(d1Database);
  const now = new Date();

  return await db
    .select()
    .from(shipments)
    .where(
      and(
        sql`${shipments.estimatedDelivery} < ${now.getTime()}`,
        sql`${shipments.status} NOT IN ('delivered', 'returned', 'cancelled')`,
        isNull(shipments.deletedAt)
      )
    )
    .orderBy(shipments.estimatedDelivery)
    .all();
}