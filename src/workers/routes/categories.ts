// src/workers/routes/categories.ts

import { Hono } from 'hono';
import { eq, and, isNull, ne, or, count } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { safeExecute } from '@/lib/errors/safe-executor';
import { SystemError } from '@/lib/errors/types';
import { createCategorySchema, updateCategorySchema } from '@/lib/validations/category';
import { requireAuth, type AuthVariables } from '@/workers/middleware/auth';

// ✅ استخدام AuthVariables الموحد من الـ Middleware
export const categoriesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * دالة تحويل الاسم إلى Slug آمن مع دعم كامل للغة العربية والرموز
 */
function slugify(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0600-\u06FF-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : `category-${Date.now()}`;
}

/**
 * جلب المتجر والتأكد من وجوده + فحص الملكية (Anti-IDOR)
 * @param requiredOwnerId - معرف المستخدم المطلوب لملكية المتجر (اختياري)
 */
async function getStoreBySlugOrThrow(
  db: ReturnType<typeof getDb>,
  slug: string,
  path: string,
  requiredOwnerId?: string
) {
  const store = await db
    .select({ id: schema.stores.id, ownerId: schema.stores.ownerId })
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

  // 🛡️ فحص الملكية ضد ثغرات IDOR
  if (requiredOwnerId && store.ownerId !== requiredOwnerId) {
    throw new SystemError({
      code: 'FORBIDDEN',
      userMessage: 'ليس لديك صلاحية لإجراء تغييرات على تصنيفات هذا المتجر.',
      technicalMessage: `User '${requiredOwnerId}' attempted unauthorized operation on store '${store.id}' owned by '${store.ownerId}'.`,
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
      context: { storeId: store.id, path, extras: { userId: requiredOwnerId } },
    });
  }

  return store;
}

// ============================================================
// 🟢 GET Routes (Public - عرض التصنيفات)
// ============================================================

/**
 * GET /api/store/:slug/categories
 * جلب جميع التصنيفات غير المحذوفة مرتبة
 */
categoriesRouter.get('/store/:slug/categories', (c) =>
  safeExecute(async () => {
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
      .orderBy(schema.categories.order, schema.categories.name);

    return c.json({ success: true, data: categoriesList }, 200);
  })
);

/**
 * GET /api/store/:slug/categories/:id/products
 * جلب منتجات تصنيف معين مع الترقيم (Pagination)
 * 🛡️ SEC-006: إظهار المنتجات المنشورة فقط للعموم
 */
categoriesRouter.get('/store/:slug/categories/:id/products', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100);
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);

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

    // ✅ SEC-006: إضافة فلتر isPublished لمنع تسريب المسودات للعموم
    const whereProductsClause = and(
      eq(schema.products.categoryId, id),
      eq(schema.products.isPublished, true), // 🛡️ منع عرض المسودات
      isNull(schema.products.deletedAt)
    );

    const products = await db
      .select()
      .from(schema.products)
      .where(whereProductsClause)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: count() })
      .from(schema.products)
      .where(whereProductsClause)
      .get();

    const total = countResult?.count ?? 0;

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
  })
);

// ============================================================
// 🟡 POST / PUT / DELETE Routes (Protected)
// ============================================================

/**
 * POST /api/store/:slug/categories
 * إنشاء تصنيف جديد مع حماية تكرار الـ Name والـ Slug
 */
