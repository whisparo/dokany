// src/components/storefront/ProductGrid/ProductGrid.adapter.ts

import type { Product } from '@/types';
import { adaptProductCard } from '../ProductCard/ProductCard.adapter';
import type { ProductCardAdapterResult } from '../ProductCard/ProductCard.adapter';

// ============================================================
// 📦 الأنواع الموحدة والصارمة (No Any, Standard Contracts)
// ============================================================

export interface ProductGridAdapterOptions {
  page?: number;
  limit?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'name';
  /** التوتال الحقيقي القادم مباشرة من COUNT قاعدة البيانات D1 */
  totalCountFromDB?: number;
}

export interface ProductGridAdapterResult {
  products: ProductCardAdapterResult[];
  count: number;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  totalPages: number;
}

// ============================================================
// 🧠 الـ Adapter الرئيسي (3 Arguments Explicit Contract)
// ============================================================

/**
 * ✅ يحول المنتجات المفلترة من قاعدة البيانات إلى Payload جاهز للـ Grid UI
 * * @param products - المنتجات الصافية القادمة من استعلام الـ DB
 * @param currency - العملة الطائرة الملقوطة من الـ URL لتمريرها للكروت
 * @param options - بيانات الـ Pagination المحسوبة من السيرفر
 */
export function adaptProductGrid(
  products: Product[],
  currency: string,
  options: ProductGridAdapterOptions = {}
): ProductGridAdapterResult {
  const {
    page = 1,
    limit = 20,
    totalCountFromDB,
  } = options;
  
  // 1. Adaptation (تحويل الكروت ونقل العملة الطائرة إلى الطابق السفلي)
  const adaptedProducts = safeAdaptProducts(products, currency);
  
  // 2. حساب الـ Metadata بناءً على الأرقام الحقيقية للداتا بيز
  const total = totalCountFromDB ?? adaptedProducts.length;
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;
  
  return {
    products: adaptedProducts,
    count: adaptedProducts.length,
    total,
    page,
    limit,
    hasMore,
    totalPages,
  };
}

// ============================================================
// 🔧 الدوال المساعدة والمعزولة (Safe Context Transformers)
// ============================================================

function safeAdaptProducts(products: Product[], currency: string): ProductCardAdapterResult[] {
  const adapted: ProductCardAdapterResult[] = [];
  
  for (const product of products) {
    try {
      // تمرير المنتج مع عملته الطائرة فوراً للأدابتر الخاص بالكارت
      adapted.push(adaptProductCard(product, currency));
    } catch (error) {
      console.error('[ProductGridAdapter] Failed to adapt product card structure:', product.id, error);
    }
  }
  
  return adapted;
}