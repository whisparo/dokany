// src/lib/validations/store.ts
import { z } from 'zod';
import { phoneSchema, emailSchema, slugSchema } from './common';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ المساعدات                                            ║
// ╚════════════════════════════════════════════════════════════╝
/**
 * يعالج النص: trim() أولاً، ثم يتحقق من الطول.
 * يمنع السلاسل الفارغة أو المسافات فقط.
 */
const safeTrimmedString = (schema: z.ZodString) =>
  schema.trim().min(1, 'لا يمكن أن يكون فارغاً');

const STORE_NAME_MIN = 3;
const STORE_NAME_MAX = 255;
const SHOP_NAME_MIN = 2;
const SHOP_NAME_MAX = 255;
const DESCRIPTION_MAX = 5000;
const ADDRESS_MAX = 500;

// ╔════════════════════════════════════════════════════════════╗
// ║  📡 chat_id – رقمي صالح لتيليجرام (ضمن نطاق int64)        ║
// ╚════════════════════════════════════════════════════════════╝
const chatIdSchema = z
  .string()
  .trim()
  .refine((val) => /^-?\d+$/.test(val), 'معرف المحادثة يجب أن يكون رقماً صحيحاً')
  .refine((val) => BigInt(val) !== BigInt(0), 'معرف المحادثة لا يمكن أن يكون صفراً')
  .refine((val) => {
    // التحقق من النطاق الواقعي لـ int64 (دفاع في العمق)
    const n = BigInt(val);
    return n >= BigInt('-9223372036854775808') && n <= BigInt('9223372036854775807');
  }, 'معرف المحادثة خارج النطاق المسموح به (int64)');

// ╔════════════════════════════════════════════════════════════╗
// ║  👤 telegram_username – صيغة اسم مستخدم تيليجرام          ║
// ╚════════════════════════════════════════════════════════════╝
const telegramUsernameSchema = z
  .string()
  .trim()
  .regex(
    /^@?[a-zA-Z0-9_]{5,32}$/,
    'اسم مستخدم تيليجرام يجب أن يكون بين 5 و 32 حرفاً (أحرف إنجليزية، أرقام، شرطة سفلية، اختياري يبدأ بـ @)'
  )
  .optional();

// ╔════════════════════════════════════════════════════════════╗
// ║  🌍 country / 💱 currency – رموز موحّدة (uppercase)         ║
// ║  📌 التحقق من الصلاحية الكاملة (ISO 3166-1 / ISO 4217)     ║
// ║     يتم في طبقة الخدمة، وهنا نضمن فقط التنسيق الأساسي.     ║
// ╚════════════════════════════════════════════════════════════╝
const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, 'كود الدولة يجب أن يكون حرفين')
  .regex(/^[A-Z]{2}$/, 'كود الدولة يجب أن يكون أحرف إنجليزية كبيرة فقط');

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, 'كود العملة يجب أن يكون 3 أحرف')
  .regex(/^[A-Z]{3}$/, 'كود العملة يجب أن يكون أحرف إنجليزية كبيرة فقط');

// ╔════════════════════════════════════════════════════════════╗
// ║  🏪 CREATE STORE – إنشاء متجر جديد (للبوت)                ║
// ║  📌 country و currency لا يُطلبان هنا؛ الخدمة تستنبطهما     ║
// ║     تلقائياً من مفتاح الدولة في رقم الهاتف (مثلاً: 20 → EG).║
// ╚════════════════════════════════════════════════════════════╝
export const createStoreSchema = z.object({
  phone: phoneSchema,
  name: safeTrimmedString(
    z.string().min(STORE_NAME_MIN).max(STORE_NAME_MAX)
  ),
  chat_id: chatIdSchema,
  telegram_username: telegramUsernameSchema,
}).strict();

/** جميع الحقول مطلوبة باستثناء telegram_username. */
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

// ╔════════════════════════════════════════════════════════════╗
// ║  ✏️ UPDATE STORE – تحديث جزئي لبيانات المتجر               ║
// ║  📌 السياسة:                                              ║
// ║     - أرسل فقط الحقول التي تريد تغييرها.                   ║
// ║     - الحقول غير المُرسلة (undefined) لا تُحدَّث.           ║
// ║     - لإزالة حقل اختياري (مثل email, description, city)   ║
// ║       أرسل القيمة null صراحة.                             ║
// ╚════════════════════════════════════════════════════════════╝
export const updateStoreSchema = z.object({
  name: safeTrimmedString(
    z.string().min(STORE_NAME_MIN).max(STORE_NAME_MAX)
  ).optional(),
  slug: slugSchema.optional(),
  shopName: safeTrimmedString(
    z.string().min(SHOP_NAME_MIN).max(SHOP_NAME_MAX)
  ).optional(),
  description: z.string().max(DESCRIPTION_MAX).trim().optional().nullable(),
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  country: countrySchema.optional(),
  city: z.string().max(100).trim().optional().nullable(),
  address: z.string().max(ADDRESS_MAX).trim().optional().nullable(),
  currency: currencySchema.optional(),
}).strict();

/** جميع الحقول اختيارية. لإزالة قيمة حقل، أرسل null. */
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;