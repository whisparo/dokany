// src/lib/orchestrators/storefront-orchestrator.ts

import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { adaptProductPage } from '@/features/storefront-home/adapters/product-page.adapter';
import { adaptHeader, type HeaderAdapterResult } from '@/features/storefront-home/components/Header/Header.adapter';
import { adaptFooter, type FooterAdapterResult } from '@/features/storefront-home/components/Footer/Footer.adapter';
import type { HeroAdapterResult } from '@/features/storefront-home/components/Hero/Hero.adapter';
import type { ProductGridAdapterResult } from '@/components/shared/ProductGrid/ProductGrid.adapter';
import { notFound } from 'next/navigation';
import type { Env } from '@/lib/env';

// 🛑 قائمة الكلمات المحجوزة التي لا يجب اعتبارها أسماء متاجر
const RESERVED_SLUGS = new Set([
  'terms',
  'privacy',
  'about',
  'contact',
  'api',
  'admin',
  'dashboard',
  'login',
  'register',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

// 🔥 العقد الموحد والوحيد لبيانات الواجهة كاملة (Strongly Typed Portfolio - Zero Any)
export interface StorefrontPayload {
  storeInfo: {
    name: string;
    slug: string;
  };
  header: HeaderAdapterResult;
  hero: HeroAdapterResult;
  productGrid: ProductGridAdapterResult;
  footer: FooterAdapterResult;
}

interface OrchestratorOptions {
  page?: string;
  sort?: string;
  currency?: string;
}

export const StorefrontOrchestrator = {
  /**
   * 🧠 المايسترو: يقود عملية جلب البيانات الخام وتحويلها بالملي عبر الأدابترز السيادية
   */
  async fetchPagePayload(
    storeSlug: string,
    env: Env,
    options: OrchestratorOptions = {}
  ): Promise<StorefrontPayload> {
    
    // 1. حارس البوابة الفوري لمنع استهلاك الباقة في طلبات الصفحات الثابتة
    if (RESERVED_SLUGS.has(storeSlug.toLowerCase())) {
      notFound();
    }

    // 2. فك وتأمين البارامترات وضبط الافتراضيات (تم تنظيف الترتيب المتروك مؤقتاً)
    const currentPage = Math.max(1, parseInt(options.page || '1', 10));
    const userCurrency = options.currency || 'EGP';

    const gridOptions = {
      page: currentPage,
      limit: 20,
    };

    try {
      // 3. سحب البيانات الخام مركزياً عبر D1
      const rawData = await getStoreRawData(storeSlug, env, gridOptions);
      
      // حماية السيستم في حال عدم وجود المتجر
      if (!rawData || !rawData.store) {
        notFound();
      }

      // 4. نداء الأدابترز السيادية
      const adaptedPage = adaptProductPage(rawData, userCurrency); 
      const adaptedHeader = adaptHeader(rawData.store);
      const adaptedFooter = adaptFooter(rawData.store);

      // 5. تجميع وترجيع الـ Payload النهائي
      return {
        storeInfo: {
          name: rawData.store.name,
          slug: rawData.store.slug,
        },
        header: adaptedHeader,
        hero: adaptedPage.hero,
        productGrid: adaptedPage.productGrid,
        footer: adaptedFooter,
      };

    } catch (error: any) {
      if (
        error?.message === 'NEXT_NOT_FOUND' || 
        error?.digest === 'NEXT_NOT_FOUND'
      ) {
        throw error;
      }

      console.error('[StorefrontOrchestrator] Critical Orchestration Failure:', error);
      notFound();
    }
  }
};