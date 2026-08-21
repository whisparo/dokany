import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  📦 ORDER – نظام التحقق من الطلبات (Edge-Native v3.6)       ║
// ║  📌 متوافق مع Drizzle Schema + Double-Cache Isolation Engine ║
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
// 🏠 عنوان الشحن (ShippingAddress Schema)
// ============================================================
export const shippingAddressSchema = z.object({
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
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// ============================================================
// 🛒 عنصر الطلب (OrderItem Schema)
// ============================================================
export const orderItemSchema = z.object({
  productId: z.string().uuid({ message: 'معرف المنتج غير صالح (UUID)' }),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون عدداً صحيحاً')
    .min(1, 'الكمية يجب أن تكون 1 على الأقل')
    .max(MAX_QUANTITY, `الكمية القصوى هي ${MAX_QUANTITY}`),
  priceInt: z
    .number()
    .int('السعر يجب أن يكون عدداً صحيحاً بالقرش/السنت')
    .nonnegative('السعر لا يمكن أن يكون سالباً'),
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
// 🆕 CREATE ORDER – إنشاء طلب جديد (Edge Double-Cache Protocol)
// ============================================================
export const createOrderSchema = z.object({
  idempotencyKey: z.string().uuid({ message: 'مفتاح عدم التكرار (Idempotency Key) غير صالح' }),
  storeId: z.string().uuid({ message: 'معرف المتجر غير صالح' }),
  items: z
    .array(orderItemSchema)
    .min(1, 'يجب أن يحتوي الطلب على عنصر واحد على الأقل')
    .max(MAX_ITEMS, `الحد الأقصى للعناصر هو ${MAX_ITEMS}`),
  totalAmountInt: z
    .number()
    .int('المبلغ الإجمالي يجب أن يكون بالقرش/السنت (Integer)')
    .nonnegative(),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).default('cod'),
  couponCode: z.string().trim().max(50).optional(),
  customerNotes: z.string().trim().max(1000).optional(),
}).strict()
.refine((data) => {
  // 1. منع تكرار نفس المنتج جوة نفس السلة
  const productIds = data.items.map((item) => item.productId);
  return new Set(productIds).size === productIds.length;
}, {
  message: 'غير مسموح بتكرار نفس المنتج في السلة، قم بزيادة الكمية بدلاً من ذلك',
  path: ['items'],
})
.refine((data) => {
  // 2. Math Integrity Check: مطابقة المجموع المالي على الـ Edge
  const calculatedTotal = data.items.reduce(
    (sum, item) => sum + item.priceInt * item.quantity,
    0
  );
  return calculatedTotal === data.totalAmountInt;
}, {
  message: 'المبلغ الإجمالي غير مطابق لمجموع أسعار المنتجات (تنبيه تلاعب مالي)',
  path: ['totalAmountInt'],
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ============================================================
// ✏️ UPDATE ORDER – تحديث حالة الطلب
// ============================================================
export const updateOrderSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    adminNotes: z.string().trim().max(1000).nullable().optional(),
    cancelReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
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

// ============================================================
// 🔒 SECURITY UTILS – حماية الاستخراج ومنع الـ IDOR
// ============================================================
/**
  استخراج الـ storeId أوتوماتيكياً من اسم الدومين (Hostname)
  لمنع التلاعب واستبدال الـ storeId من العميل.
 */
export function extractStoreIdFromHost(request: Request): string | null {
  const host = request.headers.get('host') || '';
  const subdomain = host.split('.')[0];
  return subdomain && subdomain !== 'www' && subdomain !== 'localhost' ? subdomain : null;
}