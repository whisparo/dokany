// src/features/storefront-home/data/store-data-fetcher.ts

import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, count } from 'drizzle-orm';
import { stores, products, categories } from '@/lib/db/schema';
import type { Category } from '@/lib/db/schema/categories';
import type { ProductMetadata } from '@/lib/db/schema/products';
import type { Store, Product } from '@/types';
import type { RawStorePageData } from '@/features/storefront-home/adapters/product-page.adapter';
import type { Env } from '@/lib/env';
import type { InferSelectModel } from 'drizzle-orm';
import { Redis } from '@upstash/redis';

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function getDb(env: Env) {
  if (!env.DB) throw new Error('D1 Database binding not available');
  return drizzle(env.DB);
}

function getRedis(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function getFromCloudflareCache(cacheKey: string): Promise<Response | null> {
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache
    ? (globalCache as unknown as { default: Cache }).default
    : null;

  if (!cache) return null;

  const dummyUrl = `https://store-cache.internal/${cacheKey}`;
  try {
    const match = await cache.match(dummyUrl);
    return match ?? null;
  } catch {
    return null;
  }
}

async function putInCloudflareCache(
  cacheKey: string,
  data: unknown,
  ttlSeconds: number,
  cacheTag?: string,
  ctx?: ExecutionContext
): Promise<void> {
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache
    ? (globalCache as unknown as { default: Cache }).default
    : null;

  if (!cache) return;

  const dummyUrl = `https://store-cache.internal/${cacheKey}`;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttlSeconds}, stale-while-revalidate=600`,
    };

    if (cacheTag) {
      headers['Cache-Tag'] = cacheTag;
    }

    const response = new Response(JSON.stringify(data), { headers });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(cache.put(dummyUrl, response));
    } else {
      await cache.put(dummyUrl, response);
    }
  } catch (e) {
    console.warn('⚠️ Cache put failed:', e);
  }
}

async function acquireRedisLock(redis: Redis, lockKey: string, ttlSeconds: number): Promise<boolean> {
  try {
    const result = await redis.set(lockKey, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (error) {
    console.warn(`⚠️ Failed to acquire Redis lock for key ${lockKey}:`, error);
    return false;
  }
}

async function releaseRedisLock(redis: Redis, lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey);
  } catch (error) {
    console.warn(`⚠️ Failed to release Redis lock for key ${lockKey}:`, error);
  }
}

const inflightPromises = new Map<string, Promise<unknown>>();
const LOCK_TTL_SECONDS = 5;

async function getCachedData<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  env: Env,
  cacheTag?: string,
  ctx?: ExecutionContext
): Promise<T> {
  const cachedResponse = await getFromCloudflareCache(cacheKey);
  if (cachedResponse) {
    try {
      return (await cachedResponse.json()) as T;
    } catch {
      // نكمل إذا فشل الـ Parse
    }
  }

  if (inflightPromises.has(cacheKey)) {
    return (await inflightPromises.get(cacheKey)) as T;
  }

  const redis = getRedis(env);
  const lockKey = `lock:cache:${cacheKey}`;
  let lockAcquired = false;

  if (redis) {
    lockAcquired = await acquireRedisLock(redis, lockKey, LOCK_TTL_SECONDS);
  }

  if (!lockAcquired && redis) {
    let waitTime = 100;
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      waitTime = Math.min(waitTime * 2, 500);

      const retryCache = await getFromCloudflareCache(cacheKey);
      if (retryCache) {
        try {
          return (await retryCache.json()) as T;
        } catch {
          // نكمل إذا فشل الـ Parse
        }
      }
    }
  }

  const fetchPromise = (async (): Promise<T> => {
    try {
      const freshData = await fetchFn();

      if (freshData !== null && freshData !== undefined) {
        await putInCloudflareCache(cacheKey, freshData, ttlSeconds, cacheTag, ctx);
      }

      return freshData;
    } finally {
      inflightPromises.delete(cacheKey);

      if (lockAcquired && redis) {
        await releaseRedisLock(redis, lockKey);
      }
    }
  })();

  inflightPromises.set(cacheKey, fetchPromise);
  return await fetchPromise;
}

// ============================================
// 📌 دوال جلب البيانات الأساسية
// ============================================

export async function fetchStoreInfo(
  storeSlug: string,
  env: Env,
  ctx?: ExecutionContext
): Promise<Store | null> {
  const decodedSlug = decodeURIComponent(storeSlug);

  return getCachedData(
    `store-info:${decodedSlug}`,
    60,
    async () => {
      const db = getDb(env);
      const rawStore = await db
        .select()
        .from(stores)
        .where(
          and(
            eq(stores.slug, decodedSlug),
            isNull(stores.deletedAt),
            eq(stores.isActive, true)
          )
        )
        .get();

      if (!rawStore) return null;

      const theme =
        rawStore.theme && typeof rawStore.theme === 'object'
          ? (rawStore.theme as Record<string, unknown>)
          : {};

      const rawSettings = (
        rawStore.settings && typeof rawStore.settings === 'object'
          ? rawStore.settings
          : {}
      ) as Record<string, unknown>;

      return {
        id: rawStore.id,
        ownerId: rawStore.ownerId,
        name: rawStore.name,
        slug: rawStore.slug,
        shopName: rawStore.shopName ?? rawStore.name,
        description: rawStore.description ?? 'أفضل المتاجر للمنتجات المميزة',
        coverImage: rawStore.coverImage ?? '/images/default-banner.png',
        logo: rawStore.logo ?? null,
        phone: rawStore.phone ?? null,
        email: rawStore.email ?? null,
        telegramChatId: rawStore.telegramChatId ?? null,
        telegramUsername: rawStore.telegramUsername ?? null,
        country: rawStore.country,
        city: rawStore.city ?? 'Cairo',
        address: rawStore.address ?? '123 Cairo St',
        currency: rawStore.currency,
        paymentGateway: rawStore.paymentGateway,
        verifiedBy: rawStore.verifiedBy ?? null,
        verifiedAt: rawStore.verifiedAt ?? null,
        deletedBy: rawStore.deletedBy ?? null,
        deletedAt: rawStore.deletedAt ?? null,
        deletionReason: rawStore.deletionReason ?? null,
        theme,
        settings: {
          ...rawSettings,
          theme: typeof rawSettings.theme === 'string' ? rawSettings.theme : 'default',
        },
        templateVersion: rawStore.templateVersion,
        cloudinaryAccountIndex: rawStore.cloudinaryAccountIndex ?? null,
        isActive: rawStore.isActive,
        isVerified: rawStore.isVerified,
        isFeatured: rawStore.isFeatured,
        createdAt: rawStore.createdAt,
        updatedAt: rawStore.updatedAt,
      };
    },
    env,
    'store-info',
    ctx
  );
}

async function fetchStoreCategories(
  storeId: string,
  env: Env,
  cacheTag?: string,
  ctx?: ExecutionContext
): Promise<Category[]> {
  return getCachedData(
    `store-categories:${storeId}`,
    60,
    async () => {
      const db = getDb(env);
      return await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.storeId, storeId),
            eq(categories.isActive, true),
            isNull(categories.deletedAt)
          )
        )
        .all();
    },
    env,
    cacheTag,
    ctx
  );
}

function mapRawProducts(dbProducts: InferSelectModel<typeof products>[]): Product[] {
  return dbProducts.map((p) => {
    let imageUrls: string[] = [];

    if (p.images) {
      if (Array.isArray(p.images)) {
        imageUrls = p.images
          .map((img: unknown) => {
            if (typeof img === 'string') return img;
            if (img && typeof img === 'object' && 'url' in img && typeof (img as { url: unknown }).url === 'string') {
              return (img as { url: string }).url;
            }
            return '';
          })
          .filter(Boolean);
      } else if (typeof p.images === 'string') {
        try {
          const parsedImages = JSON.parse(p.images) as (string | { url: string })[];
          if (Array.isArray(parsedImages)) {
            imageUrls = parsedImages
              .map((img) => (typeof img === 'string' ? img : img.url))
              .filter(Boolean);
          }
        } catch {
          imageUrls = [];
        }
      }
    }

    const mainImage = p.imageSrc || (imageUrls.length > 0 ? imageUrls[0] : '/images/default-product.png');

    return {
      id: p.id,
      storeId: p.storeId,
      categoryId: p.categoryId ?? null,
      name: p.name,
      slug: p.slug,
      description: p.description ?? '',
      shortDescription: p.shortDescription ?? '',
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      mediaIds: p.mediaIds,
      videoUrl: p.videoUrl ?? null,
      imageSrc: p.imageSrc ?? null,
      variantPrices: (p.variantPrices ?? {}) as Record<string, unknown>,
      haggleEnabled: p.haggleEnabled,
      metadata: (p.metadata ?? {}) as ProductMetadata,
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      price: Number(p.price ?? 0),
      originalPrice: p.compareAtPrice ? Number(p.compareAtPrice) : undefined,
      cost: p.cost ? Number(p.cost) : undefined,
      minPrice: p.minPrice ? Number(p.minPrice) : undefined,
      image: mainImage,
      images: imageUrls,
      dimensions: {
        weight: p.weight ? Number(p.weight) : undefined,
        length: p.length ? Number(p.length) : undefined,
        width: p.width ? Number(p.width) : undefined,
        height: p.height ? Number(p.height) : undefined,
      },
      deletedAt: p.deletedAt ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });
}

async function fetchStoreProducts(
  storeId: string,
  env: Env,
  options?: { page?: number; limit?: number },
  cacheTag?: string,
  ctx?: ExecutionContext
): Promise<{ products: Product[]; featuredProducts: Product[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;

  return getCachedData(
    `store-products:${storeId}:${page}:${limit}`,
    60,
    async () => {
      const db = getDb(env);
      const offset = (page - 1) * limit;

      const dbProductsPromise = db
        .select()
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.isPublished, true),
            isNull(products.deletedAt)
          )
        )
        .limit(limit)
        .offset(offset)
        .all();

      const totalCountPromise = db
        .select({ count: count() })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.isPublished, true),
            isNull(products.deletedAt)
          )
        )
        .get();

      const dbFeaturedPromise = db
        .select()
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.isFeatured, true),
            eq(products.isPublished, true),
            isNull(products.deletedAt)
          )
        )
        .limit(8)
        .all();

      const [dbProducts, totalRes, dbFeatured] = await Promise.all([
        dbProductsPromise,
        totalCountPromise,
        dbFeaturedPromise,
      ]);

      return {
        products: mapRawProducts(dbProducts),
        featuredProducts: mapRawProducts(dbFeatured),
        total: totalRes?.count ?? 0,
      };
    },
    env,
    cacheTag,
    ctx
  );
}

/**
 * 🆕 جلب الـ Snapshot مباشرة عبر storeSlug دون الوصول لـ D1
 */
async function fetchSnapshotFromCacheBySlug(
  decodedSlug: string,
  env: Env
): Promise<{ data: RawStorePageData; version: number } | null> {
  const cacheKey = `snapshot:store-slug-${decodedSlug}`;
  const cachedResponse = await getFromCloudflareCache(cacheKey);

  if (!cachedResponse) return null;

  try {
    const data = (await cachedResponse.json()) as RawStorePageData & { version?: number };
    if (!data || !data.store) return null;

    return {
      data,
      version: data.version || Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 🔥 نقطة الدخول الرئيسية لجلب بيانات المتجر
 * - أولاً: محاولة جلب الـ Snapshot مباشرة بواسطة decodedSlug (0 D1 Reads)
 * - ثانياً: إذا لم يتواجد الـ Snapshot وكانت طلبات خاصة (Pagination)، أو عند الـ Cache Miss فقط يتم استدعاء D1
 */
export async function getStoreRawData(
  storeSlug: string,
  env: Env,
  options?: { page?: number; limit?: number },
  ctx?: ExecutionContext
): Promise<RawStorePageData | null> {
  if (!storeSlug || typeof storeSlug !== 'string') {
    throw new Error('Invalid storeSlug');
  }

  const decodedSlug = decodeURIComponent(storeSlug);
  const page = options?.page || 1;
  const limit = options?.limit || 20;

  // 1️⃣ أداء حقيقي عالي: محاولة استرجاع الـ Snapshot المباشر باستخدام الـ Slug عند طلب الصفحة الأولى الافتراضية
  if (page === 1 && limit === 20) {
    const snapshot = await fetchSnapshotFromCacheBySlug(decodedSlug, env);
    if (snapshot) {
      // ✅ Cache Hit مباشر بدون استدعاء D1 مطلقاً
      return snapshot.data;
    }
  }

  // 2️⃣ Fallback / Cache Miss: جلب معلومات المتجر والبيانات الكاملة من D1
  const storeInfo = await fetchStoreInfo(decodedSlug, env, ctx);
  if (!storeInfo) return null;

  const cacheTag = `store-${storeInfo.id}`;

  const [categoriesData, productsData] = await Promise.all([
    fetchStoreCategories(storeInfo.id, env, cacheTag, ctx),
    fetchStoreProducts(storeInfo.id, env, options, cacheTag, ctx),
  ]);

  const result: RawStorePageData = {
    store: storeInfo,
    categories: categoriesData,
    featuredProducts: productsData.featuredProducts,
    filteredProducts: productsData.products,
    totalCount: productsData.total,
  };

  // 3️⃣ حفظ الـ Snapshot في الـ Cache لـ الصفحة الأولى الافتراضية بمفتاحي الـ ID والـ Slug
  if (page === 1 && limit === 20) {
    const version = Date.now();
    const snapshotPayload = { ...result, version };

    // تخزين الـ Snapshot بمفتاح الـ Slug للوصول السريع بدون قراءات D1
    await putInCloudflareCache(
      `snapshot:store-slug-${decodedSlug}`,
      snapshotPayload,
      60,
      cacheTag,
      ctx
    );

    // تخزين الـ Snapshot بمفتاح الـ ID لتوافق العمليات الأخرى
    await putInCloudflareCache(
      `snapshot:store-${storeInfo.id}`,
      snapshotPayload,
      60,
      cacheTag,
      ctx
    );
  }

  return result;
}

export async function getProductData(
  storeId: string,
  slug: string,
  env: Env,
  ctx?: ExecutionContext
): Promise<Product | null> {
  if (!storeId || !slug) {
    throw new Error('[getProductData] storeId and slug are required');
  }

  const decodedProductSlug = decodeURIComponent(slug);
  const cacheTag = `store-${storeId}`;

  return getCachedData(
    `product-data:${storeId}:${decodedProductSlug}`,
    60,
    async () => {
      const db = getDb(env);
      const p = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.slug, decodedProductSlug),
            eq(products.isPublished, true),
            isNull(products.deletedAt)
          )
        )
        .get();

      if (!p) return null;
      return mapRawProducts([p])[0];
    },
    env,
    cacheTag,
    ctx
  );
}

export async function getStoreInfoData(
  storeSlug: string,
  env: Env,
  ctx?: ExecutionContext
): Promise<Store | null> {
  if (!storeSlug || typeof storeSlug !== 'string') {
    throw new Error('Invalid storeSlug');
  }
  return await fetchStoreInfo(storeSlug, env, ctx);
}