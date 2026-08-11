// src/features/storefront-home/orchestrators/storefront-orchestrator.ts

import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { adaptProductPage } from '@/features/storefront-home/adapters/product-page.adapter';
import { adaptHeader } from '@/features/storefront-home/components/Header/Header.adapter';
import { adaptFooter } from '@/features/storefront-home/components/Footer/Footer.adapter';
import { notFound } from 'next/navigation';
import type { Env } from '@/lib/env'; // ✅ إضافة import

const RESERVED_SLUGS = new Set([
  'terms', 'privacy', 'about', 'contact', 'api', 'admin', 
  'dashboard', 'login', 'register'
]);

export interface OrchestratorOptions {
  page?: string;
  sort?: string;
  currency?: string;
}

export const StorefrontOrchestrator = {
  // ✅ إضافة env: Env كـ parameter إجباري
  async fetchPagePayload(
    storeSlug: string,
    env: Env,
    options: OrchestratorOptions = {}
  ) {
    if (RESERVED_SLUGS.has(storeSlug.toLowerCase())) notFound();

    const currentPage = Math.max(1, parseInt(options.page || '1', 10));
    const userCurrency = options.currency || 'EGP';

    try {
      // ✅ تمرير env كـ argument تاني + options كـ argument تالت
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
    } catch (error: any) {
      if (error?.digest === 'NEXT_NOT_FOUND') throw error;
      console.error('[StorefrontOrchestrator] Failure:', error);
      notFound();
    }
  }
};