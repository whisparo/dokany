// src/worker/routes/products.ts

import { Hono, type Context } from 'hono';
import { eq, and, desc, isNull, like, gte, lte, count } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { safeExecute, SystemError } from '@/lib/errors';
import type { ProductImage, ProductVariant, NewProduct } from '@/lib/db/schema/products';
import { createProductSchema, updateProductSchema } from '@/lib/validations/product';
import { requireAuth, type AuthVariables } from '@/workers/middleware/auth';

export const productsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/* ============================================================================
 * 🧹 HELPERS & UTILS
 * ============================================================================ */

function sanitizeString(val: string): string {
  return val.replace(/<[^>]*>?/gm, '').trim();
}

function generateSlug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return cleaned || `product-${Date.now()}`;
}

/**
 * جلب المتجر والتأكد من وجوده + فحص الملكية (Anti-IDOR)
 */
async function getStoreBySlugOrThrow(
  db: ReturnType<typeof getDb>,
  slug: string,
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  requiredOwnerId?: string
) {
  const store = await db
    .select({ id: schema.stores.id, ownerId: schema.stores.ownerId })
    .from(schema.stores)
    .where(and(eq(schema.stores.slug, slug), isNull(schema.stores.deletedAt)))
    .get();

  if (!store) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      userMessage: 'المتجر المطلوب غير موجود.',
      technicalMessage: `Store with slug '${slug}' not found or deleted.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      storeId: slug,
      metadata: { path: c.req.path, storeSlug: slug },
    });
  }

  if (requiredOwnerId && store.ownerId !== requiredOwnerId) {
    throw new SystemError({
      code: 'FORBIDDEN',
      userMessage: 'ليس لديك صلاحية لإجراء تغييرات على منتجات هذا المتجر.',
      technicalMessage: `User '${requiredOwnerId}' attempted unauthorized operation on store '${store.id}' owned by '${store.ownerId}'.`,
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
      storeId: store.id,
      metadata: { path: c.req.path, userId: requiredOwnerId },
    });
  }

  return store;
}

/**
 * التحقق من ملكية التصنيف للمتجر الحالي
 */
async function validateCategoryOwnership(
  db: ReturnType<typeof getDb>,
  categoryId: string,
  storeId: string,
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
) {
  const category = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, categoryId),
        eq(schema.categories.storeId, storeId),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (!category) {
    throw new SystemError({
      code: 'CATEGORY_NOT_FOUND',
      userMessage: 'التصنيف المختار غير موجود أو لا ينتمي لهذا المتجر.',
      technicalMessage: `Category '${categoryId}' invalid or does not belong to store '${storeId}'.`,
      category: 'validation',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      storeId,
      metadata: { path: c.req.path, categoryId },
    });
  }
}

/* ============================================================================
 * 🛠️ QUERY VALIDATION SCHEMAS
 * ============================================================================ */

const ProductQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional().transform((val) => (val ? sanitizeString(val) : undefined)),
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

/* ============================================================================
 * 🌐 ROUTES IMPLEMENTATION
 * ============================================================================ */

/**
 * 🟢 GET /api/store/:slug/products (Public - only published products)
 */
productsRouter.get('/store/:slug/products', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const queryResult = ProductQuerySchema.safeParse(c.req.query());

    if (!queryResult.success) {
      throw new SystemError({
        code: 'QUERY_VALIDATION_ERROR',
        userMessage: 'مدخلات الاستعلام غير صالحة.',
        technicalMessage: JSON.stringify(queryResult.error.format()),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: slug || 'unknown',
        metadata: { path: c.req.path },
      });
    }

    const { limit, offset, search, categoryId, minPrice, maxPrice } = queryResult.data;
    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c);

    const conditions = [
      eq(schema.products.storeId, store.id),
      isNull(schema.products.deletedAt),
      eq(schema.products.isPublished, true),
    ];

    if (search) {
      conditions.push(like(schema.products.name, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(schema.products.categoryId, categoryId));
    }
    if (minPrice !== undefined) {
      conditions.push(gte(schema.products.price, minPrice));
    }
    if (maxPrice !== undefined) {
      conditions.push(lte(schema.products.price, maxPrice));
    }

    const whereClause = and(...conditions);

    const countResult = await db
      .select({ count: count() })
      .from(schema.products)
      .where(whereClause)
      .get();

    const total = Number(countResult?.count ?? 0);

    const products = await db
      .select()
      .from(schema.products)
      .where(whereClause)
      .orderBy(desc(schema.products.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json(
      {
        success: true,
        data: {
          products,
          pagination: { limit, offset, total, hasMore: offset + limit < total },
        },
      },
      200
    );
  })
);

/**
 * 🟢 GET /api/store/:slug/products/:productSlug (Public - only published)
 */
productsRouter.get('/store/:slug/products/:productSlug', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const productSlug = c.req.param('productSlug');

    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c);

    const product = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.slug, productSlug),
          eq(schema.products.storeId, store.id),
          eq(schema.products.isPublished, true),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!product) {
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج المطلوب غير موجود.',
        technicalMessage: `Product '${productSlug}' not found in store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: store.id,
        metadata: { path: c.req.path, productSlug },
      });
    }

    return c.json({ success: true, data: product }, 200);
  })
);

/**
 * 🟡 POST /api/store/:slug/products (Protected & Anti-IDOR)
 */
