// src/lib/validations/category.ts
import { z } from 'zod';
import { slugSchema, uuidSchema } from './common';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ المساعدات                                            ║
// ╚════════════════════════════════════════════════════════════╝
const nonEmptyTrimmedString = (schema: z.ZodString) =>
  schema.trim().min(1, 'لا يمكن أن يكون فارغاً');

// 📌 سيتم نقلها إلى src/config/limits.ts قريباً
const CATEGORY_NAME_MIN = 2;
const CATEGORY_NAME_MAX = 100;
const CATEGORY_DESC_MAX = 5000;
const CATEGORY_ORDER_MAX = 9999;

// ╔════════════════════════════════════════════════════════════╗
// ║  📝 اسم التصنيف (يدعم العربية والإنجليزية والأرقام)       ║
// ║  📌 الرسائل بالعربية فقط – هذا قرار واعٍ لاستهداف السوق العربي ║
// ╚════════════════════════════════════════════════════════════╝
const categoryNameSchema = nonEmptyTrimmedString(
  z.string()
    .min(CATEGORY_NAME_MIN, `الاسم يجب أن يكون ${CATEGORY_NAME_MIN} أحرف على الأقل`)
    .max(CATEGORY_NAME_MAX, `الاسم يجب ألا يتجاوز ${CATEGORY_NAME_MAX} حرفاً`)
).regex(
  // يسمح بالحروف العربية والإنجليزية، الأرقام، المسافات، وبعض علامات الترقيم الشائعة.
  /^[\p{L}\p{N}\s\-',،؛]+$/u,
  'الاسم يحتوي على أحرف غير مسموح بها'
);

// ╔════════════════════════════════════════════════════════════╗
// ║  🆕 CREATE CATEGORY – إنشاء تصنيف جديد                     ║
// ╚════════════════════════════════════════════════════════════╝
export const createCategorySchema = z.object({
  storeId: uuidSchema,
  name: categoryNameSchema,
  slug: slugSchema,
  description: z.string().max(CATEGORY_DESC_MAX).trim().optional(),
  parentId: uuidSchema.optional(),
  // level غير مقبول هنا – الخدمة هي من تحسبه
  order: z.number().int().min(0).max(CATEGORY_ORDER_MAX).default(0),
  isActive: z.boolean().default(true),
}).strict().refine(
  (data) => {
    // منع أن يكون parentId هو نفسه storeId (خطأ شائع)
    if (data.parentId && data.parentId === data.storeId) {
      return false;
    }
    return true;
  },
  {
    message: 'معرف التصنيف الأب لا يمكن أن يكون نفس معرف المتجر',
    path: ['parentId'],
  }
);

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ╔════════════════════════════════════════════════════════════╗
// ║  ✏️ UPDATE CATEGORY – تحديث تصنيف                          ║
// ╚════════════════════════════════════════════════════════════╝
export const updateCategorySchema = z.object({
  name: categoryNameSchema.optional(),
  slug: slugSchema.optional(),
  description: z.string().max(CATEGORY_DESC_MAX).trim().optional(),
  // 📌 undefined = لا تغيير. null = إزالة الأب (نقل للجذر). يجب على الخدمة التأكد من أن parentId الجديد:
  //    1. ليس نفس معرّف التصنيف الحالي.
  //    2. ليس من نسل التصنيف الحالي (لمنع الحلقات المفرغة).
  //    3. ينتمي إلى نفس المتجر storeId (عزل تام بين المتاجر).
  parentId: uuidSchema.nullable().optional(),
  order: z.number().int().min(0).max(CATEGORY_ORDER_MAX).optional(),
  isActive: z.boolean().optional(),
}).strict();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;