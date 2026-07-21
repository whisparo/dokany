// src/workers/routes/categories.ts

import { Hono } from 'hono';
import { eq, and, sql, isNull } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export const categoriesRouter = new Hono<{ Bindings: Env }>();

/**
 * دالة تحويل الاسم إلى Slug مع دعم اللغة العربية
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0600-\u06FF-]/g, '') // يدعم الحروف العربية والإنجليزي والأرقام
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
}

/**
 * دالة مساعدة لجلب المتجر وضمان وجوده
 */
async function getStoreBySlugOrThrow(db: ReturnType<typeof getDb>, slug: string, path: string) {
  const store = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.slug, slug))
    .get();

  if (!store) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      userMessage: 'المتجر المطلوب غير موجود.',
      technicalMessage: `Store with slug '${slug}' was not found.`,
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

  const categories = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.storeId, store.id),
        isNull(schema.categories.deletedAt) // مراعاة Soft Delete المعرف في السكيما
      )
    )
    .orderBy(schema.categories.name);

  return c.json({ success: true, data: categories }, 200);
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
    .where(eq(schema.products.categoryId, id))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.products)
    .where(eq(schema.products.categoryId, id));

  return c.json(
    {
      success: true,
      data: {
        category: validCategory,
        products,
        pagination: {
          limit,
          offset,
          total: count,
          hasMore: offset + limit < count,
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
  const body = await c.req.json<{ name: string; description?: string; slug?: string }>();

  if (!body.name || body.name.trim().length === 0) {
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

  // فحص وجود نفس الاسم في التصنيفات النشطة
  const existing = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.storeId, store.id),
        eq(schema.categories.name, body.name.trim()),
        isNull(schema.categories.deletedAt)
      )
    )
    .get();

  if (existing) {
    throw new SystemError({
      code: 'CATEGORY_ALREADY_EXISTS',
      userMessage: 'يوجد تصنيف آخر بنفس هذا الاسم في متجرك.',
      technicalMessage: `Category name '${body.name}' already exists for storeId '${store.id}'.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  const categorySlug = body.slug?.trim() || slugify(body.name);
  const now = new Date();

  // ✅ المطابقة الدقيقة للسكيما
  const newCategory = await db
    .insert(schema.categories)
    .values({
      id: crypto.randomUUID(),
      storeId: store.id,
      name: body.name.trim(),
      slug: categorySlug, // 👈 حقل إجباري تم توفيره
      description: body.description?.trim() || null,
      createdAt: now, // 👈 Date Object لأن المود timestamp
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

  if (!body.name || body.name.trim().length === 0) {
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

  const categorySlug = body.slug?.trim() || slugify(body.name);

  const updated = await db
    .update(schema.categories)
    .set({
      name: body.name.trim(),
      slug: categorySlug,
      description: body.description?.trim() || null,
      updatedAt: new Date(), // 👈 Date Object
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

  // التحقق من وجود منتجات مرتبطة
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.products)
    .where(eq(schema.products.categoryId, id));

  if (count > 0) {
    throw new SystemError({
      code: 'CATEGORY_NOT_EMPTY',
      userMessage: `لا يمكن حذف التصنيف لأنه يحتوي على ${count} منتج. قم بنقل المنتجات أو حذفها أولاً.`,
      technicalMessage: `Cannot delete category '${id}'. Contains ${count} linked products.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: store.id, path: c.req.path },
    });
  }

  // تنفيذ الـ Soft Delete بحسب تصميمة السكيما
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