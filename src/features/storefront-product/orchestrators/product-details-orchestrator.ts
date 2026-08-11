// src/features/storefront-product/orchestrators/product-details-orchestrator.ts
// 1️⃣ استيراد الاسم الصحيح للدالة
import { getStoreInfoData } from '@/lib/services/store.service';
import { getProductData, getRelatedProductsData } from '@/features/storefront-product/data/product-data-fetcher';
import { adaptProductDetailPage } from '@/features/storefront-product/adapters/product-detail-page.adapter';
import type { ProductDetailPagePayload } from '@/features/storefront-product/adapters/product-detail-page.adapter';
import type { Env } from '@/lib/env';

export const ProductDetailsOrchestrator = {
  async fetchDetailPagePayload(
    storeSlug: string,
    productSlug: string,
    userCurrency: string = 'EGP',
    env: Env
  ): Promise<ProductDetailPagePayload | null> {
    try {
      // 2️⃣ استخدام getStoreInfoData مع التمرير الصحيح لـ env
      const store = await getStoreInfoData(storeSlug, env);
      if (!store) return null;

      const product = await getProductData(store.id, productSlug, env);
      if (!product) return null;

      const relatedProducts = await getRelatedProductsData(
        store.id,
        product.categoryId ?? null,
        product.id,
        env
      ).catch(() => []);

      return adaptProductDetailPage(
        { store, product, relatedProducts },
        userCurrency
      );
    } catch (error) {
      console.error(`[ProductDetailsOrchestrator] Error: ${storeSlug}/${productSlug}`, error);
      return null;
    }
  },
};