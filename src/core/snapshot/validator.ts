// src/core/snapshot/validator.ts

import { z } from 'zod';

// ============================================================
// 🧱  Zod Schemas (التحقق من البنية الأساسية)
// ============================================================

export const ProductImageSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  isPrimary: z.boolean().optional(),
  order: z.number().optional(),
});

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  price: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().nullable(),
  images: z.array(ProductImageSchema),
  rating: z.number().min(0).max(5).nullable(),
  reviewsCount: z.number().int().nonnegative().nullable(),
  categoryId: z.string().nullable(),
});

export type CategoryTreeNode = {
  id: string;
  name: string;
  slug: string;
  level: number;
  children: CategoryTreeNode[];
};

export const CategoryTreeSchema: z.ZodType<CategoryTreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    level: z.number().int().nonnegative(),
    children: z.array(CategoryTreeSchema),
  })
);

export const HeaderSchema = z.object({
  logo: z.string().nullable(),
  categoriesTree: z.array(CategoryTreeSchema),
});

export const HeroItemSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  link: z.string().optional(),
});

export const HeroSchema = z.object({
  type: z.string(),
  items: z.array(HeroItemSchema),
});

export const HomeSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  products: z.array(ProductSchema),
});

export const FooterSchema = z.object({
  phone: z.string().nullable().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
});

export const SeoSchema = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const BlueprintSchema = z.object({
  header: HeaderSchema,
  hero: HeroSchema.nullable(),
  homeSections: z.array(HomeSectionSchema),
  footer: FooterSchema.nullable(),
  seo: SeoSchema.nullable(),
});

export const MetaSchema = z.object({
  buildDuration: z.number().int().nonnegative(),
  totalProducts: z.number().int().nonnegative(),
  totalCategories: z.number().int().nonnegative(),
});

// ============================================================
// 📦  Snapshot Schema (المخطط الكامل)
// ============================================================

export const SnapshotSchema = z.object({
  storeId: z.string(),
  slug: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  blueprint: BlueprintSchema,
  _meta: MetaSchema,
});

// ============================================================
// 🧾  Checkout Payload Schema (للتحقق من طلبات الشراء)
// ============================================================

export const CheckoutItemSchema = z.object({
  id: z.string(),
  qty: z.number().int().positive(),
  priceInt: z.number().int().nonnegative(),
});

export const CheckoutPayloadSchema = z.object({
  storeId: z.string(),
  idempotencyKey: z.string().uuid(),
  items: z.array(CheckoutItemSchema),
  totalAmountInt: z.number().int().nonnegative(),
});

// ============================================================
// 🧠  دالة التحقق من التطابق المالي (Fraud Protection)
// ============================================================

export function validateTotalAmountMatch(
  items: Array<{ qty: number; priceInt: number }>,
  totalAmountInt: number
): boolean {
  const calculatedTotal = items.reduce(
    (sum, item) => sum + item.qty * item.priceInt,
    0
  );
  return calculatedTotal === totalAmountInt;
}

// ============================================================
// 📤  دوال التصدير الرئيسية
// ============================================================

/**
 * التحقق من صحة الـ Snapshot الكامل
 */
export function validateSnapshot(data: unknown) {
  return SnapshotSchema.safeParse(data);
}

/**
 * التحقق من صحة Payload الطلب (Checkout)
 * مع التحقق من مطابقة المبلغ الإجمالي (Fraud Protection)
 */
export function validateCheckoutPayload(data: unknown) {
  const result = CheckoutPayloadSchema.safeParse(data);
  if (!result.success) {
    return result;
  }

  const { items, totalAmountInt } = result.data;
  const issues: z.ZodIssue[] = [];

  // فحص التطابق المالي
  if (!validateTotalAmountMatch(items, totalAmountInt)) {
    issues.push({
      code: z.ZodIssueCode.custom,
      path: ['totalAmountInt'],
      message: 'Total amount does not match sum of (priceInt * qty).',
    });
  }

  // فحص عدم وجود منتجات مكررة
  const uniqueIds = new Set(items.map((item) => item.id));
  if (uniqueIds.size !== items.length) {
    issues.push({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'Duplicate product IDs found in the same cart.',
    });
  }

  if (issues.length > 0) {
    return {
      success: false as const,
      error: new z.ZodError(issues),
    };
  }

  return result;
}

// ============================================================
// 📦  إعادة تصدير الأنواع للمساعدة في التطوير
// ============================================================

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>;
export type CheckoutItem = z.infer<typeof CheckoutItemSchema>;
export type Product = z.infer<typeof ProductSchema>;