import { z } from 'zod';

// ============================================================
// 🛡️ المساعدات العامة
// ============================================================
const nonEmptyTrimmedString = (schema: z.ZodString) =>
  schema.trim().min(1, 'لا يمكن أن يكون فارغاً');

// ============================================================
// 🏷️ Slug (صيغة URL آمنة)
// ============================================================
const slugSchema = nonEmptyTrimmedString(
  z.string().max(255)
).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'الصيغة يجب أن تكون حروفاً صغيرة وأرقام وشرطات');

// ============================================================
// 💰 السعر (بالقروش) – تحقق من النطاق الآمن لـ JavaScript
// ============================================================
const priceSchema = z
  .number()
  .int('السعر يجب أن يكون عدداً صحيحاً (بالقروش)')
  .nonnegative('السعر لا يمكن أن يكون سالباً')
  .max(2_147_483_647, 'السعر يتجاوز الحد المسموح به (JavaScript safe integer)');

// ============================================================
// 📸 الصور (مصفوفة محدودة)
// ============================================================
const imageSchema = z.object({
  url: z.string().url('رابط الصورة غير صالح'),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
});

// 📌 الخدمة تتحقق من أن isPrimary: true لصورة واحدة فقط
const imagesSchema = z
  .array(imageSchema)
  .max(50, 'الحد الأقصى للصور هو 50')
  .optional()
  .default([]);

// ============================================================
// 🎨 المتغيرات (Variants)
// ============================================================
const variantSchema = z.object({
  name: nonEmptyTrimmedString(z.string().max(100)),
  options: z.array(nonEmptyTrimmedString(z.string().max(100))).min(1, 'يجب وجود خيار واحد على الأقل'),
});

const variantsSchema = z
  .array(variantSchema)
  .max(100, 'الحد الأقصى للمتغيرات هو 100')
  .optional()
  .default([]);

// 📌 مفاتيح الأسعار يجب أن تكون مرتبطة بـ variants (التحقق في الخدمة)
const variantPricesSchema = z
  .record(
    z.string().regex(/^[a-z0-9_-]+$/, 'صيغة مفتاح سعر المتغير غير صالحة'),
    priceSchema
  )
  .optional()
  .default({});

// ============================================================
// 📝 الوصف
// ============================================================
const descriptionSchema = z.string().max(5000, 'الوصف يجب ألا يتجاوز 5000 حرف').trim().optional().default('');
const shortDescriptionSchema = z.string().max(500, 'الوصف المختصر يجب ألا يتجاوز 500 حرف').trim().optional().default('');

// ============================================================
// 📊 SEO
// ============================================================
const metaTitleSchema = z.string().max(255).trim().optional();
const metaDescriptionSchema = z.string().max(500).trim().optional();

// ============================================================
// 🤖 Metadata أكثر أماناً – يدعم المصفوفات المتداخلة أيضاً
// ============================================================
const safeMetadataValue: z.ZodTypeAny = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const safeMetadataSchema = z
  .record(
    z.string().max(50), // مفاتيح بطول معقول
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
  )
  .optional()
  .default({});

// ============================================================
// 🆕 CREATE PRODUCT – إضافة منتج جديد
// ============================================================
export const createProductSchema = z.object({
  name: nonEmptyTrimmedString(z.string().min(3).max(255)),
  slug: slugSchema,
  description: descriptionSchema,
  shortDescription: shortDescriptionSchema,
  price: priceSchema,
  compareAtPrice: priceSchema.optional(),
  cost: priceSchema.optional(),
  categoryId: z.string().uuid().optional(),
  stock: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(5),
  sku: z.string().max(100).trim().optional(),
  barcode: z.string().max(100).trim().optional(),
  weight: z.number().int().positive().optional(),
  length: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  images: imagesSchema,
  videoUrl: z.string().url().optional(),
  variants: variantsSchema,
  variantPrices: variantPricesSchema,
  haggleEnabled: z.boolean().default(false),
  minPrice: priceSchema.optional(),
  metaTitle: metaTitleSchema,
  metaDescription: metaDescriptionSchema,
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  metadata: safeMetadataSchema,
}).strict().refine(
  (data) => {
    // 1. منع "الخصم العكسي"
    if (data.compareAtPrice && data.compareAtPrice < data.price) {
      return false;
    }
    // 2. منع الحد الأدنى للفصال من تجاوز السعر
    if (data.minPrice && data.minPrice > data.price) {
      return false;
    }
    // 3. منع نشر منتج بدون سعر أو مخزون (إذا اختار نشره)
    if (data.isPublished && (!data.price || data.stock === 0)) {
      return false;
    }
    // 4. منع compareAtPrice = 0 (إذا كان موجوداً، يجب أن يكون له قيمة موجبة)
    if (data.compareAtPrice !== undefined && data.compareAtPrice <= 0) {
      return false;
    }
    return true;
  },
  {
    message: 'بيانات المنتج غير متسقة: تأكد من السعر، الخصم، الحد الأدنى للفصال، والمخزون عند النشر',
  }
);

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ============================================================
// ✏️ UPDATE PRODUCT – تحديث منتج
// ============================================================
export const updateProductSchema = z.object({
  name: nonEmptyTrimmedString(z.string().min(3).max(255)).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(5000).trim().optional(),
  shortDescription: z.string().max(500).trim().optional(),
  price: priceSchema.optional(),
  compareAtPrice: priceSchema.optional().nullable(),
  cost: priceSchema.optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  stock: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  sku: z.string().max(100).trim().optional().nullable(),
  barcode: z.string().max(100).trim().optional().nullable(),
  weight: z.number().int().positive().optional().nullable(),
  length: z.number().int().positive().optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  images: imagesSchema,
  videoUrl: z.string().url().optional().nullable(),
  variants: variantsSchema,
  variantPrices: variantPricesSchema,
  haggleEnabled: z.boolean().optional(),
  minPrice: priceSchema.optional().nullable(),
  metaTitle: metaTitleSchema.optional().nullable(),
  metaDescription: metaDescriptionSchema.optional().nullable(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  metadata: safeMetadataSchema,
}).strict().refine(
  (data) => {
    // 1. منع "الخصم العكسي" إذا تم تحديث price أو compareAtPrice
    if (data.price && data.compareAtPrice && data.compareAtPrice < data.price) {
      return false;
    }
    // 2. منع الحد الأدنى للفصال من تجاوز السعر
    if (data.minPrice && data.price && data.minPrice > data.price) {
      return false;
    }
    // 3. منع نشر منتج بدون مخزون (إذا تم تحديث الحالة)
    if (data.isPublished && data.stock !== undefined && data.stock === 0) {
      return false;
    }
    // 4. منع compareAtPrice = 0 (إذا تم تحديثه)
    if (data.compareAtPrice !== undefined && data.compareAtPrice !== null && data.compareAtPrice <= 0) {
      return false;
    }
    return true;
  },
  {
    message: 'بيانات المنتج غير متسقة: تأكد من السعر، الخصم، الحد الأدنى للفصال، والمخزون عند النشر',
  }
);

export type UpdateProductInput = z.infer<typeof updateProductSchema>;