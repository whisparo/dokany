// src/lib/validations/coupon.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🎟️ COUPON – نظام التحقق من الكوبونات                       ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.              ║
// ║     المنطق التجاري المعقد (مثل تراكم الخصومات) في الخدمة.    ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const CODE_MIN = 3;
const CODE_MAX = 50;
const DESC_MAX = 1000;

// --- حقول مشتركة (لا تتضمن type) ---
const baseFields = {
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  code: z.string().trim().min(CODE_MIN).max(CODE_MAX)
    .regex(/^[A-Z0-9_]+$/, 'الكود يجب أن يكون أحرفاً إنجليزية كبيرة وأرقام وشرطات سفلية'),
  description: z.string().trim().max(DESC_MAX).optional(),
  minOrderAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأدنى للطلب يجب أن يكون رقماً صحيحاً (بالقروش)')
    .default('0'),
  maxDiscountAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'الحد الأقصى للخصم يجب أن يكون رقماً صحيحاً (بالقروش)')
    .optional(),
  applicableCategories: z.array(z.string().uuid())
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس التصنيف')
    .default([]),
  applicableProducts: z.array(z.string().uuid())
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس المنتج')
    .default([]),
  maxUses: z.number().int().positive().optional(),
  maxUsesPerCustomer: z.number().int().positive().default(1),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
};

// --- حقول للتحديث (جميعها اختيارية) ---
const updateFields = {
  code: z.string().trim().min(CODE_MIN).max(CODE_MAX)
    .regex(/^[A-Z0-9_]+$/, 'الكود يجب أن يكون أحرفاً إنجليزية كبيرة وأرقام وشرطات سفلية')
    .optional(),
  description: z.string().trim().max(DESC_MAX).nullable().optional(), // null = مسح
  minOrderAmount: z.string().trim().regex(/^\d+$/).optional(),
  maxDiscountAmount: z.string().trim().regex(/^\d+$/).nullable().optional(),
  applicableCategories: z.array(z.string().uuid())
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس التصنيف')
    .optional(),
  applicableProducts: z.array(z.string().uuid())
    .refine((arr) => new Set(arr).size === arr.length, 'لا يمكن تكرار نفس المنتج')
    .optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
};

// ============================================================
// 🆕 CREATE COUPON – إنشاء كوبون جديد
// ============================================================
export const createCouponSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('percentage'),
    value: z
      .string()
      .trim()
      .regex(/^\d+$/, 'النسبة يجب أن تكون رقماً صحيحاً')
      .refine((v) => {
        const n = BigInt(v);
        return n >= BigInt(1) && n <= BigInt(100);
      }, 'النسبة المئوية يجب أن تكون بين 1 و 100'),
    ...baseFields,
  }).strict(),
  z.object({
    type: z.literal('fixed'),
    value: z
      .string()
      .trim()
      .regex(/^\d+$/, 'القيمة يجب أن تكون رقماً صحيحاً (بالقروش)')
      .refine((v) => BigInt(v) > BigInt(0), 'القيمة يجب أن تكون أكبر من صفر'),
    ...baseFields,
  }).strict(),
]).refine(
  (d) => {
    // 🛡️ الكوبون الثابت لا يتجاوز الحد الأدنى للطلب (فقط إذا كان الحد الأدنى أعلى من الصفر)
    if (d.type === 'fixed' && d.minOrderAmount !== '0') {
      if (BigInt(d.value) > BigInt(d.minOrderAmount)) return false;
    }
    // 🛡️ الحد الأقصى للخصم (إن وُجد) لا يقل عن 1 للكوبونات النسبية
    if (d.type === 'percentage' && d.maxDiscountAmount) {
      if (BigInt(d.maxDiscountAmount) < BigInt(1)) return false;
    }
    return true;
  },
  { message: 'قيمة الكوبون الثابت لا يمكن أن تتجاوز الحد الأدنى للطلب', path: ['value'] }
).refine(
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
export const updateCouponSchema = z.union([
  // 🎯 تحديث النوع + القيمة (معًا)
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('percentage'),
      value: z
        .string()
        .trim()
        .regex(/^\d+$/, 'النسبة يجب أن تكون رقماً صحيحاً')
        .refine((v) => {
          const n = BigInt(v);
          return n >= BigInt(1) && n <= BigInt(100);
        }, 'النسبة المئوية يجب أن تكون بين 1 و 100'),
      ...updateFields,
    }).strict(),
    z.object({
      type: z.literal('fixed'),
      value: z
        .string()
        .trim()
        .regex(/^\d+$/, 'القيمة يجب أن تكون رقماً صحيحاً (بالقروش)')
        .refine((v) => BigInt(v) > BigInt(0), 'القيمة يجب أن تكون أكبر من صفر'),
      ...updateFields,
    }).strict(),
  ]),
  // 🎯 تحديث أي حقل آخر بدون تغيير النوع
  z.object({
    type: z.undefined().optional(),
    value: z.undefined().optional(),
    ...updateFields,
  }).strict(),
]).refine(
  (d) => {
    // 🛡️ الكوبون الثابت لا يتجاوز الحد الأدنى للطلب (إذا أُرسل النوع والقيمة والحد الأدنى)
    if (d.type === 'fixed' && d.value && d.minOrderAmount && d.minOrderAmount !== '0') {
      if (BigInt(d.value) > BigInt(d.minOrderAmount)) return false;
    }
    // 🛡️ الحد الأقصى للخصم لا يقل عن 1 للكوبونات النسبية (إن وُجد)
    if (d.type === 'percentage' && d.maxDiscountAmount) {
      if (BigInt(d.maxDiscountAmount) < BigInt(1)) return false;
    }
    return true;
  },
  { message: 'قيمة الكوبون الثابت لا يمكن أن تتجاوز الحد الأدنى للطلب', path: ['value'] }
).refine(
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
export const validateCouponSchema = z.object({
  code: z.string().trim().min(1, 'كود الكوبون مطلوب'),
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  orderAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'قيمة الطلب يجب أن تكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > BigInt(0), 'قيمة الطلب يجب أن تكون أكبر من صفر'),
  productIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  customerId: z.string().uuid('معرف العميل غير صالح').optional(),
}).strict();

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;