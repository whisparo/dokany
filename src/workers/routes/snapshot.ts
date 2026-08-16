// src/workers/routes/snapshot.ts

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull } from 'drizzle-orm';
import { stores, products, categories } from '@/lib/db/schema';
import type { Env } from '@/lib/env';
import { safeExecute } from '@/lib/errors/safe-executor';
import { SystemError } from '@/lib/errors/types';

export const snapshotRouter = new Hono<{ Bindings: Env }>();

/**
 * 📸 GET /api/store/:storeSlug/snapshot
 * Edge Snapshot API — يرجع بيانات المتجر كاملة كـ JSON
 */
snapshotRouter.get('/store/:storeSlug/snapshot', (c) =>
  safeExecute(async () => {
    const storeSlug = decodeURIComponent(c.req.param('storeSlug'));

    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new SystemError({
        code: 'INVALID_SLUG',
        userMessage: 'معرف المتجر غير صالح.',
        technicalMessage: 'Store slug is missing or invalid',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    const db = drizzle(c.env.DB);

    // ═══════════════════════════════════════════════════════════
    // 1️⃣ جلب بيانات المتجر الأساسية فقط
    // ═══════════════════════════════════════════════════════════
    const store = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        shopName: stores.shopName,
        description: stores.description,
        logo: stores.logo,
        coverImage: stores.coverImage,
        currency: stores.currency,
        theme: stores.theme,
        settings: stores.settings,
        isActive: stores.isActive,
        isVerified: stores.isVerified,
        snapshotVersion: stores.snapshotVersion,
      })
      .from(stores)
      .where(
        and(
          eq(stores.slug, storeSlug),
          isNull(stores.deletedAt),
          eq(stores.isActive, true)
        )
      )
      .get();

    if (!store) {
      throw new SystemError({
        code: 'STORE_NOT_FOUND',
        userMessage: 'المتجر غير موجود أو مغلق.',
        technicalMessage: `Store '${storeSlug}' not found, deleted, or inactive`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 2️⃣ جلب التصنيفات والمنتجات بالتوازي وبحقول محددة لتقليل memory overhead
    // ═══════════════════════════════════════════════════════════
    const [allCategories, allProducts] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          parentId: categories.parentId,
          order: categories.order,
        })
        .from(categories)
        .where(
          and(
            eq(categories.storeId, store.id),
            eq(categories.isActive, true),
            isNull(categories.deletedAt)
          )
        )
        .orderBy(categories.order, categories.name)
        .all(),

      db
        .select({
          id: products.id,
          categoryId: products.categoryId,
          name: products.name,
          slug: products.slug,
          description: products.description,
          shortDescription: products.shortDescription,
          price: products.price,
          compareAtPrice: products.compareAtPrice,
          stock: products.stock,
          sku: products.sku,
          imageSrc: products.imageSrc,
          images: products.images,
          isPublished: products.isPublished,
          isFeatured: products.isFeatured,
          haggleEnabled: products.haggleEnabled,
          minPrice: products.minPrice,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(
          and(
            eq(products.storeId, store.id),
            eq(products.isPublished, true),
            isNull(products.deletedAt)
          )
        )
        .orderBy(products.createdAt)
        .all(),
    ]);

    // ═══════════════════════════════════════════════════════════
    // 3️⃣ ETag Validation (قبل تشكيل الـ Snapshot JSON الكبير)
    // ═══════════════════════════════════════════════════════════
    const etag = `v${store.snapshotVersion}`;
    const ifNoneMatch = c.req.header('If-None-Match');

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Tag': `store-${store.id}`,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 4️⃣ بناء الـ Snapshot
    // ═══════════════════════════════════════════════════════════
    const snapshot = {
      version: store.snapshotVersion,
      storeId: store.id,
      generatedAt: Date.now(),
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        shopName: store.shopName ?? store.name,
        description: store.description,
        logo: store.logo,
        coverImage: store.coverImage,
        currency: store.currency,
        theme: store.theme,
        settings: store.settings,
        isActive: store.isActive,
        isVerified: store.isVerified,
      },
      categories: allCategories,
      products: allProducts.map((p) => ({
        ...p,
        image: p.imageSrc || '',
      })),
      totalCount: allProducts.length,
    };

    return c.json(snapshot, 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      ETag: etag,
      'Cache-Tag': `store-${store.id}`,
      'X-Content-Type-Options': 'nosniff',
    });
  })
);

/**
 * 🔍 GET /api/store/:storeSlug/version
 * Light Version Check
 */
snapshotRouter.get('/store/:storeSlug/version', (c) =>
  safeExecute(async () => {
    const storeSlug = decodeURIComponent(c.req.param('storeSlug'));

    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new SystemError({
        code: 'INVALID_SLUG',
        userMessage: 'معرف المتجر غير صالح.',
        technicalMessage: 'Store slug is missing or invalid',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    const db = drizzle(c.env.DB);

    const store = await db
      .select({
        id: stores.id,
        snapshotVersion: stores.snapshotVersion,
      })
      .from(stores)
      .where(
        and(
          eq(stores.slug, storeSlug),
          isNull(stores.deletedAt),
          eq(stores.isActive, true)
        )
      )
      .get();

    if (!store) {
      throw new SystemError({
        code: 'STORE_NOT_FOUND',
        userMessage: 'المتجر غير موجود.',
        technicalMessage: `Store '${storeSlug}' not found`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    const version = store.snapshotVersion;
    const etag = `"v${store.snapshotVersion}"`;
    const ifNoneMatch = c.req.header('If-None-Match');

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Tag': `store-version-${store.id}`,
        },
      });
    }

    return c.json(
      {
        storeId: store.id,
        version,
        checkedAt: Date.now(),
      },
      200,
      {
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=15',
        ETag: etag,
        'Cache-Tag': `store-version-${store.id}`,
      }
    );
  })
);