categoriesRouter.post('/store/:slug/categories', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    // ✅ استخدام userId الصحيح من السياق (يُوضع بواسطة requireAuth)
    const userId = c.get('userId');
    const rawBody = await c.req.json();

    const db = getDb({ DB: c.env.DB });

    // 🛡️ فحص وجود المتجر + ملكيته للمستخدم الحالي
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path, userId);

    const parsed = createCategorySchema.safeParse({
      ...rawBody,
      storeId: store.id,
      slug: rawBody.slug?.trim() ? slugify(rawBody.slug) : slugify(rawBody.name || ''),
    });

    if (!parsed.success) {
      throw new SystemError({
        code: 'CATEGORY_VALIDATION_ERROR',
        userMessage: parsed.error.issues[0]?.message || 'بيانات التصنيف غير صحيحة.',
        technicalMessage: JSON.stringify(parsed.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: store.id, path: c.req.path },
      });
    }

    const { name, description, parentId, order, isActive, slug: categorySlug } = parsed.data;

    // التحقق من تكرار الاسم أو الـ Slug بنفس المتجر
    const existing = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.storeId, store.id),
          or(
            eq(schema.categories.name, name),
            eq(schema.categories.slug, categorySlug)
          ),
          isNull(schema.categories.deletedAt)
        )
      )
      .get();

    if (existing) {
      throw new SystemError({
        code: 'CATEGORY_ALREADY_EXISTS',
        userMessage: 'يوجد تصنيف آخر بنفس الاسم أو الـ Slug في متجرك.',
        technicalMessage: `Category name '${name}' or slug '${categorySlug}' already exists in store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: store.id, path: c.req.path },
      });
    }

    const now = new Date();

    const [newCategory] = await db
      .insert(schema.categories)
      .values({
        id: crypto.randomUUID(),
        storeId: store.id,
        name,
        slug: categorySlug,
        description: description || null,
        parentId: parentId || null,
        order: order ?? 0,
        isActive: isActive ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ success: true, data: newCategory }, 201);
  })
);

/**
 * PUT /api/store/:slug/categories/:id
 * تحديث تصنيف مع منع الـ Circular Dependency
 */
categoriesRouter.put('/store/:slug/categories/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    // ✅ استخدام userId الصحيح من السياق
    const userId = c.get('userId');
    const rawBody = await c.req.json();

    const parsed = updateCategorySchema.safeParse({
      ...rawBody,
      slug: rawBody.slug ? slugify(rawBody.slug) : rawBody.name ? slugify(rawBody.name) : undefined,
    });

    if (!parsed.success) {
      throw new SystemError({
        code: 'CATEGORY_VALIDATION_ERROR',
        userMessage: parsed.error.issues[0]?.message || 'بيانات التحديث غير صحيحة.',
        technicalMessage: JSON.stringify(parsed.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: slug, path: c.req.path },
      });
    }

    // منع جعل التصنيف أباً لنفسه
    if (parsed.data.parentId && parsed.data.parentId === id) {
      throw new SystemError({
        code: 'CATEGORY_INVALID_PARENT',
        userMessage: 'لا يمكن جعل التصنيف أباً لنفسه.',
        technicalMessage: `Category '${id}' cannot set parentId to itself.`,
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: slug, path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });

    // 🛡️ فحص وجود المتجر + ملكيته للمستخدم الحالي
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path, userId);

    // التأكد من عدم وجود تعارض في الاسم أو الـ Slug مع تصنيف آخر
    if (parsed.data.name || parsed.data.slug) {
      const conditions = [];
      if (parsed.data.name) conditions.push(eq(schema.categories.name, parsed.data.name));
      if (parsed.data.slug) conditions.push(eq(schema.categories.slug, parsed.data.slug));

      const duplicate = await db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.storeId, store.id),
            ne(schema.categories.id, id),
            or(...conditions),
            isNull(schema.categories.deletedAt)
          )
        )
        .get();

      if (duplicate) {
        throw new SystemError({
          code: 'CATEGORY_ALREADY_EXISTS',
          userMessage: 'الاسم أو الـ Slug مستخدم بالفعل في تصنيف آخر داخل المتجر.',
          technicalMessage: `Category duplicate conflict for store '${store.id}' on category '${id}'.`,
          category: 'business',
          severity: 'info',
          retryable: false,
          shouldAlert: false,
          context: { storeId: store.id, path: c.req.path },
        });
      }
    }

    const updated = await db
      .update(schema.categories)
      .set({
        ...parsed.data,
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
  })
);

/**
 * DELETE /api/store/:slug/categories/:id
 * حذف منطقي (Soft Delete) مع التحقق من خلو التصنيف من المنتجات
 */
categoriesRouter.delete('/store/:slug/categories/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    // ✅ استخدام userId الصحيح من السياق
    const userId = c.get('userId');

    const db = getDb({ DB: c.env.DB });

    // 🛡️ فحص وجود المتجر + ملكيته للمستخدم الحالي
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path, userId);

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

    const countResult = await db
      .select({ count: count() })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.categoryId, id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    const productCount = countResult?.count ?? 0;

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

    const now = new Date();

    await db
      .update(schema.categories)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.categories.id, id),
          eq(schema.categories.storeId, store.id)
        )
      );

    return c.json(
      {
        success: true,
        data: { message: 'تم حذف التصنيف بنجاح' },
      },
      200
    );
  })
);