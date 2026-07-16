// src/lib/adapters/product-page.adapter.ts

import type { Store, Product } from '@/types';
import { adaptProductGrid } from '@/components/storefront/ProductGrid/ProductGrid.adapter';
import { adaptHero } from '@/components/storefront/Hero/Hero.adapter';
import type {
  ProductGridAdapterResult,
  ProductGridAdapterOptions,
} from '@/components/storefront/ProductGrid/ProductGrid.adapter';
import type { HeroAdapterResult } from '@/components/storefront/Hero/Hero.adapter';

// ============================================================
// 📦 الأنواع الموحدة والصارمة (No Any, Strongly Typed)
// ============================================================

export interface ProductPagePayload {
  store: Store;
  hero: HeroAdapterResult;
  productGrid: ProductGridAdapterResult;
}

export interface RawStorePageData {
  store: Store;
  filteredProducts: Product[];
  totalCount: number;
}

// ============================================================
// 🧠 الـ Adapter الرئيسي (Pure Function - No Side Effects)
// ============================================================

/**
 * ✅ يحول البيانات الخام القادمة من السيرفر إلى Payload نظيف ومقفل للـ UI
 * @param rawData - البيانات الخام (المتجر + المنتجات المفلترة + التوتال)
 * @param userCurrency - العملة الطائرة الملقوطة من التليجرام/URL
 * @param gridOptions - خيارات الصفحة الحالية (رقم الصفحة والـ limit)
 */
export function adaptProductPage(
  rawData: RawStorePageData,
  userCurrency: string,
  gridOptions: Omit<ProductGridAdapterOptions, 'totalCountFromDB'> = { page: 1, limit: 20 }
): ProductPagePayload {
  const { store, filteredProducts, totalCount } = rawData;

  // ✅ Validation صارم لمنع تمرير بيانات مشوهة
  if (!store || !store.id || !store.name) {
    throw new Error('[ProductPageAdapter] Invalid store data: missing required fields');
  }

  // ✅ تشغيل أدابتر الـ Hero
  const hero = adaptHero(store);

  // ✅ تشغيل أدابتر الـ Grid وتمرير العملة والتوتال بشكل متناسق 100%
  const productGrid = adaptProductGrid(
    filteredProducts,
    userCurrency,
    {
      page: gridOptions.page,
      limit: gridOptions.limit,
      totalCountFromDB: totalCount,
    }
  );

  return {
    store,
    hero,
    productGrid,
  };
}