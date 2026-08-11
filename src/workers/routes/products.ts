// src/worker/routes/products.ts

import { Hono } from 'hono';
import { eq, and, ilike, sql, desc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import type { ProductImage, ProductVariant, NewProduct } from '@/lib/db/schema/products';

/**
 * 🔒 Hono Context Variables Shape
 */
type Variables = {
  user?: {
    id: string;
    email: string;
  };
  storeId?: string;
};

export const productsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * 🧹 Helper: sanitize string from potential HTML tags
 */
function sanitizeString(val: string): string {
  return val.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * 🏷️ Helper: slug generation supporting Arabic & English
 */
function generateSlug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return cleaned || `product-${Date.now()}`;
}

/* ============================================================================
 * 🛠️ ZOD VALIDATION SCHEMAS (مطابقة تماماً لـ Schema الجدول)
 * ============================================================================ */

const ProductImageSchema: z.ZodType<ProductImage> = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  isPrimary: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
});

const ProductVariantSchema: z.ZodType<ProductVariant> = z.object({
  name: z.string().min(1, 'اسم المتغير مطلوب'),
  options: z.array(z.string()).default([]),
});

const ProductQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional().transform((val) => (val ? sanitizeString(val) : undefined)),
  categoryId: z.string().uuid().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

const CreateProductSchema = z.object({
  name: z.string().min(1, 'اسم المنتج مطلوب').transform(sanitizeString),
  price: z.union([z.number(), z.string()]).transform((val) => {
    const num = Number(val);
    if (isNaN(num) || num < 0) throw new Error('السعر يجب أن يكون رقماً موجباً');
    return String(num);
  }),
  compareAtPrice: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((val) => (val !== undefined && val !== null ? String(val) : null)),
  description: z.string().optional().nullable().transform((val) => (val ? sanitizeString(val) : null)),
  shortDescription: z.string().optional().nullable().transform((val) => (val ? sanitizeString(val) : null)),
  categoryId: z.string().uuid().optional().nullable(),
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  images: z.array(ProductImageSchema).default([]),
  variants: z.array(ProductVariantSchema).default([]),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  haggleEnabled: z.boolean().default(false),
  minPrice: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((val) => (val !== undefined && val !== null ? String(val) : null)),
});

const UpdateProductSchema = CreateProductSchema.partial();

/* ============================================================================
 * 🌐 ROUTES IMPLEMENTATION
 * ============================================================================ */

/**
 * GET /api/store/:slug/products
 * جلب منتجات متجر معين (عام للعملاء والواجهة)
 */
