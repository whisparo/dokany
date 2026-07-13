// src/lib/orchestrators/storefront-orchestrator.ts

import { getStoreRawData } from '@/lib/data/store-data-fetcher';
import { adaptProductPage } from '@/lib/adapters/product-page.adapter';
import { adaptHeader, type HeaderAdapterResult } from '@/components/storefront/Header/Header.adapter';
import { adaptFooter, type FooterAdapterResult } from '@/components/storefront/Footer/Footer.adapter';
import { notFound } from 'next/navigation';

// 🔥 العقد الموحد والوحيد لبيانات الواجهة كاملة (Strongly Typed Portfolio)
export interface StorefrontPayload {
  storeInfo: {
    name: string;
    slug: string;
  };
  header: HeaderAdapterResult; // 👈 إضافة نوع الهيدر المصفى صراحة
  hero: any;                   // داتا الهيرو النظيفة الخارجة من الـ Hero.adapter
  productGrid: any;            // داتا الجريد النظيفة الخارجة من الـ ProductGrid.adapter
  footer: FooterAdapterResult; // 👈 إضافة نوع الفوتر المصفى صراحة
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
    options: OrchestratorOptions = {}
  ): Promise<StorefrontPayload> {
    
    // 1. فك وتأمين البارامترات وضبط الافتراضيات هندسياً لمنع انهيار الـ DB
    const currentPage = Math.max(1, parseInt(options.page || '1', 10));
    const userCurrency = options.currency || 'EGP';
    
    const validSorts = ['price_asc', 'price_desc', 'rating', 'newest', 'name'];
    const currentSort = validSorts.includes(options.sort || '') 
      ? options.sort! 
      : 'newest';

    const gridOptions = {
      page: currentPage,
      limit: 20,
      sortBy: currentSort,
    };

    try {
      // 2. سحب البيانات الخام مركزياً عبر الكاش الديناميكي لـ D1
      const rawData = await getStoreRawData(storeSlug, gridOptions);
      
      // حماية السيستم في حال عدم وجود المتجر
      if (!rawData || !rawData.store) {
        notFound();
      }

      // 3. نداء الأدابترز السيادية لتوزيع وتوجيه البيانات بالملي (تم تنظيف الـ Arguments)
      const adaptedPage = adaptProductPage(rawData, userCurrency); 
      const adaptedHeader = adaptHeader(rawData.store);
      const adaptedFooter = adaptFooter(rawData.store);

      // 4. تجميع وترجيع الـ Payload النهائي النقي المستقر المتكامل مع الـ Layout
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

    } catch (error) {
      console.error('[StorefrontOrchestrator] Critical Orchestration Failure:', error);
      notFound();
    }
  }
};