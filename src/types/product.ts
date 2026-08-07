// src/types/product.ts

/**
 * ✅ مواءمة متغير المنتج (Product Variant)
 */
export interface ProductVariant {
  id: string;
  name: string;
  price?: number;
  stock: number;
  image?: string;
  attributes: Record<string, string>;
}

/**
 * ✅ واجهة المنتج الكاملة للـ Frontend (UI-Ready Product Type)
 * مستقلة تماماً عن الـ DB Schema لمنع التسريب لحزمة العميل
 */
export interface Product {
  id: string;
  storeId?: string;
  name: string;
  slug: string;
  description?: string | null;
  status?: string;

  // 💰 الأسعار
  price: number;
  originalPrice?: number;
  cost?: number;
  minPrice?: number;

  // 🖼️ الصور
  image?: string;
  images?: string[];

  // 📦 المخزون والتوفر
  stock?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;

  // 📦 الأبعاد
  dimensions?: {
    weight?: number;
    length?: number;
    width?: number;
    height?: number;
  };

  // 🏷️ الفئة والوسوم والتقييمات
  category?: string;
  categoryId?: string | null;
  tags?: string[];
  rating?: number;
  reviewCount?: number;

  // 💸 الخصومات النشطة
  discount?: {
    percentage: number;
    endsAt?: string;
  };

  // 👥 المتغيرات
  variants?: ProductVariant[];

  // 🔍 تحسين محركات البحث
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };

  // ⏱️ التواريخ
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * ✅ استجابة API للمنتجات
 */
export interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * ✅ فلترة المنتجات
 */
export interface ProductFilters {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'rating';
}