productsRouter.post('/store/:slug/products', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const userId = c.get('userId');
    const rawBody = await c.req.json().catch(() => null);

    const validation = createProductSchema.safeParse(rawBody);
    if (!validation.success) {
      throw new SystemError({
        code: 'CREATE_PRODUCT_VALIDATION_ERROR',
        userMessage: validation.error.issues[0]?.message || 'بيانات المنتج غير صالحة.',
        technicalMessage: JSON.stringify(validation.error.format()),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: slug || 'unknown',
        metadata: { path: c.req.path, userId },
      });
    }

    const body = validation.data;
    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c, userId);

    // 🛡️ فحص ملكية التصنيف لو تم تمريره
    if (body.categoryId) {
      await validateCategoryOwnership(db, body.categoryId, store.id, c);
    }

    const slugified = body.slug || generateSlug(body.name);

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
      throw new SystemError({
        code: 'PRODUCT_SLUG_ALREADY_EXISTS',
        userMessage: 'منتج بنفس هذا الاسم أو الـ slug موجود بالفعل.',
        technicalMessage: `Product slug '${slugified}' collision in store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: store.id,
        metadata: { path: c.req.path, userId },
      });
    }

    const insertPayload: NewProduct = {
      id: crypto.randomUUID(),
      storeId: store.id,
      name: body.name,
      slug: slugified,
      price: body.price,
      compareAtPrice: body.compareAtPrice ?? null,
      cost: body.cost ?? null,
      description: body.description ?? null,
      shortDescription: body.shortDescription ?? null,
      categoryId: body.categoryId ?? null,
      stock: body.stock,
      sku: body.sku ?? null,
      barcode: body.barcode ?? null,
      images: body.images as ProductImage[],
      variants: body.variants as ProductVariant[],
      isPublished: body.isPublished,
      isFeatured: body.isFeatured,
      haggleEnabled: body.haggleEnabled,
      minPrice: body.minPrice ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newProduct = await db.insert(schema.products).values(insertPayload).returning();

    return c.json({ success: true, data: newProduct[0] }, 201);
  })
);

/**
 * 🟡 PUT /api/store/:slug/products/:id (Protected & Anti-IDOR)
 */
productsRouter.put('/store/:slug/products/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const userId = c.get('userId');
    const rawBody = await c.req.json().catch(() => null);

    const validation = updateProductSchema.safeParse(rawBody);
    if (!validation.success) {
      throw new SystemError({
        code: 'UPDATE_PRODUCT_VALIDATION_ERROR',
        userMessage: validation.error.issues[0]?.message || 'بيانات التحديث غير صالحة.',
        technicalMessage: JSON.stringify(validation.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: slug || 'unknown',
        metadata: { path: c.req.path, userId },
      });
    }

    const body = validation.data;
    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c, userId);

    // 🛡️ فحص ملكية التصنيف الجديد لو تم تحديثه
    if (body.categoryId) {
      await validateCategoryOwnership(db, body.categoryId, store.id, c);
    }

    const existing = await db
      .select({ id: schema.products.id, slug: schema.products.slug })
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
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود أو لا تملك صلاحية تعديله.',
        technicalMessage: `Product '${id}' not found for store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: store.id,
        metadata: { path: c.req.path, userId },
      });
    }

    const updates: Partial<NewProduct> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      const newSlug = body.slug || generateSlug(body.name);

      if (newSlug !== existing.slug) {
        const slugCollision = await db
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(
            and(
              eq(schema.products.storeId, store.id),
              eq(schema.products.slug, newSlug),
              isNull(schema.products.deletedAt)
            )
          )
          .get();

        if (slugCollision) {
          throw new SystemError({
            code: 'PRODUCT_SLUG_ALREADY_EXISTS',
            userMessage: 'اسم المنتج الجديد يتعارض مع منتج آخر موجود مسبقاً.',
            technicalMessage: `Update slug collision '${newSlug}' in store '${store.id}'.`,
            category: 'business',
            severity: 'info',
            retryable: false,
            shouldAlert: false,
            storeId: store.id,
            metadata: { path: c.req.path, userId },
          });
        }
      }

      updates.name = body.name;
      updates.slug = newSlug;
    }

    if (body.price !== undefined) updates.price = body.price;
    if (body.compareAtPrice !== undefined) updates.compareAtPrice = body.compareAtPrice;
    if (body.cost !== undefined) updates.cost = body.cost;
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

    // 🛡️ التحديث محصن بـ (id + storeId + deletedAt)
    const updated = await db
      .update(schema.products)
      .set(updates)
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .returning();

    return c.json({ success: true, data: updated[0] }, 200);
  })
);

/**
 * 🔴 DELETE /api/store/:slug/products/:id (Protected & Anti-IDOR)
 */
productsRouter.delete('/store/:slug/products/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const userId = c.get('userId');

    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c, userId);

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
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود أو لا تملك صلاحية حذفه.',
        technicalMessage: `Product '${id}' not found for store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: store.id,
        metadata: { path: c.req.path, userId },
      });
    }

    const now = new Date();
    // 🛡️ الحذف محصن بـ (id + storeId)
    await db
      .update(schema.products)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id)
        )
      );

    return c.json({ success: true, data: { message: 'تم حذف المنتج بنجاح' } }, 200);
  })
);