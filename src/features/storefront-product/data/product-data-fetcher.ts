// src/features/storefront-product/data/product-data-fetcher.ts

import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { products } from '@/lib/db/schema';
import type { ProductImage, ProductMetadata } from '@/lib/db/schema/products';
import type { Product } from '@/types';
import type { Env } from '@/lib/env';
import type { InferSelectModel } from 'drizzle-orm';
import { Redis } from '@upstash/redis';

// ============================================================
// 🛠️ Database Connection
// ============================================================

function getDb(env: Env) {
  if (!env.DB) throw new Error('D1 Database binding not available');
  return drizzle(env.DB);
}

// ============================================================
// 📦 Redis Client
// ============================================================

function getRedis(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ============================================================
// 🌐 Cloudflare Cache Helpers
// ============================================================

async function getFromCloudflareCache(cacheKey: string): Promise<Response | null> {
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache
    ? (globalCache as unknown as { default: Cache }).default
    : null;

  if (!cache) return null;

  const dummyUrl = `https://product-cache.internal/${encodeURIComponent(cacheKey)}`;
  try {
    const match = await cache.match(dummyUrl);
    return match ?? null;
  } catch {
    return null;
  }
}

async function putInCloudflareCache(cacheKey: string, data: unknown, ttlSeconds: number): Promise<void> {
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache
    ? (globalCache as unknown as { default: Cache }).default
    : null;

  if (!cache) return;

  const dummyUrl = `https://product-cache.internal/${encodeURIComponent(cacheKey)}`;
  try {
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}, stale-while-revalidate=300`,
      },
    });

    const waitUntil = (globalThis as Record<string, unknown>).waitUntil;
    if (typeof waitUntil === 'function') {
      (waitUntil as (p: Promise<unknown>) => void)(cache.put(dummyUrl, response));
    } else {
      await cache.put(dummyUrl, response);
    }
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown cache error';
    console.warn('⚠️ Product cache put failed:', errorMsg);
  }
}

// ============================================================
// 🔒 Redis Lock Helpers
// ============================================================

async function acquireRedisLock(redis: Redis, lockKey: string, ttlSeconds: number): Promise<boolean> {
  try {
    const result = await redis.set(lockKey, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Failed to acquire Redis lock for key ${lockKey}:`, errorMsg);
    return false;
  }
}

