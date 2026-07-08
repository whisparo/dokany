// src/lib/validations/cart.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛒 CART – نظام التحقق من السلة                            ║
// ║  📌 جميع المخططات تتحقق من "الشكل" فقط.                    ║
// ║     التحقق من الملكية (IDOR) وعزل البيانات يتم في الخدمة.   ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت (ستُنقل إلى limits.ts لاحقاً)
const MAX_CART_QUANTITY = 999;
const VARIANT_SKU_MAX = 255;

// ============================================================
// 🆕 ADD TO CART – إضافة منتج إلى السلة
// ============================================================
export const addToCartSchema = z.object({
  productId: z.string().uuid('معرف المنتج غير صالح'),
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_CART_QUANTITY, `الكمية القصوى هي ${MAX_CART_QUANTITY}`),
  // 📌 undefined = حقل غير مُرسل (تجاهله). null = منتج أساسي بدون متغير.
  //     أرسل string (SKU) لتحديد المتغير المطلوب.
  //     الخدمة تتحقق من صحة SKU وربطه بالمنتج.
  variantSku: z
    .string()
    .trim()
    .min(1, 'معرف المتغير (SKU) لا يمكن أن يكون نصاً فارغاً')
    .max(VARIANT_SKU_MAX)
    .nullable()
    .optional(),
  // customerId و sessionId يُستخرجان من السياق في الخدمة، لا من جسم الطلب
}).strict();

export type AddToCartInput = z.infer<typeof addToCartSchema>;

// ============================================================
// ✏️ UPDATE CART QUANTITY – تحديث كمية عنصر في السلة
// ============================================================
export const updateCartQuantitySchema = z.object({
  cartItemId: z.string().uuid('معرف عنصر السلة غير صالح'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_CART_QUANTITY, `الكمية القصوى هي ${MAX_CART_QUANTITY}`),
  // 📌 لتقليل الكمية إلى 0 (= حذف العنصر)، استخدم removeFromCart.
  //     هذا يفصل المسؤوليات بوضوح ويبسط منطق الخدمة.
}).strict();

export type UpdateCartQuantityInput = z.infer<typeof updateCartQuantitySchema>;

// ============================================================
// 🗑️ REMOVE FROM CART – حذف عنصر من السلة
// ============================================================
export const removeFromCartSchema = z.object({
  cartItemId: z.string().uuid('معرف عنصر السلة غير صالح'),
}).strict();

export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;

// ============================================================
// 📋 GET CART – جلب السلة
// ============================================================
// لا يحتاج تحققاً من Body. المالك (customerId أو sessionId) من الجلسة.

// ============================================================
// 🗑️ CLEAR CART – تفريغ السلة بالكامل
// ============================================================
export const clearCartSchema = z.object({
  // 📌 إذا تُرك فارغاً (undefined): تُفرَغ سلة المستخدم للمتجر "النشط" فقط.
  //     إذا أُرسل storeId محدد: تُفرَغ سلة ذلك المتجر فقط.
  //     السلوك الدقيق يُنفَّذ في طبقة الخدمة.
  storeId: z.string().uuid('معرف المتجر غير صالح').optional(),
}).strict();

export type ClearCartInput = z.infer<typeof clearCartSchema>;