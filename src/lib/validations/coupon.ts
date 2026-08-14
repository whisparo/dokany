// src/lib/validations/coupon.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🎟️ COUPON – نظام التحقق من الكوبونات                     ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.               ║
// ║     المنطق التجاري المعقد (مثل تراكم الخصومات) في الخدمة.    ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const CODE_MIN = 3;
const CODE_MAX = 50;
const DESC_MAX = 1000;

// --- دوال مساعدة للتحقق ---

/** التحقق من صحة قيمة الكوبون الثابت (fixed) */
function validateFixedValue(value: string, minOrderAmount: string): boolean {
  const val = BigInt(value);
  // القيمة يجب أن تكون موجبة دائماً
  if (val <= 0) return false;
  // إذا كان الحد الأدنى للطلب = 0، أي قيمة موجبة مقبولة
  if (minOrderAmount === '0') return true;
  const min = BigInt(minOrderAmount);
  return val <= min;
}

/** التحقق من صحة قيمة النسبة المئوية (percentage) */
function validatePercentageValue(value: string): boolean {
  const val = BigInt(value);
  return val >= BigInt(1) && val <= BigInt(100);
}

/** التحقق من أن الحد الأقصى للخصم (إن وجد) لا يقل عن 1 للكوبونات النسبية */
function validateMaxDiscount(percentage: boolean, maxDiscount?: string): boolean {
  if (!percentage || !maxDiscount) return true;
  return BigInt(maxDiscount) >= BigInt(1);
}

// --- حقول مشتركة (لا تتضمن type) ---
const baseFields = {
  storeId: z.uuid('معرف المتجر غير صالح'),
  code: z
    .string()
    .trim()
    .min(CODE_MIN)
    .max(CODE_MAX)
    .regex(/^[A-Z0-9_]+$/, 'الكود يجب أن يكون أحرفاً إنجليزية كبيرة وأرقام وشرطات سفلية'),
  description: z.string().trim().max(DESC_MAX).nullable().optional(),
  minOrderAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأدنى للطلب يجب أن يكون رقماً صحيحاً (بالقروش)')
    .nullable()
    .default('0'),
  maxDiscountAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأقصى للخصم يجب أن يكون رقماً صحيحاً (بالقروش)')
    .nullable()
    .optional(),
  applicableCategories: z
    .array(z.uuid('معرف التصنيف غير صالح'))
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس التصنيف')
    .nullable()
    .default([]),
  applicableProducts: z
    .array(z.uuid('معرف المنتج غير صالح'))
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس المنتج')
    .nullable()
    .default([]),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().default(1),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
};

// --- حقول للتحديث (جميعها اختيارية) ---
const updateFields = {
  code: z
    .string()
    .trim()
    .min(CODE_MIN)
    .max(CODE_MAX)
    .regex(/^[A-Z0-9_]+$/, 'الكود يجب أن يكون أحرفاً إنجليزية كبيرة وأرقام وشرطات سفلية')
    .optional(),
  description: z.string().trim().max(DESC_MAX).nullable().optional(),
  minOrderAmount: z.string().trim().regex(/^\d+$/).nullable().optional(),
  maxDiscountAmount: z.string().trim().regex(/^\d+$/).nullable().optional(),
  applicableCategories: z
    .array(z.uuid('معرف التصنيف غير صالح'))
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس التصنيف')
    .nullable()
    .optional(),
  applicableProducts: z
    .array(z.uuid('معرف المنتج غير صالح'))
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس المنتج')
    .nullable()
    .optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
};

