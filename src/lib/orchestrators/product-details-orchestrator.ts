// src/lib/orchestrators/product-details-orchestrator.ts

import { getStoreRawData, getProductData } from '@/lib/data/store-data-fetcher';
import { adaptProductDetailPage } from '@/lib/adapters/product-detail-page.adapter';
import type { ProductDetailPagePayload } from '@/lib/adapters/product-detail-page.adapter';
import type { Env } from '@/lib/env'; // ✅ استيراد النوع

// ============================================================
// 🧠 أوركسترا صفحة تفاصيل المنتج (The Maestro)
// ============================================================

export const ProductDetailsOrchestrator = {
  /**
   * ✅ يجلب البيانات الخام من الـ Fetchers المكّشة المتاحة فعلياً ويقوم بعمل الـ Adapt
   * @param storeSlug - المعرف الفريد للمتجر
   * @param productSlug - المعرف الفريد للمنتج
   * @param userCurrency - العملة الحالية (ديناميكية)
   * @param env - بيئة الـ Worker (تحتوي على DB)
   */
  async fetchDetailPagePayload(
    storeSlug: string,
    productSlug: string,
    userCurrency: string = 'EGP',
    env: Env // ✅ إضافة env كمعامل
  ): Promise<ProductDetailPagePayload | null> {
    try {
      // 1️⃣ جلب بيانات المتجر (باستخدام الدالة المتاحة والمكّشة عندك فعلياً)
      // ✅ تمرير env
      const storeData = await getStoreRawData(storeSlug, env, { page: 1, limit: 1 });
      
      if (!storeData || !storeData.store) {
        return null;
      }

      const store = storeData.store;

      // 2️⃣ جلب بيانات المنتج بشكل آمن باستدعاء الدالة المصدّرة والمكّشة getProductData
      // ✅ تمرير env
      const product = await getProductData(store.id, productSlug, env);

      if (!product) {
        return null;
      }

      // 3️⃣ تمرير البيانات الخام المسترجعة للأدابتر المجمع لتجهيز الـ Payload النظيف للـ UI
      return adaptProductDetailPage(
        {
          store,
          product,
        },
        userCurrency
      );
    } catch (error) {
      console.error(
        `[ProductDetailsOrchestrator] Error fetching payload for store: ${storeSlug}, product: ${productSlug}`,
        error
      );
      return null;
    }
  },
};