import { z } from 'zod';
import { phoneSchema, emailSchema, slugSchema } from './common';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ المساعدات                                            ║
// ╚════════════════════════════════════════════════════════════╝
/**
 * يعالج النص: trim() أولاً، ثم يتحقق من الحد الأدنى والأقصى.
 * يضمن عدم قبول السلاسل الفارغة أو التي تحتوي مسافات فقط.
 */
const safeTrimmedString = (min: number, max: number, customMinMsg?: string) =>
  z
    .string()
    .trim()
    .min(min, customMinMsg || `يجب أن يتكون من ${min} أحرف على الأقل`)
    .max(max, `يجب ألا يتجاوز ${max} حرفاً`);

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
// ║  🎨 Store Theme & Settings Schemas                         ║
// ╚════════════════════════════════════════════════════════════╝
export const storeThemeSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'كود اللون غير صالح')
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'كود اللون غير صالح')
      .optional(),
    fontFamily: z.string().trim().max(100).optional(),
    bannerUrl: z.url({ message: 'رابط البانر غير صالح' }).optional().nullable(),
  })
  .catchall(z.unknown());

export const storeSettingsSchema = z
  .object({
    allowGuestCheckout: z.boolean().optional(),
    enableReviews: z.boolean().optional(),
    autoApproveOrders: z.boolean().optional(),
    inventoryThreshold: z.number().int().nonnegative().optional(),
    socialLinks: z
      .object({
        facebook: z.url({ message: 'رابط فيسبوك غير صالح' }).optional().or(z.literal('')),
        instagram: z.url({ message: 'رابط انستجرام غير صالح' }).optional().or(z.literal('')),
        twitter: z.url({ message: 'رابط تويتر غير صالح' }).optional().or(z.literal('')),
        tiktok: z.url({ message: 'رابط تيك توك غير صالح' }).optional().or(z.literal('')),
      })
      .optional(),
  })
  .catchall(z.unknown());

// ╔════════════════════════════════════════════════════════════╗
// ║  🏪 CREATE STORE – إنشاء متجر جديد                          ║
// ╚════════════════════════════════════════════════════════════╝
export const createStoreSchema = z
  .object({
    phone: phoneSchema,
    name: safeTrimmedString(
      STORE_NAME_MIN,
      STORE_NAME_MAX,
      'اسم المتجر يجب أن يكون 3 أحرف على الأقل'
    ),
    chat_id: chatIdSchema,
    telegram_username: telegramUsernameSchema,
  })
  .strict();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

// ╔════════════════════════════════════════════════════════════╗
// ║  ✏️ UPDATE STORE – تحديث جزئي لبيانات المتجر               ║
// ╚════════════════════════════════════════════════════════════╝
export const updateStoreSchema = z
  .object({
    name: safeTrimmedString(STORE_NAME_MIN, STORE_NAME_MAX).optional(),
    slug: slugSchema.optional(),
    shopName: safeTrimmedString(SHOP_NAME_MIN, SHOP_NAME_MAX).optional(),
    description: z.string().max(DESCRIPTION_MAX).trim().optional().nullable(),
    logo: z.url({ message: 'رابط اللوجو غير صالح' }).optional().nullable(),
    coverImage: z.url({ message: 'رابط الغلاف غير صالح' }).optional().nullable(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    country: countrySchema.optional(),
    city: z.string().max(100).trim().optional().nullable(),
    address: z.string().max(ADDRESS_MAX).trim().optional().nullable(),
    currency: currencySchema.optional(),
    paymentGateway: z.enum(['stripe', 'paypal', 'paymob', 'cash']).optional(),
    settings: storeSettingsSchema.optional(),
    theme: storeThemeSchema.optional(),
    isActive: z.boolean().optional(),
    isVerified: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict();

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;