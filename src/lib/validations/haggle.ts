// src/lib/validations/haggle.ts

import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  💬 HAGGLE – نظام التحقق من جلسات الفصال الذكى            ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.              ║
// ║     استراتيجية البوت والانتقالات في الخدمة.                 ║
// ║  📌 القيم مُعرّفة هنا لتطابق الـ Schema مباشرةً.           ║
// ╚════════════════════════════════════════════════════════════╝

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

// الحالات النهائية (لا يمكن تغييرها بعد ذلك)
const FINAL_STATUSES: readonly string[] = ['accepted', 'rejected', 'expired', 'cancelled'];

// 📌 الثوابت
const STRATEGY_MAX = 50;
const MESSAGE_MAX = 500;
const EXPIRY_TOLERANCE_MS = 5000; // هامش تسامح زمني (5 ثوانٍ)

// ✅ تحويل Tuple آمن
const STATUS_TUPLE = HAGGLE_STATUSES as unknown as readonly [string, ...string[]];

// ============================================================
// 🆕 CREATE HAGGLE – بدء جلسة فصال جديدة
// ============================================================
export const createHaggleSchema = z.object({
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  productId: z.string().uuid('معرف المنتج غير صالح'),
  originalPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'السعر الأصلي يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'السعر الأصلي يجب أن يكون أكبر من صفر'),
  minAllowedPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأدنى يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'الحد الأدنى يجب أن يكون أكبر من صفر'),
  currentOffer: z
    .string()
    .trim()
    .regex(/^\d+$/, 'العرض الحالي يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'العرض الحالي يجب أن يكون أكبر من صفر'),
  maxRounds: z.number().int().min(1, 'الحد الأدنى للجولات هو 1').max(10, 'الحد الأقصى للجولات هو 10').default(5),
  strategyUsed: z.string().trim().max(STRATEGY_MAX).optional(),
  expiresAt: z.coerce.date(),
}).strict()
  .refine(
    (d) => BigInt(d.minAllowedPrice) <= BigInt(d.originalPrice),
    { message: 'الحد الأدنى لا يمكن أن يتجاوز السعر الأصلي', path: ['minAllowedPrice'] }
  )
  .refine(
    (d) => {
      const min = BigInt(d.minAllowedPrice);
      const max = BigInt(d.originalPrice);
      const offer = BigInt(d.currentOffer);
      return offer >= min && offer <= max;
    },
    { message: 'العرض الحالي يجب أن يكون بين الحد الأدنى والسعر الأصلي', path: ['currentOffer'] }
  )
  .refine(
    (d) => d.expiresAt.getTime() > Date.now() - EXPIRY_TOLERANCE_MS,
    { message: 'تاريخ الانتهاء يجب أن يكون في المستقبل', path: ['expiresAt'] }
  );

export type CreateHaggleInput = z.infer<typeof createHaggleSchema>;

// ============================================================
// ✏️ UPDATE HAGGLE – تحديث حالة الجلسة وعروضها
// ============================================================
export const updateHaggleSchema = z.object({
  status: z.enum(STATUS_TUPLE).optional(),
  currentOffer: z
    .string()
    .trim()
    .regex(/^\d+$/, 'العرض الحالي يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'العرض الحالي يجب أن يكون أكبر من صفر')
    .optional(),
  // 📌 لإرسال الحد الأدنى مع العرض الجديد (إذا تغير)
  minAllowedPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأدنى يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'الحد الأدنى يجب أن يكون أكبر من صفر')
    .optional(),
  finalPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'السعر النهائي يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > 0, 'السعر النهائي يجب أن يكون أكبر من صفر')
    .optional(),
  discountAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'مبلغ الخصم يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) >= 0, 'مبلغ الخصم لا يمكن أن يكون سالباً')
    .optional(),
  strategyUsed: z.string().trim().max(STRATEGY_MAX).optional(),
  message: z.string().trim().max(MESSAGE_MAX).optional(),
}).strict()
  // 🛡️ منع إرسال عروض/رسائل/استراتيجية إذا كانت الحالة المرسلة نهائية
  .refine(
    (d) => {
      if (d.status && FINAL_STATUSES.includes(d.status)) {
        if (d.currentOffer || d.message || d.strategyUsed) return false;
      }
      return true;
    },
    { message: 'لا يمكن إرسال عرض أو رسالة أو استراتيجية مع حالة نهائية', path: ['status'] }
  )
  // 🛡️ إذا أُرسل currentOffer مع minAllowedPrice، يجب ألا يقل عن الحد الأدنى
  .refine(
    (d) => {
      if (d.currentOffer && d.minAllowedPrice) {
        return BigInt(d.currentOffer) >= BigInt(d.minAllowedPrice);
      }
      return true;
    },
    { message: 'العرض الحالي لا يمكن أن يقل عن الحد الأدنى', path: ['currentOffer'] }
  )
  // 🛡️ عند القبول، يجب وجود سعر نهائي (ملاحظة: الـ 'converted' غير موجود في الـ Schema)
  .refine(
    (d) => {
      if (d.status === 'accepted' && !d.finalPrice) {
        return false;
      }
      return true;
    },
    { message: 'يجب إرسال السعر النهائي عند قبول الجلسة', path: ['finalPrice'] }
  )
  // 🛡️ مبلغ الخصم يرسل فقط مع حالة منتهية
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