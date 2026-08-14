// src/lib/validations/product.ts

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
  url: z.url('رابط الصورة غير صالح'),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
});

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
// 🤖 Metadata أكثر أماناً
// ============================================================
const safeMetadataSchema = z
  .record(
    z.string().max(50),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
  )
  .optional()
  .default({});

// ============================================================
// 🛠️ دوال مساعدة للتحقق من المنطق التجاري
// ============================================================

/** التحقق من عدم وجود "خصم عكسي" (compareAtPrice < price) وأن القيمة ليست صفراً */
function validateComparePrice(price: number, compareAtPrice?: number | null): boolean {
  if (compareAtPrice === undefined || compareAtPrice === null) return true;
  if (compareAtPrice <= 0) return false;
  return compareAtPrice >= price;
}

/** التحقق من أن الحد الأدنى للفصال لا يتجاوز السعر وأن القيمة ليست صفراً */
function validateMinPrice(price: number, minPrice?: number | null): boolean {
  if (minPrice === undefined || minPrice === null) return true;
  if (minPrice <= 0) return false;
  return minPrice <= price;
}

/** التحقق من أن السعر والمخزون صالحان للنشر */
function validatePublish(price: number, stock: number, isPublished?: boolean): boolean {
  if (isPublished !== true) return true;
  return price > 0 && stock > 0;
}

// ============================================================
// 🆕 CREATE PRODUCT – إضافة منتج جديد
// ============================================================
export const createProductSchema = z
  .object({
    name: nonEmptyTrimmedString(z.string().min(3).max(255)),
    slug: slugSchema,
    description: descriptionSchema,
    shortDescription: shortDescriptionSchema,
    price: priceSchema,
    compareAtPrice: priceSchema.optional(),
    cost: priceSchema.optional(),
    categoryId: z.uuid('معرف التصنيف غير صالح').optional(),
    stock: z.number().int().nonnegative().default(0),
    lowStockThreshold: z.number().int().nonnegative().default(5),
    sku: z.string().max(100).trim().optional(),
    barcode: z.string().max(100).trim().optional(),
    weight: z.number().int().positive().optional(),
    length: z.number().int().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    images: imagesSchema,
    videoUrl: z.url('رابط الفيديو غير صالح').optional(),
    variants: variantsSchema,
    variantPrices: variantPricesSchema,
    haggleEnabled: z.boolean().default(false),
    minPrice: priceSchema.optional(),
    metaTitle: metaTitleSchema,
    metaDescription: metaDescriptionSchema,
    isPublished: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    metadata: safeMetadataSchema,
  })
  .strict()
  .refine(
    (d) => validateComparePrice(d.price, d.compareAtPrice),
    { message: 'السعر المخفض (compareAtPrice) يجب أن يكون أكبر من أو يساوي السعر الأصلي ولا يساوي صفر', path: ['compareAtPrice'] }
  )
  .refine(
    (d) => validateMinPrice(d.price, d.minPrice),
    { message: 'الحد الأدنى للفصال لا يمكن أن يتجاوز السعر الأصلي ولا يساوي صفر', path: ['minPrice'] }
  )
  .refine(
    (d) => validatePublish(d.price, d.stock, d.isPublished),
    { message: 'لا يمكن نشر منتج بدون سعر أو مخزون', path: ['isPublished'] }
  );

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ============================================================
// ✏️ UPDATE PRODUCT – تحديث منتج
// ============================================================
export const updateProductSchema = z
  .object({
    name: nonEmptyTrimmedString(z.string().min(3).max(255)).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(5000).trim().optional(),
    shortDescription: z.string().max(500).trim().optional(),
    price: priceSchema.optional(),
    compareAtPrice: priceSchema.optional().nullable(),
    cost: priceSchema.optional().nullable(),
    categoryId: z.uuid('معرف التصنيف غير صالح').optional().nullable(),
    stock: z.number().int().nonnegative().optional(),
    lowStockThreshold: z.number().int().nonnegative().optional(),
    sku: z.string().max(100).trim().optional().nullable(),
    barcode: z.string().max(100).trim().optional().nullable(),
    weight: z.number().int().positive().optional().nullable(),
    length: z.number().int().positive().optional().nullable(),
    width: z.number().int().positive().optional().nullable(),
    height: z.number().int().positive().optional().nullable(),
    images: imagesSchema,
    videoUrl: z.url('رابط الفيديو غير صالح').optional().nullable(),
    variants: variantsSchema,
    variantPrices: variantPricesSchema,
    haggleEnabled: z.boolean().optional(),
    minPrice: priceSchema.optional().nullable(),
    metaTitle: metaTitleSchema.optional().nullable(),
    metaDescription: metaDescriptionSchema.optional().nullable(),
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    metadata: safeMetadataSchema,
  })
  .strict()
  .refine(
    (d) => {
      if (d.price !== undefined && d.compareAtPrice !== undefined && d.compareAtPrice !== null) {
        return validateComparePrice(d.price, d.compareAtPrice);
      }
      if (d.compareAtPrice !== undefined && d.compareAtPrice !== null) {
        return d.compareAtPrice > 0;
      }
      return true;
    },
    { message: 'السعر المخفض يجب أن يكون أكبر من أو يساوي السعر الأصلي ولا يساوي صفر', path: ['compareAtPrice'] }
  )
  .refine(
    (d) => {
      if (d.price !== undefined && d.minPrice !== undefined && d.minPrice !== null) {
        return validateMinPrice(d.price, d.minPrice);
      }
      if (d.minPrice !== undefined && d.minPrice !== null) {
        return d.minPrice > 0;
      }
      return true;
    },
    { message: 'الحد الأدنى للفصال لا يمكن أن يتجاوز السعر الأصلي ولا يساوي صفر', path: ['minPrice'] }
  )
  .refine(
    (d) => {
      if (d.isPublished === true) {
        const priceValid = d.price === undefined || d.price > 0;
        const stockValid = d.stock === undefined || d.stock > 0;
        return priceValid && stockValid;
      }
      return true;
    },
    { message: 'لا يمكن نشر منتج بدون سعر أو مخزون', path: ['isPublished'] }
  );

export type UpdateProductInput = z.infer<typeof updateProductSchema>;