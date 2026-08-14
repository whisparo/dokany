// src/features/storefront-home/data/store-data-fetcher.ts

import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, count } from 'drizzle-orm';
import { stores, products, categories } from '@/lib/db/schema';
import type { Category } from '@/lib/db/schema/categories';
import type { ProductImage, ProductMetadata } from '@/lib/db/schema/products';
import type { Store, Product } from '@/types';
import type { RawStorePageData } from '@/features/storefront-home/adapters/product-page.adapter';
import type { Env } from '@/lib/env';
import type { InferSelectModel } from 'drizzle-orm';
import { Redis } from '@upstash/redis';

function getDb(env: Env) {
  if (!env.DB) throw new Error('D1 Database binding not available');
  return drizzle(env.DB);
}

/**
 * ✅ إنشاء عميل Redis مع fallback آمن
 */
function getRedis(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * ✅ الحصول على قيمة من Cloudflare Cache
 */
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

/**
 * ✅ تخزين قيمة في Cloudflare Cache
 */
async function putInCloudflareCache(cacheKey: string, data: unknown, ttlSeconds: number): Promise<void> {
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache 
    ? (globalCache as unknown as { default: Cache }).default 
    : null;

  if (!cache) return;

  const dummyUrl = `https://store-cache.internal/${cacheKey}`;
  try {
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}, stale-while-revalidate=600`,
      },
    });

    const waitUntil = (globalThis as Record<string, unknown>).waitUntil;
    if (typeof waitUntil === 'function') {
      (waitUntil as (p: Promise<unknown>) => void)(cache.put(dummyUrl, response));
    } else {
      await cache.put(dummyUrl, response);
    }
  } catch (e) {
    console.warn('⚠️ Cache put failed:', e);
  }
}

/**
 * ✅ الحصول على Lock من Redis (SETNX)
 */
async function acquireRedisLock(redis: Redis, lockKey: string, ttlSeconds: number): Promise<boolean> {
  try {
    const result = await redis.set(lockKey, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (error) {
    console.warn(`⚠️ Failed to acquire Redis lock for key ${lockKey}:`, error);
    return false;
  }
}

/**
 * ✅ تحرير Lock من Redis
 */
async function releaseRedisLock(redis: Redis, lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey);
  } catch (error) {
    console.warn(`⚠️ Failed to release Redis lock for key ${lockKey}:`, error);
  }
}

// 🔒 Lock / Deduplication Map لمنع مشكلة الـ Cache Stampede على مستوى الـ Worker Isolate
const inflightPromises = new Map<string, Promise<unknown>>();

// ⏱️ مدة انتظار القفل (بالثواني)
const LOCK_TTL_SECONDS = 5;

/**
 * ⚡ Helper لتفعيل Cloudflare Cache API مع حماية من Cache Stampede
 */
async function getCachedData<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  env: Env
): Promise<T> {
  // 1️⃣ محاولة جلب البيانات من Cloudflare Cache
  const cachedResponse = await getFromCloudflareCache(cacheKey);
  if (cachedResponse) {
    try {
      return (await cachedResponse.json()) as T;
    } catch {
      // نكمل إذا فشل الـ Parse
    }
  }

  // 2️⃣ حماية الـ Cache Stampede: Single-Worker Lock (in-memory)
  if (inflightPromises.has(cacheKey)) {
    return (await inflightPromises.get(cacheKey)) as T;
  }

  // 3️⃣ محاولة الحصول على Redis Lock (Multi-Worker)
  const redis = getRedis(env);
  const lockKey = `lock:cache:${cacheKey}`;
  let lockAcquired = false;

  if (redis) {
    lockAcquired = await acquireRedisLock(redis, lockKey, LOCK_TTL_SECONDS);
  }

  // 4️⃣ إذا لم نحصل على القفل، ننتظر قليلاً ثم نحاول قراءة الـ Cache مرة أخرى
  if (!lockAcquired && redis) {
    console.log(`⏳ Waiting for lock on ${cacheKey}...`);

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

    console.log(`⏰ Lock wait timed out for ${cacheKey}, proceeding with D1 query...`);
  }

  // 5️⃣ تنفيذ الـ fetch (جلب البيانات من D1)
  const fetchPromise = (async (): Promise<T> => {
    try {
      const freshData = await fetchFn();

      if (freshData !== null && freshData !== undefined) {
        await putInCloudflareCache(cacheKey, freshData, ttlSeconds);
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
// 📌 دوال جلب البيانات الأساسية (مع Cache)
// ============================================

export async function fetchStoreInfo(storeSlug: string, env: Env): Promise<Store | null> {
  const decodedSlug = decodeURIComponent(storeSlug);

  return getCachedData(`store-info:${decodedSlug}`, 60, async () => {
    const db = getDb(env);
    const rawStore = await db
      .select()
      .from(stores)
      .where(eq(stores.slug, decodedSlug))
      .get();

    if (!rawStore) return null;

    const theme = rawStore.theme && typeof rawStore.theme === 'object' 
      ? rawStore.theme 
      : {};

    const rawSettings = (rawStore.settings && typeof rawStore.settings === 'object'
      ? rawStore.settings
      : {}) as Record<string, unknown>;

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
  }, env);
}

async function fetchStoreCategories(storeId: string, env: Env): Promise<Category[]> {
  return getCachedData(`store-categories:${storeId}`, 60, async () => {
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
  }, env);
}

/**
 * ✅ تحويل بيانات المنتجات الخام من D1 إلى Types نظيفة
 */
function mapRawProducts(dbProducts: InferSelectModel<typeof products>[]): Product[] {
  return dbProducts.map((p) => {
    let imageUrls: string[] = [];

    if (p.images) {
      if (Array.isArray(p.images)) {
        imageUrls = p.images.map((img: ProductImage) => 
          typeof img === 'string' ? img : img.url
        );
      } else if (typeof p.images === 'string') {
        try {
          const parsedImages = JSON.parse(p.images) as ProductImage[];
          if (Array.isArray(parsedImages)) {
            imageUrls = parsedImages.map((img: ProductImage) => 
              typeof img === 'string' ? img : img.url
            );
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
      variantPrices: p.variantPrices ?? {},
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
  options?: { page?: number; limit?: number }
): Promise<{ products: Product[]; featuredProducts: Product[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;

  return getCachedData(`store-products:${storeId}:${page}:${limit}`, 60, async () => {
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
  }, env);
}

export async function getStoreRawData(
  storeSlug: string,
  env: Env,
  options?: { page?: number; limit?: number }
): Promise<RawStorePageData | null> {
  if (!storeSlug || typeof storeSlug !== 'string') {
    throw new Error('Invalid storeSlug');
  }

  const store = await fetchStoreInfo(storeSlug, env);
  if (!store) return null;

  const [categoriesData, productsData] = await Promise.all([
    fetchStoreCategories(store.id, env),
    fetchStoreProducts(store.id, env, options),
  ]);

  return {
    store,
    categories: categoriesData,
    featuredProducts: productsData.featuredProducts,
    filteredProducts: productsData.products,
    totalCount: productsData.total,
  };
}

export async function getProductData(
  storeId: string,
  slug: string,
  env: Env
): Promise<Product | null> {
  if (!storeId || !slug) {
    throw new Error('[getProductData] storeId and slug are required');
  }

  const decodedProductSlug = decodeURIComponent(slug);

  return getCachedData(`product-data:${storeId}:${decodedProductSlug}`, 60, async () => {
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
  }, env);
}

export async function getStoreInfoData(
  storeSlug: string,
  env: Env
): Promise<Store | null> {
  if (!storeSlug || typeof storeSlug !== 'string') {
    throw new Error('Invalid storeSlug');
  }
  return await fetchStoreInfo(storeSlug, env);
}