async function releaseRedisLock(redis: Redis, lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Failed to release Redis lock for key ${lockKey}:`, errorMsg);
  }
}

// ============================================================
// ⚡ Cache Stampede Protection
// ============================================================

const inflightPromises = new Map<string, Promise<unknown>>();
const LOCK_TTL_SECONDS = 5;
const CACHE_TTL_SECONDS = 60; // 1 دقيقة للمنتجات

/**
 * ⚡ Helper لتفعيل Cloudflare Cache API مع حماية من Cache Stampede
 */
async function getCachedData<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  env: Env
): Promise<T> {
  // 1️⃣ محاولة الجلب من Cloudflare Cache
  const cachedResponse = await getFromCloudflareCache(cacheKey);
  if (cachedResponse) {
    try {
      return (await cachedResponse.json()) as T;
    } catch {
      // نكمل لو فشل الـ Parse
    }
  }

  // 2️⃣ حماية Single-Worker Deduplication (in-memory)
  if (inflightPromises.has(cacheKey)) {
    return (await inflightPromises.get(cacheKey)) as T;
  }

  // 3️⃣ محاولة الحصول على Redis Lock (Multi-Worker)
  const redis = getRedis(env);
  const lockKey = `lock:product-cache:${cacheKey}`;
  let lockAcquired = false;

  if (redis) {
    lockAcquired = await acquireRedisLock(redis, lockKey, LOCK_TTL_SECONDS);
  }

  // 4️⃣ لو مفيش Lock، ننتظر ونحاول تاني
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
          // نكمل لو فشل الـ Parse
        }
      }
    }
  }

  // 5️⃣ تنفيذ الـ fetch (من D1)
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

// ============================================================
// 🎨 Map Raw Products Helper
// ============================================================

function safeNumber(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}

/**
 * ✅ تحويل بيانات المنتجات الخام من D1 إلى Types نظيفة
 */
export function mapRawProducts(dbProducts: InferSelectModel<typeof products>[]): Product[] {
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
      price: safeNumber(p.price) ?? 0,
      originalPrice: safeNumber(p.compareAtPrice),
      cost: safeNumber(p.cost),
      minPrice: safeNumber(p.minPrice),
      image: mainImage,
      images: imageUrls,
      dimensions: {
        weight: safeNumber(p.weight),
        length: safeNumber(p.length),
        width: safeNumber(p.width),
        height: safeNumber(p.height),
      },
      deletedAt: p.deletedAt ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });
}

// ============================================================
// 📦 Public Data Fetchers (With Caching)
// ============================================================

/**
 * 🛒 جلب بيانات منتج واحد مع Caching
 */
export async function getProductData(
  storeId: string,
  slug: string,
  env: Env
): Promise<Product | null> {
  if (!storeId || !slug) {
    throw new Error('[getProductData] storeId and slug are required');
  }

  const decodedSlug = decodeURIComponent(slug);
  const cacheKey = `product:${storeId}:${decodedSlug}`;

  return getCachedData(cacheKey, CACHE_TTL_SECONDS, async () => {
    const db = getDb(env);

    const p = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.slug, decodedSlug),
          eq(products.isPublished, true),
          isNull(products.deletedAt)
        )
      )
      .get();

    if (!p) return null;
    return mapRawProducts([p])[0];
  }, env);
}

/**
 * 🔗 جلب المنتجات المرتبطة مع Caching
 */
export async function getRelatedProductsData(
  storeId: string,
  categoryId: string | null,
  currentProductId: string,
  env: Env,
  limit: number = 4
): Promise<Product[]> {
  const cacheKey = `related-products:${storeId}:${categoryId || 'all'}:${currentProductId}:${limit}`;

  return getCachedData(cacheKey, CACHE_TTL_SECONDS, async () => {
    const db = getDb(env);

    const conditions = [
      eq(products.storeId, storeId),
      ne(products.id, currentProductId),
      eq(products.isPublished, true),
      isNull(products.deletedAt),
    ];

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    const dbProducts = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(limit)
      .all();

    return mapRawProducts(dbProducts);
  }, env);
}

// ============================================================
// 🧹 Cache Invalidation
// ============================================================

/**
 * 🧹 مسح كاش منتج محدد من Cloudflare و Redis
 */
export async function clearProductCache(
  storeId: string,
  productSlug: string,
  env: Env
): Promise<void> {
  const cacheKey = `product:${storeId}:${productSlug}`;
  
  // 1. مسح الـ Cloudflare Cache المحلي إن وجد
  const globalCache = typeof caches !== 'undefined' ? caches : undefined;
  const cache = globalCache && 'default' in globalCache
    ? (globalCache as unknown as { default: Cache }).default
    : null;

  if (cache) {
    const dummyUrl = `https://product-cache.internal/${encodeURIComponent(cacheKey)}`;
    try {
      await cache.delete(dummyUrl);
    } catch (e: unknown) {
      console.warn('⚠️ Failed to delete Cloudflare cache:', e);
    }
  }

  // 2. مسح Redis Locks/Keys
  const redis = getRedis(env);
  if (!redis) return;

  try {
    await redis.del(`lock:product-cache:${cacheKey}`);
  } catch (error: unknown) {
    console.warn('⚠️ Failed to clear product cache lock in Redis:', error);
  }
}

/**
 * 🧹 مسح كاش المنتجات المرتبطة
 */
export async function clearRelatedProductsCache(
  storeId: string,
  env: Env
): Promise<void> {
  const redis = getRedis(env);
  if (!redis) return;

  try {
    const keys = await redis.keys(`lock:product-cache:related-products:${storeId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error: unknown) {
    console.warn('⚠️ Failed to clear related products cache in Redis:', error);
  }
}