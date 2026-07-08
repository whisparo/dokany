// src/lib/validations/order.ts

import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  📦 ORDER – نظام التحقق من الطلبات                         ║
// ║  📌 القيم مُعرّفة هنا لتطابق الـ Schema مباشرةً.           ║
// ║     التحقق من الملكية (IDOR) وعزل البيانات يتم في الخدمة.   ║
// ╚════════════════════════════════════════════════════════════╝

// ============================================================
// 📦 الثوابت المطابقة لـ schema/orders.ts
// ============================================================

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'under_review',
] as const;

export const PAYMENT_METHODS = [
  'cod',
  'credit_card',
  'wallet',
  'bank_transfer',
  'installments',
] as const;

// 📌 الثوابت
const MAX_ITEMS = 100;
const MAX_QUANTITY = 999;

// ============================================================
// 🏠 عنوان الشحن (متطابق مع ShippingAddress من الـ Schema)
// ============================================================
const shippingAddressSchema = z.object({
  recipientName: z.string().trim().min(1, 'اسم المستلم مطلوب').max(255),
  recipientPhone: z
    .string()
    .trim()
    .min(1, 'هاتف المستلم مطلوب')
    .max(30)
    .regex(/^[+0-9][0-9\s\-()]{6,29}$/, 'صيغة هاتف غير صالحة'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'كود الدولة يجب أن يكون حرفين')
    .regex(/^[A-Z]{2}$/, 'كود الدولة يجب أن يكون أحرف إنجليزية كبيرة فقط'),
  city: z.string().trim().min(1, 'المدينة مطلوبة').max(100),
  area: z.string().trim().max(255).optional(),
  street: z.string().trim().min(1, 'الشارع مطلوب').max(500),
  building: z.string().trim().max(100).optional(),
  floor: z.string().trim().max(50).optional(),
  apartment: z.string().trim().max(50).optional(),
  postalCode: z.string().trim().max(20).optional(),
  landmark: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  // ✅ إضافة دعم للـ Latitude/Longitude (موجود في الـ Schema)
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// ============================================================
// 🛒 عنصر الطلب (يجب أن يتطابق مع schema/order-items.ts)
// ============================================================
const orderItemSchema = z.object({
  productId: z.string().uuid('معرف المنتج غير صالح'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_QUANTITY, `الكمية القصوى هي ${MAX_QUANTITY}`),
  variantSku: z
    .string()
    .trim()
    .min(1, 'معرف المتغير (SKU) لا يمكن أن يكون نصاً فارغاً')
    .max(255)
    .nullable()
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

// ============================================================
// 🆕 CREATE ORDER – إنشاء طلب جديد
// ============================================================
export const createOrderSchema = z.object({
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  items: z
    .array(orderItemSchema)
    .min(1, 'يجب أن يحتوي الطلب على عنصر واحد على الأقل')
    .max(MAX_ITEMS, `الحد الأقصى للعناصر هو ${MAX_ITEMS}`),
  shippingAddress: shippingAddressSchema,
  // ✅ جعل paymentMethod اختيارياً لأن الطلب قد يكون pending بدون طريقة دفع
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  couponCode: z.string().trim().max(50).optional(),
  customerNotes: z.string().trim().max(1000).optional(),
}).strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ============================================================
// ✏️ UPDATE ORDER – تحديث حالة الطلب
// ============================================================
export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  adminNotes: z.string().trim().max(1000).nullable().optional(),
  cancelReason: z.string().trim().max(500).optional(),
}).strict().refine(
  (data) => {
    if (data.status === 'cancelled' && !data.cancelReason) {
      return false;
    }
    return true;
  },
  {
    message: 'يجب إرسال سبب الإلغاء عند إلغاء الطلب',
    path: ['cancelReason'],
  }
);

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;