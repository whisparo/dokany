// src/lib/validations/category.ts
import { z } from 'zod';
import { slugSchema, uuidSchema } from './common';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ المساعدات                                              ║
// ╚════════════════════════════════════════════════════════════╝
const nonEmptyTrimmedString = (schema: z.ZodString) =>
  schema.trim().min(1, 'لا يمكن أن يكون فارغاً');

const CATEGORY_NAME_MIN = 2;
const CATEGORY_NAME_MAX = 100;
const CATEGORY_DESC_MAX = 5000;
const CATEGORY_ORDER_MAX = 9999;

// ╔════════════════════════════════════════════════════════════╗
// ║  📝 اسم التصنيف (يدعم العربية والإنجليزية والأرقام)        ║
// ╚════════════════════════════════════════════════════════════╝
const categoryNameSchema = nonEmptyTrimmedString(
  z.string()
    .min(CATEGORY_NAME_MIN, `الاسم يجب أن يكون ${CATEGORY_NAME_MIN} أحرف على الأقل`)
    .max(CATEGORY_NAME_MAX, `الاسم يجب ألا يتجاوز ${CATEGORY_NAME_MAX} حرفاً`)
).regex(
  /^[\p{L}\p{N}\s\-',،؛]+$/u,
  'الاسم يحتوي على أحرف غير مسموح بها'
);

// ╔════════════════════════════════════════════════════════════╗
// ║  🆕 CREATE CATEGORY – إنشاء تصنيف جديد                    ║
// ╚════════════════════════════════════════════════════════════╝
// ✅ تم إزالة storeId من المدخلات لعدم إمكانية التلاعب به أمنياً
// ✅ تم إزالة الـ refine الخاطئ للتحقق من parentId جوه السيرفر
export const createCategorySchema = z.object({
  name: categoryNameSchema,
  slug: slugSchema,
  description: z
    .string()
    .max(CATEGORY_DESC_MAX, `الوصف يجب ألا يتجاوز ${CATEGORY_DESC_MAX} حرفاً`)
    .trim()
    .optional()
    .or(z.literal('')),
  parentId: uuidSchema.optional().nullable(),
  order: z.number().int('الترتيب يجب أن يكون رقماً صحيحاً').min(0).max(CATEGORY_ORDER_MAX).default(0),
  isActive: z.boolean().default(true),
}).strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ╔════════════════════════════════════════════════════════════╗
// ║  ✏️ UPDATE CATEGORY – تحديث تصنيف                           ║
// ╚════════════════════════════════════════════════════════════╝
export const updateCategorySchema = z.object({
  name: categoryNameSchema.optional(),
  slug: slugSchema.optional(),
  description: z
    .string()
    .max(CATEGORY_DESC_MAX, `الوصف يجب ألا يتجاوز ${CATEGORY_DESC_MAX} حرفاً`)
    .trim()
    .nullable()
    .optional(),
  parentId: uuidSchema.nullable().optional(),
  order: z.number().int('الترتيب يجب أن يكون رقماً صحيحاً').min(0).max(CATEGORY_ORDER_MAX).optional(),
  isActive: z.boolean().optional(),
}).strict();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;