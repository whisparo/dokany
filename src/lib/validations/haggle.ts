// src/lib/validations/haggle.ts

import { z } from 'zod';

// ============================================================
// 📦 الثوابت المطابقة لـ schema/haggle-sessions.ts
// ============================================================

export const HAGGLE_STATUSES = [
  'active',
  'counter_offered',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
] as const;

export const HAGGLE_STRATEGIES = [
  'aggressive',
  'friendly',
  'middle_ground',
] as const;

export type HaggleStatus = (typeof HAGGLE_STATUSES)[number];
export type HaggleStrategy = (typeof HAGGLE_STRATEGIES)[number];

// الحالات النهائية (لا يمكن تغييرها بعد ذلك)
const FINAL_STATUSES: readonly HaggleStatus[] = ['accepted', 'rejected', 'expired', 'cancelled'];

// 📌 الثوابت
const MESSAGE_MAX = 500;
const EXPIRY_TOLERANCE_MS = 5000; // هامش تسامح زمني (5 ثوانٍ)

// ============================================================
// 🛠️ دوال مساعدة للتحقق
// ============================================================

/** التحقق من أن السعر أكبر من صفر */
function validatePositivePrice(value: string): boolean {
  try {
    return BigInt(value) > 0;
  } catch {
    return false;
  }
}

/** التحقق من أن السعر يقع بين الحد الأدنى والسعر الأصلي */
function validateOfferRange(offer: string, minPrice: string, originalPrice: string): boolean {
  try {
    const offerNum = BigInt(offer);
    const min = BigInt(minPrice);
    const max = BigInt(originalPrice);
    return offerNum >= min && offerNum <= max;
  } catch {
    return false;
  }
}

/** التحقق من أن الحد الأدنى لا يتجاوز السعر الأصلي */
function validateMinPrice(minPrice: string, originalPrice: string): boolean {
  try {
    return BigInt(minPrice) <= BigInt(originalPrice);
  } catch {
    return false;
  }
}

/** التحقق من أن تاريخ الانتهاء في المستقبل */
function validateExpiryDate(expiresAt: Date): boolean {
  return expiresAt.getTime() > Date.now() - EXPIRY_TOLERANCE_MS;
}

// ============================================================
// 🆕 CREATE HAGGLE – بدء جلسة فصال جديدة
// ============================================================
export const createHaggleSchema = z
  .object({
    storeId: z.uuid('معرف المتجر غير صالح'),
    productId: z.uuid('معرف المنتج غير صالح'),
    originalPrice: z
      .string()
      .trim()
      .regex(/^\d+$/, 'السعر الأصلي يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'السعر الأصلي يجب أن يكون أكبر من صفر'),
    minAllowedPrice: z
      .string()
      .trim()
      .regex(/^\d+$/, 'الحد الأدنى يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'الحد الأدنى يجب أن يكون أكبر من صفر'),
    currentOffer: z
      .string()
      .trim()
      .regex(/^\d+$/, 'العرض الحالي يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'العرض الحالي يجب أن يكون أكبر من صفر'),
    maxRounds: z
      .number()
      .int()
      .min(1, 'الحد الأدنى للجولات هو 1')
      .max(10, 'الحد الأقصى للجولات هو 10')
      .default(5),
    strategyUsed: z.enum(HAGGLE_STRATEGIES).optional(),
    expiresAt: z.coerce.date(),
  })
  .strict()
  .refine(
    (d) => validateMinPrice(d.minAllowedPrice, d.originalPrice),
    { message: 'الحد الأدنى لا يمكن أن يتجاوز السعر الأصلي', path: ['minAllowedPrice'] }
  )
  .refine(
    (d) => validateOfferRange(d.currentOffer, d.minAllowedPrice, d.originalPrice),
    { message: 'العرض الحالي يجب أن يكون بين الحد الأدنى والسعر الأصلي', path: ['currentOffer'] }
  )
  .refine(
    (d) => validateExpiryDate(d.expiresAt),
    { message: 'تاريخ الانتهاء يجب أن يكون في المستقبل', path: ['expiresAt'] }
  );

export type CreateHaggleInput = z.infer<typeof createHaggleSchema>;

// ============================================================
// ✏️ UPDATE HAGGLE – تحديث حالة الجلسة وعروضها
// ============================================================
export const updateHaggleSchema = z
  .object({
    status: z.enum(HAGGLE_STATUSES).optional(),
    currentOffer: z
      .string()
      .trim()
      .regex(/^\d+$/, 'العرض الحالي يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'العرض الحالي يجب أن يكون أكبر من صفر')
      .optional(),
    minAllowedPrice: z
      .string()
      .trim()
      .regex(/^\d+$/, 'الحد الأدنى يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'الحد الأدنى يجب أن يكون أكبر من صفر')
      .optional(),
    finalPrice: z
      .string()
      .trim()
      .regex(/^\d+$/, 'السعر النهائي يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => validatePositivePrice(v), 'السعر النهائي يجب أن يكون أكبر من صفر')
      .optional(),
    discountAmount: z
      .string()
      .trim()
      .regex(/^\d+$/, 'مبلغ الخصم يجب أن يكون رقماً صحيحاً (بالقروش)')
      .refine((v) => BigInt(v) >= BigInt(0), 'مبلغ الخصم لا يمكن أن يكون سالباً')
      .optional(),
    strategyUsed: z.enum(HAGGLE_STRATEGIES).optional(),
    message: z.string().trim().max(MESSAGE_MAX).optional(),
  })
  .strict()
  // منع إرسال عروض/رسائل/استراتيجية إذا كانت الحالة المرسلة نهائية
  .refine(
    (d) => {
      if (d.status && FINAL_STATUSES.includes(d.status)) {
        if (d.currentOffer || d.message || d.strategyUsed) return false;
      }
      return true;
    },
    { message: 'لا يمكن إرسال عرض أو رسالة أو استراتيجية مع حالة نهائية', path: ['status'] }
  )
  // إذا أُرسل currentOffer مع minAllowedPrice، يجب ألا يقل عن الحد الأدنى
  .refine(
    (d) => {
      if (d.currentOffer && d.minAllowedPrice) {
        return BigInt(d.currentOffer) >= BigInt(d.minAllowedPrice);
      }
      return true;
    },
    { message: 'العرض الحالي لا يمكن أن يقل عن الحد الأدنى', path: ['currentOffer'] }
  )
  // عند القبول، يجب وجود سعر نهائي
  .refine(
    (d) => {
      if (d.status === 'accepted' && !d.finalPrice) {
        return false;
      }
      return true;
    },
    { message: 'يجب إرسال السعر النهائي عند قبول الجلسة', path: ['finalPrice'] }
  )
  // مبلغ الخصم يرسل فقط مع حالة منتهية
  .refine(
    (d) => {
      if (d.discountAmount && d.status && !FINAL_STATUSES.includes(d.status)) {
        return false;
      }
      return true;
    },
    { message: 'مبلغ الخصم لا يمكن إرساله إلا مع حالة منتهية', path: ['discountAmount'] }
  );

export type UpdateHaggleInput = z.infer<typeof updateHaggleSchema>;