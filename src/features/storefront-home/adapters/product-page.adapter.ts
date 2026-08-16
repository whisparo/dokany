// src/features/storefront-home/adapters/product-page.adapter

import type { Store, Product, Category } from '@/types';
import { adaptProductGrid } from '@/components/shared/ProductGrid/ProductGrid.adapter';
import { adaptHero } from '@/features/storefront-home/components/Hero/Hero.adapter';
import type {
  ProductGridAdapterResult,
  ProductGridAdapterOptions,
} from '@/components/shared/ProductGrid/ProductGrid.adapter';
import type { HeroAdapterResult } from '@/features/storefront-home/components/Hero/Hero.adapter';

// ============================================================
// 📦 الأنواع الموحدة والصارمة
// ============================================================

export interface ProductPagePayload {
  store: Store;
  hero: HeroAdapterResult;
  categories: Category[];
  featuredProductsGrid: ProductGridAdapterResult;
  productGrid: ProductGridAdapterResult;
}

export interface RawStorePageData {
  store: Store;
  categories?: Category[];
  featuredProducts?: Product[];
  filteredProducts: Product[];
  totalCount: number;
}

// ============================================================
// 🧠 الـ Adapter الرئيسي
// ============================================================

export function adaptProductPage(
  rawData: RawStorePageData,
  userCurrency: string,
  gridOptions: Omit<ProductGridAdapterOptions, 'totalCountFromDB'> = { page: 1, limit: 20 }
): ProductPagePayload {
  const { store, categories = [], featuredProducts = [], filteredProducts, totalCount } = rawData;

  // Validation
  if (!store || !store.id || !store.name) {
    throw new Error('[ProductPageAdapter] Invalid store data: missing required fields');
  }

  // 1. Hero Adapter
  const hero = adaptHero(store);

  // 2. Featured Products Grid Adapter
  const featuredProductsGrid = adaptProductGrid(
    featuredProducts,
    userCurrency,
    {
      page: 1,
      limit: featuredProducts.length,
      totalCountFromDB: featuredProducts.length,
    }
  );

  // 3. Main Product Grid Adapter
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
    categories,
    featuredProductsGrid,
    productGrid,
  };
}