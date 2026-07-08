// src/lib/validations/group-buy.ts

import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  👥 GROUP BUY – نظام التحقق من الشراء الجماعي              ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.              ║
// ║     إدارة الحالة والانتقالات في الخدمة.                     ║
// ║  📌 القيم مُعرّفة هنا لتطابق الـ Schema مباشرةً.           ║
// ╚════════════════════════════════════════════════════════════╝

// ============================================================
// 📦 الثوابت المطابقة لـ schema/group-buys.ts
// ============================================================

export const GROUP_BUY_STATUSES = [
  'active',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;

// الحالات النهائية (لا يمكن تعديلها بعد ذلك)
const TERMINAL_STATUSES: readonly string[] = ['completed', 'failed', 'cancelled', 'expired'];

// 📌 الثوابت
const MAX_PARTICIPANTS_HARD_LIMIT = 10_000;
const EXPIRY_TOLERANCE_MS = 5000;
const DISCOUNT_TOLERANCE_PERCENT = 1; // تسامح ±1% في معادلة الخصم

// ✅ تحويل Tuple آمن
const STATUS_TUPLE = GROUP_BUY_STATUSES as unknown as readonly [string, ...string[]];

// ============================================================
// 🆕 CREATE GROUP BUY – بدء مجموعة شراء جماعي جديدة
// ============================================================
export const createGroupBuySchema = z.object({
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  productId: z.string().uuid('معرف المنتج غير صالح'),
  originalPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'السعر الأصلي يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > BigInt(0), 'السعر الأصلي يجب أن يكون أكبر من صفر'),
  groupPrice: z
    .string()
    .trim()
    .regex(/^\d+$/, 'سعر المجموعة يجب أن يكون رقماً صحيحاً (بالقروش)')
    .refine((v) => BigInt(v) > BigInt(0), 'سعر المجموعة يجب أن يكون أكبر من صفر'),
  discountPercentage: z
    .number()
    .int('نسبة الخصم يجب أن تكون عدداً صحيحاً')
    .min(1, 'نسبة الخصم يجب أن تكون 1 على الأقل')
    .max(100, 'نسبة الخصم يجب ألا تتجاوز 100'),
  requiredParticipants: z
    .number()
    .int()
    .min(2, 'الحد الأدنى للمشاركين هو 2')
    .max(MAX_PARTICIPANTS_HARD_LIMIT),
  maxParticipants: z
    .number()
    .int()
    .min(2)
    .max(MAX_PARTICIPANTS_HARD_LIMIT)
    .optional(),
  expiresAt: z.coerce.date(),
}).strict()
  .refine(
    (d) => BigInt(d.groupPrice) < BigInt(d.originalPrice),
    { message: 'سعر المجموعة يجب أن يكون أقل من السعر الأصلي', path: ['groupPrice'] }
  )
  .refine(
    (d) => !d.maxParticipants || d.maxParticipants >= d.requiredParticipants,
    { message: 'الحد الأقصى للمشاركين لا يمكن أن يقل عن المطلوب', path: ['maxParticipants'] }
  )
  .refine(
    (d) => {
      // 🛡️ معادلة الخصم: discountPercentage يجب أن يطابق الفرق الفعلي بين السعرين (بتسامح ±1%)
      const original = BigInt(d.originalPrice);
      const group = BigInt(d.groupPrice);
      const diff = original - group;
      const ratio = Number(diff * BigInt(10000)) / Number(original);
      const expected = Math.round(ratio / 100);
      return Math.abs(expected - d.discountPercentage) <= DISCOUNT_TOLERANCE_PERCENT;
    },
    { message: 'نسبة الخصم لا تطابق الفرق بين السعر الأصلي وسعر المجموعة', path: ['discountPercentage'] }
  )
  .refine(
    (d) => d.expiresAt.getTime() > Date.now() - EXPIRY_TOLERANCE_MS,
    { message: 'تاريخ الانتهاء يجب أن يكون في المستقبل', path: ['expiresAt'] }
  );

export type CreateGroupBuyInput = z.infer<typeof createGroupBuySchema>;

// ============================================================
// ✏️ UPDATE GROUP BUY – تحديث حالة ومعلومات المجموعة
// ============================================================
export const updateGroupBuySchema = z.object({
  status: z.enum(STATUS_TUPLE).optional(),
  currentParticipants: z
    .number()
    .int()
    .min(0)
    .max(MAX_PARTICIPANTS_HARD_LIMIT)
    .optional(),
  expiresAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
}).strict()
  // 🛡️ منع تعديل currentParticipants/expiresAt لحالة نهائية (فقط إذا أُرسلت status في هذا الطلب)
  .refine(
    (d) => {
      if (d.status && TERMINAL_STATUSES.includes(d.status)) {
        if (d.currentParticipants !== undefined || d.expiresAt !== undefined) return false;
      }
      return true;
    },
    { message: 'لا يمكن تعديل عدد المشاركين أو تاريخ الانتهاء لحالة نهائية', path: ['status'] }
  )
  // 🛡️ completedAt مطلوب عند status='completed'
  .refine(
    (d) => {
      if (d.status === 'completed' && !d.completedAt) return false;
      return true;
    },
    { message: 'يجب إرسال تاريخ الإكمال عند تحديث الحالة إلى مكتمل', path: ['completedAt'] }
  );

export type UpdateGroupBuyInput = z.infer<typeof updateGroupBuySchema>;