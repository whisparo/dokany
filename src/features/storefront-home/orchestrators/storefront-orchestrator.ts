// src/features/storefront-home/orchestrators/storefront-orchestrator.ts

import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { adaptProductPage } from '@/features/storefront-home/adapters/product-page.adapter';
import { adaptHeader } from '@/features/storefront-home/components/Header/Header.adapter';
import { adaptFooter } from '@/features/storefront-home/components/Footer/Footer.adapter';
import { notFound } from 'next/navigation';
import type { Env } from '@/lib/env';

const RESERVED_SLUGS = new Set([
  'terms', 'privacy', 'about', 'contact', 'api', 'admin',
  'dashboard', 'login', 'register'
]);

export interface OrchestratorOptions {
  page?: string;
  sort?: string;
  currency?: string;
}

/**
 * ✅ دالة مساعدة شاملة للتحقق من أخطاء التنقل والتحويل في Next.js (Navigation Errors)
 */
function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false;
  }
  const digest = (error as { digest?: string }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}

export const StorefrontOrchestrator = {
  async fetchPagePayload(
    storeSlug: string,
    env: Env,
    options: OrchestratorOptions = {}
  ) {
    if (RESERVED_SLUGS.has(storeSlug.toLowerCase())) notFound();

    const currentPage = Math.max(1, parseInt(options.page || '1', 10));
    const userCurrency = options.currency || 'EGP';

    try {
      const rawData = await getStoreRawData(storeSlug, env, {
        page: currentPage,
        limit: 20
      });

      if (!rawData || !rawData.store) notFound();

      const adaptedPage = adaptProductPage(rawData, userCurrency);

      return {
        storeInfo: { name: rawData.store.name, slug: rawData.store.slug },
        header: adaptHeader(rawData.store),
        hero: adaptedPage.hero,
        categories: adaptedPage.categories,
        featuredProductsGrid: adaptedPage.featuredProductsGrid,
        productGrid: adaptedPage.productGrid,
        footer: adaptFooter(rawData.store),
      };
    } catch (error: unknown) {
      // ✅ إمرار أخطاء Next.js الخاصة بالـ Navigation (notFound / redirect) لتعمل بشكل طبيعي
      if (isNextNavigationError(error)) {
        throw error;
      }

      // ✅ تسجيل الخطأ مع حماية الخصوصية ومنع انهيار السيرفر
      console.error('[StorefrontOrchestrator] Failure:', {
        storeSlug,
        message: error instanceof Error ? error.message : String(error),
      });

      notFound();
    }
  }
};