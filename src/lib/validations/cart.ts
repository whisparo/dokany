import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛒 CART – نظام التحقق من السلة                            ║
// ║  📌 جميع المخططات تتحقق من "الشكل" فقط.                    ║
// ║     التحقق من الملكية (IDOR) وعزل البيانات يتم في الخدمة.   ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const MAX_CART_QUANTITY = 999;
const VARIANT_SKU_MAX = 255;

// Helper لإعادة استخدام رسائل الـ UUID بشكل أنيق
const uuidSchema = (message: string) => z.uuid({ message });

// ============================================================
// 🆕 ADD TO CART – إضافة منتج إلى السلة
// ============================================================
export const addToCartSchema = z.object({
  productId: uuidSchema('معرف المنتج غير صالح'),
  storeId: uuidSchema('معرف المتجر غير صالح'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_CART_QUANTITY, `الكمية القصوى هي ${MAX_CART_QUANTITY}`),
  variantSku: z
    .string()
    .trim()
    .min(1, 'معرف المتغير (SKU) لا يمكن أن يكون نصاً فارغاً')
    .max(VARIANT_SKU_MAX)
    .nullable()
    .optional(),
}).strict();

export type AddToCartInput = z.infer<typeof addToCartSchema>;

// ============================================================
// ✏️ UPDATE CART QUANTITY – تحديث كمية عنصر في السلة
// ============================================================
export const updateCartQuantitySchema = z.object({
  cartItemId: uuidSchema('معرف عنصر السلة غير صالح'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_CART_QUANTITY, `الكمية القصوى هي ${MAX_CART_QUANTITY}`),
}).strict();

export type UpdateCartQuantityInput = z.infer<typeof updateCartQuantitySchema>;

// ============================================================
// 🗑️ REMOVE FROM CART – حذف عنصر من السلة
// ============================================================
export const removeFromCartSchema = z.object({
  cartItemId: uuidSchema('معرف عنصر السلة غير صالح'),
}).strict();

export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;

// ============================================================
// 🗑️ CLEAR CART – تفريغ السلة بالكامل
// ============================================================
export const clearCartSchema = z.object({
  storeId: uuidSchema('معرف المتجر غير صالح').optional(),
}).strict();

export type ClearCartInput = z.infer<typeof clearCartSchema>;