// ============================================================
// 🆕 CREATE COUPON – إنشاء كوبون جديد
// ============================================================
export const createCouponSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('percentage'),
        value: z
          .string()
          .trim()
          .regex(/^\d+$/, 'النسبة يجب أن تكون رقماً صحيحاً')
          .refine((v) => validatePercentageValue(v), 'النسبة المئوية يجب أن تكون بين 1 و 100'),
        ...baseFields,
      })
      .strict(),
    z
      .object({
        type: z.literal('fixed'),
        value: z
          .string()
          .trim()
          .regex(/^\d+$/, 'القيمة يجب أن تكون رقماً صحيحاً (بالقروش)')
          .refine((v) => BigInt(v) > BigInt(0), 'القيمة يجب أن تكون أكبر من صفر'),
        ...baseFields,
      })
      .strict(),
  ])
  .refine(
    (d) => {
      if (d.type === 'fixed') {
        return validateFixedValue(d.value, d.minOrderAmount || '0');
      }
      return true;
    },
    { message: 'قيمة الكوبون الثابت لا يمكن أن تتجاوز الحد الأدنى للطلب', path: ['value'] }
  )
  .refine(
    (d) => {
      if (d.type === 'percentage') {
        return validateMaxDiscount(true, d.maxDiscountAmount ?? undefined);
      }
      return true;
    },
    { message: 'الحد الأقصى للخصم يجب أن يكون 1 على الأقل', path: ['maxDiscountAmount'] }
  )
  .refine(
    (d) => {
      if (d.startsAt && d.expiresAt && d.startsAt >= d.expiresAt) return false;
      return true;
    },
    { message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية', path: ['expiresAt'] }
  );

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

// ============================================================
// ✏️ UPDATE COUPON – تحديث كوبون
// ============================================================
export const updateCouponSchema = z
  .union([
    // 🎯 حالة 1: تحديث النوع والقيمة معًا
    z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('percentage'),
          value: z
            .string()
            .trim()
            .regex(/^\d+$/, 'النسبة يجب أن تكون رقماً صحيحاً')
            .refine((v) => validatePercentageValue(v), 'النسبة المئوية يجب أن تكون بين 1 و 100'),
          ...updateFields,
        })
        .strict(),
      z
        .object({
          type: z.literal('fixed'),
          value: z
            .string()
            .trim()
            .regex(/^\d+$/, 'القيمة يجب أن تكون رقماً صحيحاً (بالقروش)')
            .refine((v) => BigInt(v) > BigInt(0), 'القيمة يجب أن تكون أكبر من صفر'),
          ...updateFields,
        })
        .strict(),
    ]),
    // 🎯 حالة 2: تحديث أي حقل آخر بدون تغيير النوع (لا يوجد type ولا value)
    z
      .object({
        ...updateFields,
      })
      .strict(),
  ])
  .refine(
    (d) => {
      if ('type' in d && d.type === 'fixed' && d.value) {
        const minOrder = d.minOrderAmount ?? '0';
        return validateFixedValue(d.value, minOrder);
      }
      if ('type' in d && d.type === 'percentage' && d.value) {
        return validatePercentageValue(d.value);
      }
      return true;
    },
    { message: 'قيمة الكوبون الثابت لا يمكن أن تتجاوز الحد الأدنى للطلب', path: ['value'] }
  )
  .refine(
    (d) => {
      if ('type' in d && d.type === 'percentage' && d.maxDiscountAmount !== undefined) {
        return validateMaxDiscount(true, d.maxDiscountAmount ?? undefined);
      }
      return true;
    },
    { message: 'الحد الأقصى للخصم يجب أن يكون 1 على الأقل', path: ['maxDiscountAmount'] }
  )
  .refine(
    (d) => {
      if (d.startsAt && d.expiresAt && d.startsAt >= d.expiresAt) return false;
      return true;
    },
    { message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية', path: ['expiresAt'] }
  );

export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

// ============================================================
// 💰 VALIDATE COUPON – التحقق من صلاحية كوبون للخصم
// ============================================================
export const validateCouponSchema = z
  .object({
    code: z.string().trim().min(1, 'كود الكوبون مطلوب'),
    storeId: z.uuid('معرف المتجر غير صالح'),
    orderAmount: z
      .string()
      .trim()
      .regex(/^\d+$/, 'قيمة الطلب يجب أن تكون رقماً صحيحاً (بالقروش)')
      .refine((v) => BigInt(v) > BigInt(0), 'قيمة الطلب يجب أن تكون أكبر من صفر'),
    productIds: z.array(z.uuid('معرف المنتج غير صالح')).nullable().optional(),
    categoryIds: z.array(z.uuid('معرف التصنيف غير صالح')).nullable().optional(),
    customerId: z.uuid('معرف العميل غير صالح').nullable().optional(),
  })
  .strict();

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;