productsRouter.get('/store/:slug/products', async (c) => {
  try {
    const slug = c.req.param('slug');
    const queryResult = ProductQuerySchema.safeParse(c.req.query());

    if (!queryResult.success) {
      return c.json({ success: false, error: 'مدخلات الاستعلام غير صالحة', details: queryResult.error.format() }, 400);
    }

    const { limit, offset, search, categoryId, minPrice, maxPrice } = queryResult.data;
    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) {
      return c.json({ success: false, error: 'المتجر غير موجود' }, 404);
    }

    const conditions = [
      eq(schema.products.storeId, store.id),
      isNull(schema.products.deletedAt),
    ];

    if (search) conditions.push(ilike(schema.products.name, `%${search}%`));
    if (categoryId) conditions.push(eq(schema.products.categoryId, categoryId));

    if (minPrice !== undefined) {
      conditions.push(sql`CAST(${schema.products.price} AS REAL) >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      conditions.push(sql`CAST(${schema.products.price} AS REAL) <= ${maxPrice}`);
    }

    const whereClause = and(...conditions);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.products)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    const products = await db
      .select()
      .from(schema.products)
      .where(whereClause)
      .orderBy(desc(schema.products.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        products,
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return c.json({ success: false, error: 'فشل في جلب المنتجات' }, 500);
  }
});

/**
 * GET /api/store/:slug/products/:productSlug
 * جلب منتج مفرد عبر Slug
 */
productsRouter.get('/store/:slug/products/:productSlug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const productSlug = c.req.param('productSlug');

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'المتجر غير موجود' }, 404);

    const product = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.slug, productSlug),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!product) return c.json({ success: false, error: 'المنتج غير موجود' }, 404);

    return c.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    return c.json({ success: false, error: 'فشل في جلب البيانات' }, 500);
  }
});

/**
 * POST /api/store/:slug/products
 * إنشاء منتج جديد
 */
productsRouter.post('/store/:slug/products', async (c) => {
  try {
    const slug = c.req.param('slug');
    const rawBody = await c.req.json().catch(() => null);

    const validation = CreateProductSchema.safeParse(rawBody);
    if (!validation.success) {
      return c.json({ success: false, error: 'بيانات المنتج غير صالحة', details: validation.error.format() }, 400);
    }

    const body = validation.data;
    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'المتجر غير موجود' }, 404);

    const slugified = generateSlug(body.name);

    const existingSlug = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.storeId, store.id),
          eq(schema.products.slug, slugified),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (existingSlug) {
      return c.json({ success: false, error: 'منتج بنفس هذا الاسم موجود بالفعل' }, 409);
    }

    const insertPayload: NewProduct = {
      id: crypto.randomUUID(),
      storeId: store.id,
      name: body.name,
      slug: slugified,
      price: body.price,
      compareAtPrice: body.compareAtPrice,
      description: body.description,
      shortDescription: body.shortDescription,
      categoryId: body.categoryId,
      stock: body.stock,
      sku: body.sku,
      barcode: body.barcode,
      images: body.images as ProductImage[],
      variants: body.variants as ProductVariant[],
      isPublished: body.isPublished,
      isFeatured: body.isFeatured,
      haggleEnabled: body.haggleEnabled,
      minPrice: body.minPrice,
    };

    const newProduct = await db
      .insert(schema.products)
      .values(insertPayload)
      .returning();

    return c.json({ success: true, data: newProduct[0] }, 201);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ success: false, error: 'فشل في إنشاء المنتج' }, 500);
  }
});

/**
 * PUT /api/store/:slug/products/:id
 * تحديث منتج موجود
 */
productsRouter.put('/store/:slug/products/:id', async (c) => {
  try {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const rawBody = await c.req.json().catch(() => null);

    const validation = UpdateProductSchema.safeParse(rawBody);
    if (!validation.success) {
      return c.json({ success: false, error: 'بيانات التحديث غير صالحة', details: validation.error.format() }, 400);
    }

    const body = validation.data;
    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'المتجر غير موجود' }, 404);

    const existing = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!existing) {
      return c.json({ success: false, error: 'المنتج غير موجود أو لا تملك صلاحية تعديله' }, 404);
    }

    const updates: Partial<NewProduct> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      updates.name = body.name;
      updates.slug = generateSlug(body.name);
    }
    if (body.price !== undefined) updates.price = body.price;
    if (body.compareAtPrice !== undefined) updates.compareAtPrice = body.compareAtPrice;
    if (body.description !== undefined) updates.description = body.description;
    if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.stock !== undefined) updates.stock = body.stock;
    if (body.sku !== undefined) updates.sku = body.sku;
    if (body.barcode !== undefined) updates.barcode = body.barcode;
    if (body.images !== undefined) updates.images = body.images as ProductImage[];
    if (body.variants !== undefined) updates.variants = body.variants as ProductVariant[];
    if (body.isPublished !== undefined) updates.isPublished = body.isPublished;
    if (body.isFeatured !== undefined) updates.isFeatured = body.isFeatured;
    if (body.haggleEnabled !== undefined) updates.haggleEnabled = body.haggleEnabled;
    if (body.minPrice !== undefined) updates.minPrice = body.minPrice;

    const updated = await db
      .update(schema.products)
      .set(updates)
      .where(eq(schema.products.id, id))
      .returning();

    return c.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error('Error updating product:', error);
    return c.json({ success: false, error: 'فشل في تعديل المنتج' }, 500);
  }
});

/**
 * DELETE /api/store/:slug/products/:id
 * حذف منتج (Soft Delete)
 */
productsRouter.delete('/store/:slug/products/:id', async (c) => {
  try {
    const slug = c.req.param('slug');
    const id = c.req.param('id');

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'المتجر غير موجود' }, 404);

    const product = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!product) {
      return c.json({ success: false, error: 'المنتج غير موجود أو لا تملك صلاحية حذفه' }, 404);
    }

    await db
      .update(schema.products)
      .set({ deletedAt: new Date() })
      .where(eq(schema.products.id, id));

    return c.json({ success: true, data: { message: 'تم حذف المنتج بنجاح' } });
  } catch (error) {
    console.error('Error deleting product:', error);
    return c.json({ success: false, error: 'فشل في حذف المنتج' }, 500);
  }
});