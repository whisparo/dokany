// src/lib/services/store.service.ts

import { unstable_cache } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { Store } from '@/types';
import type { Env } from '@/lib/env';
import { SystemError } from '@/lib/errors/types';

export async function fetchStoreInfo(storeSlug: string, env: Env): Promise<Store | null> {
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
    const db = getDb(env as unknown as Parameters<typeof getDb>[0]);

    const rawStore = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, decodedSlug))
      .get();

    if (!rawStore) return null;

    let storeTheme;
    if (rawStore.theme) {
      try {
        storeTheme = typeof rawStore.theme === 'string' ? JSON.parse(rawStore.theme) : rawStore.theme;
      } catch (e) {
        console.error('❌ Failed to parse store theme JSON:', e);
      }
    }

    let storeSettings;
    if (rawStore.settings) {
      try {
        storeSettings = typeof rawStore.settings === 'string' ? JSON.parse(rawStore.settings) : rawStore.settings;
      } catch (e) {
        console.error('❌ Failed to parse store settings JSON:', e);
      }
    }

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
      theme: storeTheme,
      settings: storeSettings ?? {
        theme: 'default',
        colors: { primary: '#11CAA0' },
        layout: [],
      },
      templateVersion: rawStore.templateVersion,
      cloudinaryAccountIndex: rawStore.cloudinaryAccountIndex ?? null,
      isActive: rawStore.isActive,
      isVerified: rawStore.isVerified,
      isFeatured: rawStore.isFeatured,
      createdAt: rawStore.createdAt,
      updatedAt: rawStore.updatedAt,
    };
  } catch (error) {
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

export const getStoreInfoData = unstable_cache(
  async (storeSlug: string, env: Env): Promise<Store | null> => {
    return await fetchStoreInfo(storeSlug, env);
  },
  ['store-info-data'],
  { revalidate: 60, tags: ['store-data'] }
);