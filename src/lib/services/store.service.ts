// src/lib/services/store.service.ts

import { eq } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import { getDb, schema } from '@/lib/db';
import type { Store } from '@/types';
import type { Env } from '@/lib/env';
import { SystemError } from '@/lib/errors';

const STORE_CACHE_TTL_SECONDS = 300; // 5 دقائق

// ============================================================
// 📦 Cache للـ Redis Client لتحسين الأداء
// ============================================================
let cachedRedis: Redis | null = null;
let cachedEnvSignature: string | null = null;

/**
 * 🛠️ الحصول على Redis client مع caching
 */
function getRedisClient(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const envSignature = `${env.UPSTASH_REDIS_REST_URL}:${env.UPSTASH_REDIS_REST_TOKEN}`;

  if (cachedRedis && cachedEnvSignature === envSignature) {
    return cachedRedis;
  }

  cachedRedis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  cachedEnvSignature = envSignature;

  return cachedRedis;
}

// ============================================================
// 🗄️ الدالة الأساسية لجلب بيانات المتجر مباشرة من قاعدة البيانات D1
// ============================================================
export async function fetchStoreInfoFromDb(storeSlug: string, env: Env): Promise<Store | null> {
  if (!storeSlug || typeof storeSlug !== 'string') {
    throw new SystemError({
      code: 'STR_400',
      userMessage: 'بيانات المتجر المطلوبة غير صالحة.',
      category: 'validation',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
      technicalMessage: 'FETCH_STORE_INFO_FAILED: Invalid or empty storeSlug provided.',
      metadata: { storeSlug }
    });
  }

  try {
    const decodedSlug = decodeURIComponent(storeSlug);
    const db = getDb(env);

    const rawStore = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, decodedSlug))
      .get();

    if (!rawStore) return null;

    // ✅ بعد إضافة { mode: 'json' } في Schema، rawStore.theme و rawStore.settings
    // أصبحا كائنات جاهزة للاستخدام مباشرة
    const theme = rawStore.theme && typeof rawStore.theme === 'object'
      ? rawStore.theme
      : {};

    const settings = rawStore.settings && typeof rawStore.settings === 'object'
      ? (rawStore.settings as Record<string, unknown>)
      : {};

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
      settings: { ...settings, theme: (settings.theme as string) ?? 'default' },
      templateVersion: rawStore.templateVersion,
      cloudinaryAccountIndex: rawStore.cloudinaryAccountIndex ?? null,
      isActive: rawStore.isActive,
      isVerified: rawStore.isVerified,
      isFeatured: rawStore.isFeatured,
      createdAt: rawStore.createdAt,
      updatedAt: rawStore.updatedAt,
    } as Store;
  } catch (error: unknown) {
    if (error instanceof SystemError) throw error;

    throw new SystemError({
      code: 'STR_500',
      userMessage: 'حدث خطأ أثناء جلب بيانات المتجر، يرجى المحاولة لاحقاً.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage: `FETCH_STORE_INFO_DATABASE_ERROR: Failed to query store with slug ${storeSlug}.`,
      cause: error,
      metadata: { storeSlug, originalError: error instanceof Error ? error.message : String(error) }
    });
  }
}

// ============================================================
// ⚡ Cache-Aside Pattern لجلب بيانات المتجر باستخدام Redis أولاً ثم D1
// ============================================================
export async function getStoreInfoData(storeSlug: string, env: Env): Promise<Store | null> {
  const cacheKey = `cache:store:${storeSlug}`;

  const redis = getRedisClient(env);
  
  if (redis) {
    try {
      const cachedStore = await redis.get<Store>(cacheKey);
      if (cachedStore) {
        return cachedStore;
      }

      const storeData = await fetchStoreInfoFromDb(storeSlug, env);

      if (storeData) {
        // ✅ تمرير الكائن مباشرة لـ Upstash Redis بدون JSON.stringify لمنع الـ Double-Serialization
        await redis.set(cacheKey, storeData, { ex: STORE_CACHE_TTL_SECONDS });
      }

      return storeData;
    } catch (cacheError: unknown) {
      console.warn('⚠️ Cache fetch failed, falling back directly to D1:', 
        cacheError instanceof Error ? cacheError.message : 'Unknown cache error'
      );
    }
  }

  return fetchStoreInfoFromDb(storeSlug, env);
}

// ============================================================
// 🧹 Cache Invalidation
// ============================================================
export async function clearStoreCache(storeSlug: string, env: Env): Promise<void> {
  const cacheKey = `cache:store:${storeSlug}`;
  const redis = getRedisClient(env);

  if (!redis) return;

  try {
    await redis.del(cacheKey);
  } catch (error: unknown) {
    console.warn('⚠️ Failed to clear store cache:', 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function clearMultipleStoresCache(storeSlugs: string[], env: Env): Promise<void> {
  const redis = getRedisClient(env);
  if (!redis || storeSlugs.length === 0) return;

  try {
    const cacheKeys = storeSlugs.map(slug => `cache:store:${slug}`);
    await redis.del(...cacheKeys);
  } catch (error: unknown) {
    console.warn('⚠️ Failed to clear multiple stores cache:', 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}