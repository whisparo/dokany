// src/lib/validations/shipment.ts

import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🚚 SHIPMENT – نظام التحقق من الشحنات                      ║
// ║  📌 يتحقق من "الشكل" فقط. المنطق الزمني والانتقالات         ║
// ║     وعلاقات الحقول (مثل provider+trackingNumber)            ║
// ║     هي مسؤولية طبقة الخدمة لأن السكيما لا ترى حالة القاعدة.  ║
// ╚════════════════════════════════════════════════════════════╝

// ============================================================
// 📦 الثوابت المطابقة لـ schema/shipments.ts
// ============================================================

export const SHIPMENT_STATUSES = [
  'pending',
  'label_created',
  'pickup_scheduled',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_other',
  'returned',
  'delivery_attempt_failed',
  'pickup_failed',
  'address_invalid',
  'cancelled',
] as const;

export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];

// 📌 الثوابت
const PROVIDER_MAX = 100;
const TRACKING_MAX = 255;
const NOTES_MAX = 1000;
const FAILURE_REASON_MAX = 500;
const PROVIDER_SHIPMENT_ID_MAX = 255;
const WEIGHT_MAX_GRAMS = 10_000_000; // 10000 كجم بالجرام
const PACKAGE_COUNT_MAX = 1000;

// ✅ تحويل Tuple آمن (مرة واحدة)
const STATUS_TUPLE = SHIPMENT_STATUSES as unknown as readonly [string, ...string[]];

// 🛡️ دالة مساعدة للروابط (DRY)
const urlField = () =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === '' ? null : v),
    z.string().url('رابط غير صالح').nullable().optional()
  );

// ============================================================
// 🆕 CREATE SHIPMENT – إنشاء شحنة جديدة
// ============================================================
export const createShipmentSchema = z.object({
  orderId: z.string().uuid('معرف الطلب غير صالح'),
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  provider: z
    .string()
    .trim()
    .min(1, 'اسم مزود الشحن مطلوب')
    .max(PROVIDER_MAX)
    .regex(/^[\p{L}\p{N}\s\-&.']+$/u, 'اسم المزود يحتوي على أحرف غير مسموح بها'),
  providerShipmentId: z
    .string()
    .trim()
    .max(PROVIDER_SHIPMENT_ID_MAX)
    .optional(),
  trackingNumber: z
    .string()
    .trim()
    .min(1)
    .max(TRACKING_MAX)
    .regex(/^[a-zA-Z0-9\-_.]+$/, 'رقم التتبع يحتوي على أحرف غير مسموح بها')
    .optional(),
  cost: z
    .string()
    .trim()
    .regex(/^\d+$/, 'التكلفة يجب أن تكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) >= 0, 'التكلفة لا يمكن أن تكون سالبة')
    .default('0'),
  chargedToCustomer: z
    .string()
    .trim()
    .regex(/^\d+$/, 'المبلغ المحصل يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) >= 0, 'المبلغ المحصل لا يمكن أن يكون سالباً')
    .default('0'),
  weight: z
    .number()
    .int('الوزن يجب أن يكون عدداً صحيحاً (بالجرامات)')
    .nonnegative('الوزن لا يمكن أن يكون سالباً')
    .max(WEIGHT_MAX_GRAMS, `الوزن الأقصى هو ${WEIGHT_MAX_GRAMS / 1000} كجم`)
    .optional(),
  packageCount: z
    .number()
    .int()
    .min(1, 'عدد الطرود يجب أن يكون 1 على الأقل')
    .max(PACKAGE_COUNT_MAX)
    .default(1),
  pickupScheduledAt: z.coerce.date().optional(),
  estimatedDelivery: z.coerce.date().optional(),
  trackingUrl: urlField(),
  labelUrl: urlField(),
  notes: z.string().trim().max(NOTES_MAX).optional(),
}).strict();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

// ============================================================
// ✏️ UPDATE SHIPMENT – تحديث حالة ومعلومات الشحنة
// ============================================================
export const updateShipmentSchema = z
  .object({
    status: z.enum(STATUS_TUPLE).optional(),
    provider: z
      .string()
      .trim()
      .max(PROVIDER_MAX)
      .regex(/^[\p{L}\p{N}\s\-&.']+$/u, 'اسم المزود يحتوي على أحرف غير مسموح بها')
      .optional(),
    providerShipmentId: z
      .string()
      .trim()
      .max(PROVIDER_SHIPMENT_ID_MAX)
      .optional(),
    trackingNumber: z
      .string()
      .trim()
      .min(1)
      .max(TRACKING_MAX)
      .regex(/^[a-zA-Z0-9\-_.]+$/, 'رقم التتبع يحتوي على أحرف غير مسموح بها')
      .optional(),
    cost: z
      .string()
      .trim()
      .regex(/^\d+$/, 'التكلفة يجب أن تكون رقماً صحيحاً (بالقروش)')
      .refine((v) => BigInt(v) >= 0, 'التكلفة لا يمكن أن تكون سالبة')
      .nullable()
      .optional(),
    chargedToCustomer: z
      .string()
      .trim()
      .regex(/^\d+$/, 'المبلغ المحصل يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => BigInt(v) >= 0, 'المبلغ المحصل لا يمكن أن يكون سالباً')
      .nullable()
      .optional(),
    weight: z
      .number()
      .int('الوزن يجب أن يكون عدداً صحيحاً (بالجرامات)')
      .nonnegative('الوزن لا يمكن أن يكون سالباً')
      .max(WEIGHT_MAX_GRAMS)
      .nullable()
      .optional(),
    packageCount: z
      .number()
      .int()
      .min(1)
      .max(PACKAGE_COUNT_MAX)
      .nullable()
      .optional(),
    pickedUpAt: z.coerce.date().optional(),
    estimatedDelivery: z.coerce.date().optional(),
    deliveredAt: z.coerce.date().optional(),
    trackingUrl: urlField(),
    labelUrl: urlField(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    failureReason: z
      .string()
      .trim()
      .min(3, 'سبب الفشل يجب أن لا يقل عن 3 أحرف')
      .max(FAILURE_REASON_MAX)
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (d) => {
      if (
        d.status &&
        ['failed_other', 'returned', 'delivery_attempt_failed', 'pickup_failed', 'address_invalid'].includes(d.status) &&
        !d.failureReason
      )
        return false;
      return true;
    },
    { message: 'يجب إرسال سبب الفشل عند تحديث الحالة إلى فشل أو إرجاع', path: ['failureReason'] }
  );

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;