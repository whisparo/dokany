// src/workers/routes/categories.ts

import { Hono } from 'hono';
import { eq, and, sql, isNull, ne } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export const categoriesRouter = new Hono<{ Bindings: Env }>();

/**
 * دالة تحويل الاسم إلى Slug مع دعم اللغة العربية
 */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `category-${Date.now()}`
  );
}

/**
 * دالة مساعدة لجلب المتجر وضمان وجوده وعدم حذفه
 */
async function getStoreBySlugOrThrow(
  db: ReturnType<typeof getDb>,
  slug: string,
  path: string
) {
  const store = await db
    .select()
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.slug, slug),
        isNull(schema.stores.deletedAt)
      )
    )
    .get();

  if (!store) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      userMessage: 'المتجر المطلوب غير موجود.',
      technicalMessage: `Store with slug '${slug}' was not found or is deleted.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: slug, path },
    });
  }

  return store;
}

/**
 * GET /api/store/:slug/categories
 * جلب جميع التصنيفات غير المحذوفة
 */
categoriesRouter.get('/store/:slug/categories', async (c) => {
  const slug = c.req.param('slug');
  const db = getDb({ DB: c.env.DB });

  const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

  const categoriesList = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.storeId, store.id),
        isNull(schema.categories.deletedAt)
      )
    )
    .orderBy(schema.categories.name);

  return c.json({ success: true, data: categoriesList }, 200);
});

/**
 * GET /api/store/:slug/categories/:id/products
 */
categoriesRouter.get('/store/:slug/categories/:id/products', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = Number(c.req.query('offset')) || 0;

  const db = getDb({ DB: c.env.DB });
  const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

  const validCategory = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.storeId, store.id),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (!validCategory) {
    throw new SystemError({
      code: 'CATEGORY_NOT_FOUND',
      userMessage: 'التصنيف المطلوب غير موجود أو لا ينتمي لهذا المتجر.',
      technicalMessage: `Category ID '${id}' not found for storeId '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  const products = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.categoryId, id),
        isNull(schema.products.deletedAt)
      )
    )
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.categoryId, id),
        isNull(schema.products.deletedAt)
      )
    );

  const total = Number(countResult[0]?.count ?? 0);

  return c.json(
    {
      success: true,
      data: {
        category: validCategory,
        products,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      },
    },
    200
  );
});

/**
 * POST /api/store/:slug/categories
 * إنشاء تصنيف جديد
 */
categoriesRouter.post('/store/:slug/categories', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ name?: string; description?: string; slug?: string }>();

  const trimmedName = body.name?.trim();

  if (!trimmedName) {
    throw new SystemError({
      code: 'CATEGORY_NAME_REQUIRED',
      userMessage: 'اسم التصنيف مطلوب ولا يمكن أن يكون فارغاً.',
      technicalMessage: 'Category name is missing or empty in payload.',
      category: 'validation',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: slug, path: c.req.path },
    });
  }

  const db = getDb({ DB: c.env.DB });
  const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

  const existing = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.storeId, store.id),
        eq(schema.categories.name, trimmedName),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (existing) {
    throw new SystemError({
      code: 'CATEGORY_ALREADY_EXISTS',
      userMessage: 'يوجد تصنيف آخر بنفس هذا الاسم في متجرك.',
      technicalMessage: `Category name '${trimmedName}' already exists for storeId '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  const categorySlug = body.slug?.trim() || slugify(trimmedName);
  const now = new Date();

  const newCategory = await db
    .insert(schema.categories)
    .values({
      id: crypto.randomUUID(),
      storeId: store.id,
      name: trimmedName,
      slug: categorySlug,
      description: body.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return c.json({ success: true, data: newCategory[0] }, 201);
});

/**
 * PUT /api/store/:slug/categories/:id
 * تحديث تصنيف
 */
categoriesRouter.put('/store/:slug/categories/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; slug?: string }>();

  const trimmedName = body.name?.trim();

  if (!trimmedName) {
    throw new SystemError({
      code: 'CATEGORY_NAME_REQUIRED',
      userMessage: 'اسم التصنيف مطلوب ولا يمكن أن يكون فارغاً.',
      technicalMessage: 'Category name is required for update.',
      category: 'validation',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: slug, path: c.req.path },
    });
  }

  const db = getDb({ DB: c.env.DB });
  const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

  // التحقق من أن الاسم غير مستخدم في تصنيف آخر داخل نفس المتجر
  const duplicate = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.storeId, store.id),
        eq(schema.categories.name, trimmedName),
        ne(schema.categories.id, id),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (duplicate) {
    throw new SystemError({
      code: 'CATEGORY_ALREADY_EXISTS',
      userMessage: 'يوجد تصنيف آخر بنفس هذا الاسم في متجرك.',
      technicalMessage: `Category name '${trimmedName}' is already taken by another category in store '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  const categorySlug = body.slug?.trim() || slugify(trimmedName);

  const updated = await db
    .update(schema.categories)
    .set({
      name: trimmedName,
      slug: categorySlug,
      description: body.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.storeId, store.id),
        isNull(schema.categories.deletedAt)
      )
    )
    .returning();

  if (!updated || updated.length === 0) {
    throw new SystemError({
      code: 'CATEGORY_NOT_FOUND',
      userMessage: 'التصنيف المراد تعديله غير موجود.',
      technicalMessage: `Cannot update. Category '${id}' not found for store '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  return c.json({ success: true, data: updated[0] }, 200);
});

/**
 * DELETE /api/store/:slug/categories/:id
 * حذف منطقي (Soft Delete) متوافق مع السكيما
 */
categoriesRouter.delete('/store/:slug/categories/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');

  const db = getDb({ DB: c.env.DB });
  const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

  const category = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.storeId, store.id),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (!category) {
    throw new SystemError({
      code: 'CATEGORY_NOT_FOUND',
      userMessage: 'التصنيف المراد حذفه غير موجود.',
      technicalMessage: `Cannot delete. Category '${id}' not found for store '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  // التحقق من وجود منتجات غير محذوفة مرتبطة بالتصنيف
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.categoryId, id),
        isNull(schema.products.deletedAt)
      )
    );

  const productCount = Number(countResult[0]?.count ?? 0);

  if (productCount > 0) {
    throw new SystemError({
      code: 'CATEGORY_NOT_EMPTY',
      userMessage: `لا يمكن حذف التصنيف لأنه يحتوي على ${productCount} منتج. قم بنقل المنتجات أو حذفها أولاً.`,
      technicalMessage: `Cannot delete category '${id}'. Contains ${productCount} linked products.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  await db
    .update(schema.categories)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.categories.id, id));

  return c.json(
    {
      success: true,
      data: { message: 'تم حذف التصنيف بنجاح' },
    },
    200
  );
});