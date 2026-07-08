// src/lib/validations/platform.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  ⚙️ PLATFORM – نظام التحقق من إعدادات المنصة               ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.              ║
// ║     صلاحية القيم حسب المفتاح في الخدمة (Zod Schema).        ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const KEY_MIN = 1;
const KEY_MAX = 100;
const CATEGORY_MAX = 50;
const DESC_MAX = 500;
const VALUE_MAX_BYTES = 10 * 1024; // 10KB

// 🛡️ التحقق من إمكانية تسلسل القيمة (يمنع المراجع الدائرية)
const isSerializable = (v: unknown): boolean => {
  try {
    JSON.stringify(v);
    return true;
  } catch {
    return false;
  }
};

// 🛡️ حساب الحجم الآمن
const getValueSize = (v: unknown): number => {
  return Buffer.byteLength(JSON.stringify(v), 'utf8');
};

// ============================================================
// 🔑 صيغة المفتاح (مع حد أقصى للعمق)
// ============================================================
const keyFormat = z
  .string()
  .trim()
  .min(KEY_MIN, 'المفتاح مطلوب')
  .max(KEY_MAX, `المفتاح لا يمكن أن يتجاوز ${KEY_MAX} حرفاً`)
  .regex(
    /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/,
    'صيغة المفتاح غير صالحة (مثال: billing.tax_rate)'
  )
  .refine(
    (val) => val.split('.').length <= 4,
    'لا يمكن أن يتجاوز عمق المفتاح 4 مستويات (مثال: a.b.c.d)'
  );

// ============================================================
// 🆕 CREATE PLATFORM SETTING – إنشاء إعداد جديد
// ============================================================
export const createPlatformSettingSchema = z.object({
  key: keyFormat,
  value: z
    .unknown()
    .refine((v) => v !== undefined && v !== null, 'قيمة الإعداد مطلوبة')
    .refine(isSerializable, 'البيانات غير قابلة للحفظ (قد تحتوي على مرجع دائري)')
    .refine(
      (v) => getValueSize(v) <= VALUE_MAX_BYTES,
      `قيمة الإعداد لا يمكن أن تتجاوز ${VALUE_MAX_BYTES / 1024}KB`
    ),
  description: z.string().trim().max(DESC_MAX).optional(),
  category: z
    .string()
    .trim()
    .max(CATEGORY_MAX)
    .regex(/^[a-z][a-z0-9_]*$/, 'صيغة التصنيف غير صالحة (أحرف صغيرة وأرقام وشرطات سفلية)')
    .optional(),
  isPublic: z.boolean().default(false),
}).strict();

export type CreatePlatformSettingInput = z.infer<typeof createPlatformSettingSchema>;

// ============================================================
// ✏️ UPDATE PLATFORM SETTING – تحديث إعداد (جزئي)
// ============================================================
export const updatePlatformSettingSchema = z.object({
  value: z
    .unknown()
    .optional() // ✅ أصبح التحديث الجزئي ممكنًا الآن
    .refine(
      (v) => v === undefined || (v !== undefined && v !== null),
      'قيمة الإعداد لا يمكن أن تكون null (أرسل undefined للتجاهل)'
    )
    .refine(
      (v) => v === undefined || isSerializable(v),
      'البيانات غير قابلة للحفظ (قد تحتوي على مرجع دائري)'
    )
    .refine(
      (v) => v === undefined || getValueSize(v) <= VALUE_MAX_BYTES,
      `قيمة الإعداد لا يمكن أن تتجاوز ${VALUE_MAX_BYTES / 1024}KB`
    ),
  description: z.string().trim().max(DESC_MAX).nullable().optional(),
  category: z
    .string()
    .trim()
    .max(CATEGORY_MAX)
    .regex(/^[a-z][a-z0-9_]*$/, 'صيغة التصنيف غير صالحة')
    .nullable().optional(),
  isPublic: z.boolean().optional(),
}).strict();

export type UpdatePlatformSettingInput = z.infer<typeof updatePlatformSettingSchema>;

// ============================================================
// 🔍 GET PLATFORM SETTING – استعلام عن إعداد
// ============================================================
export const getPlatformSettingSchema = z.object({
  key: keyFormat,
}).strict();

export type GetPlatformSettingInput = z.infer<typeof getPlatformSettingSchema>;

// ============================================================
// 📋 QUERY PLATFORM SETTINGS – بحث مفلتر عن إعدادات
// ============================================================
export const queryPlatformSettingsSchema = z.object({
  category: z
    .string()
    .trim()
    .max(CATEGORY_MAX)
    .regex(/^[a-z][a-z0-9_]*$/, 'صيغة التصنيف غير صالحة')
    .optional(),
  isPublic: z.boolean().optional(),
  sortBy: z.enum(['key', 'category', 'updated_at']).default('key'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

export type QueryPlatformSettingsInput = z.infer<typeof queryPlatformSettingsSchema>;