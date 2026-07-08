import { z } from 'zod';

// ============================================================
// 🛡️ المساعدات العامة
// ============================================================
const nonEmptyTrimmedString = (schema: z.ZodString) =>
  schema.trim().min(1, 'لا يمكن أن يكون فارغاً');

// ============================================================
// 📞 رقم الهاتف (مصري + دولي)
// ============================================================
const phoneSchema = z
  .string()
  .trim()
  .refine(
    (val) => /^(01[0125][0-9]{8})$|^\+?[1-9][0-9]{7,14}$/.test(val),
    'صيغة الهاتف غير صالحة (مثال: +201234567890 أو 01234567890)'
  );

// ============================================================
// 📧 البريد الإلكتروني – undefined = لم يُدخل، ولن يتم تحديثه
//    لا يقبل null لتجنب فقدان البريد الأصلي عن طريق الخطأ
// ============================================================
const emailSchema = z
  .string()
  .email('صيغة البريد الإلكتروني غير صالحة')
  .trim()
  .optional(); // ✅ لا .nullable() هنا

// ============================================================
// 👤 الاسم الشخصي (يدعم العربية)
// ============================================================
const nameSchema = nonEmptyTrimmedString(
  z.string().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل').max(40, 'الاسم يجب ألا يتجاوز 40 حرفاً')
).regex(
  /^[\p{L}\p{N}\s\p{P}]+$/u,
  'الاسم يحتوي على أحرف غير مسموح بها'
);

// ============================================================
// 🏪 اسم المتجر
// ============================================================
const storeNameSchema = nonEmptyTrimmedString(
  z.string().min(2, 'اسم المتجر يجب أن يكون حرفين على الأقل').max(50, 'اسم المتجر يجب ألا يتجاوز 50 حرفاً')
).regex(
  /^[\p{L}\p{N}\s\p{P}]+$/u,
  'اسم المتجر يحتوي على أحرف غير مسموح بها'
);

// ============================================================
// 💬 chat_id (رقمي صحيح لتيليجرام، ضمن نطاق int64)
// ============================================================
const chatIdSchema = z
  .string()
  .trim()
  .refine((val) => /^-?\d+$/.test(val), 'معرف المحادثة يجب أن يكون رقماً صحيحاً')
  .refine((val) => {
    try {
      const n = BigInt(val);
      return n >= BigInt('-9223372036854775808') && n <= BigInt('9223372036854775807') && n !== BigInt(0);
    } catch {
      return false;
    }
  }, 'معرف المحادثة خارج النطاق المسموح به (int64 غير صفري)');

// ============================================================
// 📝 REGISTRATION – تسجيل تاجر جديد
// ============================================================
export const registerMerchantSchema = z
  .object({
    phone: phoneSchema,
    name: storeNameSchema,
    chat_id: chatIdSchema,
    telegram_username: z.string().trim().optional(),
  })
  .strict();

export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;

// ============================================================
// 🔑 LOGIN – تسجيل الدخول (بالبحث عن التاجر)
// ============================================================
export const loginSchema = z
  .object({
    phone: phoneSchema,
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================
// ✏️ UPDATE PROFILE – تحديث الملف الشخصي
// ============================================================
export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema,
    phone: phoneSchema.optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ============================================================
// ✏️ UPDATE STORE – تحديث بيانات المتجر
// ============================================================
export const updateStoreSchema = z
  .object({
    shopName: storeNameSchema.optional(),
    description: z.string().max(1000, 'الوصف يجب ألا يتجاوز 1000 حرف').trim().optional(),
    country: z.string().length(2, 'كود الدولة يجب أن يكون حرفين').optional(),
    city: z.string().max(100).trim().optional(),
    address: z.string().max(500).trim().optional(),
    currency: z.string().length(3, 'كود العملة يجب أن يكون 3 أحرف').optional(),
  })
  .strict();

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;