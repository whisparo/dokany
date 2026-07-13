// src/lib/data/store-data-fetcher.ts

import { unstable_cache } from 'next/cache';
import type { Store, Product } from '@/types';
import type { RawStorePageData } from '@/lib/adapters/product-page.adapter';

// ============================================================
// 🗄️ دوال جلب البيانات
// ============================================================

async function fetchStoreInfo(storeSlug: string): Promise<Store | null> {
  // TODO: استبدال بـ D1 الفعلي
  return {
    id: 'store-1',
    name: `متجر ${storeSlug}`,
    slug: storeSlug,
    description: 'أفضل المتاجر للمنتجات المميزة',
    bannerImage: '/images/default-banner.png',
  };
}

async function fetchStoreProducts(
  storeId: string, 
  options?: { page?: number; limit?: number }
): Promise<{ products: Product[]; total: number }> {
  // TODO: استبدال بـ D1 الفعلي
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  
  const now = new Date().toISOString();
  const allProducts: Product[] = [
    {
      id: '1',
      storeId,
      name: 'منتج 1',
      slug: 'product-1',
      description: 'وصف المنتج الأول',
      price: 10000,
      stock: 10,
      image: 'https://images.unsplash.com/photo-1589465885857-44edb59bbff2?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '2',
      storeId,
      name: 'منتج 2',
      slug: 'product-2',
      description: 'وصف المنتج الثاني',
      price: 20000,
      stock: 5,
      image: 'https://plus.unsplash.com/premium_photo-1675186049419-d48f4b28fe7c?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '3',
      storeId,
      name: 'منتج 3',
      slug: 'product-3',
      description: 'وصف المنتج الثالث',
      price: 30000,
      stock: 0,
      image: 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?q=80&w=765&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
  ];
  
  const start = (page - 1) * limit;
  const end = start + limit;
  const products = allProducts.slice(start, end);
  
  return {
    products,
    total: allProducts.length,
  };
}

// ============================================================
// 🧠 Data Fetcher مع Cache
// ============================================================

export const getStoreRawData = unstable_cache(
  async (
    storeSlug: string, 
    options?: { page?: number; limit?: number }
  ): Promise<RawStorePageData | null> => {
    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new Error('Invalid storeSlug');
    }
    
    const store = await fetchStoreInfo(storeSlug);
    if (!store) return null;
    
    const { products, total } = await fetchStoreProducts(store.id, options);
    
    return {
      store,
      filteredProducts: products,
      totalCount: total,
    };
  },
  ['store-raw-data'],
  {
    revalidate: 60,
    tags: ['store-data'],
  }
);