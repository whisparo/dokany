// src/lib/validations/payment.ts
import { z } from 'zod';
import { PAYMENT_STATUSES, PAYMENT_METHODS, CURRENCIES } from '@/lib/db/schema/enums';

// ╔════════════════════════════════════════════════════════════╗
// ║  💳 PAYMENT – نظام التحقق من المدفوعات                     ║
// ║  📌 جميع القيم مُستوردة من enums.ts لضمان الاتساق التلقائي. ║
// ║     التحقق من الملكية (IDOR) وعزل البيانات يتم في الخدمة.   ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const PROVIDER_MAX = 50;
const TRANSACTION_ID_MAX = 255;

// ============================================================
// 🆕 CREATE PAYMENT – إنشاء دفعة جديدة
// ============================================================
export const createPaymentSchema = z.object({
  orderId: z.string().uuid('معرف الطلب غير صالح'),
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  amount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'المبلغ يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((val) => BigInt(val) > 0, 'المبلغ يجب أن يكون أكبر من صفر'),
  currency: z.enum(CURRENCIES).default('EGP'),
  method: z.enum(PAYMENT_METHODS),
  provider: z.string().trim().max(PROVIDER_MAX).optional(),
  providerTransactionId: z.string().trim().max(TRANSACTION_ID_MAX).optional(),
  // 📌 تطهير webhookPayload من البيانات الضخمة/الحساسة يتم في الخدمة قبل التخزين
  webhookPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// ============================================================
// ✏️ UPDATE PAYMENT – تحديث حالة الدفع
// ============================================================
export const updatePaymentSchema = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  providerTransactionId: z.string().trim().max(TRANSACTION_ID_MAX).optional(),
  // 📌 تاريخ الدفع يجب ألا يكون في المستقبل. يُتحقق منه فقط إذا تم إرساله.
  paidAt: z.coerce
    .date()
    .refine((date) => date <= new Date(), 'تاريخ الدفع لا يمكن أن يكون في المستقبل')
    .optional(),
  refundAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'مبلغ الاسترداد يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((val) => BigInt(val) > 0, 'مبلغ الاسترداد يجب أن يكون أكبر من صفر')
    .optional(),
  refundReason: z.string().trim().max(500).optional(),
  refundedAt: z.coerce
    .date()
    .refine((date) => date <= new Date(), 'تاريخ الاسترداد لا يمكن أن يكون في المستقبل')
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(
  (data) => {
    if (
      (data.status === 'refunded' || data.status === 'partially_refunded') &&
      (!data.refundAmount || !data.refundReason)
    ) {
      return false;
    }
    return true;
  },
  {
    message: 'يجب إرسال مبلغ وسبب الاسترداد عند تحديث الحالة إلى مسترد',
    path: ['refundReason'],
  }
);

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;