// src/lib/orchestrators/product-details-orchestrator.ts

import { fetchStoreInfo } from '@/lib/services/store.service';
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
      // 1️⃣ جلب بيانات المتجر
      const store = await fetchStoreInfo(storeSlug, env);
      if (!store) return null;

      // 2️⃣ جلب بيانات المنتج
      const product = await getProductData(store.id, productSlug, env);
      if (!product) return null;

      // 3️⃣ جلب المنتجات ذات الصلة مع تحويل undefined إلى null
      const relatedProducts = await getRelatedProductsData(
        store.id,
        product.categoryId ?? null, // ✅ تحويل undefined إلى null لحل خطأ TypeScript
        product.id,
        env
      ).catch(() => []);

      // 4️⃣ الـ Adapt والـ Return
      return adaptProductDetailPage(
        {
          store,
          product,
          relatedProducts,
        },
        userCurrency
      );
    } catch (error) {
      console.error(`[ProductDetailsOrchestrator] Error: ${storeSlug}/${productSlug}`, error);
      return null;
    }
  },
};