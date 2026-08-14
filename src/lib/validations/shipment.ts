// src/lib/validations/shipment.ts

import { z } from 'zod';

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

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

// الحالات التي تتطلب سبب الفشل
const FAILURE_REQUIRED_STATUSES: ShipmentStatus[] = [
  'failed_other',
  'returned',
  'delivery_attempt_failed',
  'pickup_failed',
  'address_invalid',
];

// 📌 الثوابت
const PROVIDER_MAX = 100;
const TRACKING_MAX = 255;
const NOTES_MAX = 1000;
const FAILURE_REASON_MAX = 500;
const PROVIDER_SHIPMENT_ID_MAX = 255;
const WEIGHT_MAX_GRAMS = 10_000_000; // 10,000 كجم بالجرام
const PACKAGE_COUNT_MAX = 1000;

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

/** دالة مساعدة للروابط تمنع تحذيرات الـ Deprecation وتعالج القيم الفارغة بأمان */
const urlField = () =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? null : v),
    z.string().url('رابط غير صالح').nullable().optional()
  );

/** التحقق من أن القيمة النقدية نصية وموجبة (بالقروش) */
function validatePositiveAmount(value: string | null | undefined): boolean {
  if (!value) return true;
  if (!/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) >= BigInt(0);
  } catch {
    return false;
  }
}

/** التحقق من أن الحالة تتطلب سبب فشل */
function requiresFailureReason(status?: ShipmentStatus): boolean {
  if (!status) return false;
  return FAILURE_REQUIRED_STATUSES.includes(status);
}

// ============================================================
// 🆕 CREATE SHIPMENT – إنشاء شحنة جديدة
// ============================================================
export const createShipmentSchema = z
  .object({
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
      .min(1, 'رقم التتبع لا يمكن أن يكون فارغاً')
      .max(TRACKING_MAX)
      .regex(/^[a-zA-Z0-9\-_.]+$/, 'رقم التتبع يحتوي على أحرف غير مسموح بها')
      .optional(),
    cost: z
      .string()
      .trim()
      .regex(/^\d+$/, 'التكلفة يجب أن تكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositiveAmount(v), 'التكلفة لا يمكن أن تكون سالبة')
      .default('0'),
    chargedToCustomer: z
      .string()
      .trim()
      .regex(/^\d+$/, 'المبلغ المحصل يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositiveAmount(v), 'المبلغ المحصل لا يمكن أن يكون سالباً')
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
  })
  .strict();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

// ============================================================
// ✏️ UPDATE SHIPMENT – تحديث حالة ومعلومات الشحنة
// ============================================================
export const updateShipmentSchema = z
  .object({
    status: z.enum(SHIPMENT_STATUSES).optional(),
    provider: z
      .string()
      .trim()
      .min(1, 'اسم مزود الشحن لا يمكن أن يكون فارغاً')
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
      .min(1, 'رقم التتبع لا يمكن أن يكون فارغاً')
      .max(TRACKING_MAX)
      .regex(/^[a-zA-Z0-9\-_.]+$/, 'رقم التتبع يحتوي على أحرف غير مسموح بها')
      .optional(),
    cost: z
      .string()
      .trim()
      .regex(/^\d+$/, 'التكلفة يجب أن تكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositiveAmount(v), 'التكلفة لا يمكن أن تكون سالبة')
      .nullable()
      .optional(),
    chargedToCustomer: z
      .string()
      .trim()
      .regex(/^\d+$/, 'المبلغ المحصل يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositiveAmount(v), 'المبلغ المحصل لا يمكن أن يكون سالباً')
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
      if (d.status && requiresFailureReason(d.status) && !d.failureReason) {
        return false;
      }
      return true;
    },
    { message: 'يجب إرسال سبب الفشل عند تحديث الحالة إلى فشل أو إرجاع', path: ['failureReason'] }
  )
  .refine(
    (d) => {
      if (d.pickedUpAt && d.deliveredAt) {
        return d.deliveredAt >= d.pickedUpAt;
      }
      return true;
    },
    { message: 'تاريخ التسليم لا يمكن أن يكون قبل تاريخ الاستلام', path: ['deliveredAt'] }
  );

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;