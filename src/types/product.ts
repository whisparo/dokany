// src/types/product.ts

/**
 * نوع المنتج (Product)
 */
export interface Product {
  /** معرف فريد */
  id: string;
  
  /** معرف المتجر */
  storeId: string;
  
  /** اسم المنتج */
  name: string;
  
  /** Slug للـ URL */
  slug: string;
  
  /** وصف المنتج (HTML مسموح) */
  description?: string;
  
  /** السعر بالقرش (integer) */
  price: number;
  
  /** السعر الأصلي قبل الخصم (بالقرش) */
  originalPrice?: number;
  
  /** الكمية المتاحة في المخزون */
  stock: number;
  
  /** الصورة الرئيسية */
  image?: string;
  
  /** صور إضافية */
  images?: string[];
  
  /** الفئة */
  category?: string;
  
  /** الوسوم */
  tags?: string[];
  
  /** التقييم (0-5) */
  rating?: number;
  
  /** عدد المراجعات */
  reviewCount?: number;
  
  /** الخصم */
  discount?: {
    percentage: number;
    endsAt?: string;
  };
  
  /** الأبعاد (للشحن) */
  dimensions?: {
    weight?: number; // kg
    length?: number; // cm
    width?: number; // cm
    height?: number; // cm
  };
  
  /** المتغيرات (Variants) */
  variants?: ProductVariant[];
  
  /** SEO metadata */
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
  
  /** تاريخ الإنشاء */
  createdAt: string;
  
  /** تاريخ التحديث */
  updatedAt: string;
}

/**
 * متغير المنتج (Product Variant)
 */
export interface ProductVariant {
  id: string;
  name: string;
  price?: number; // لو مختلف عن السعر الأساسي
  stock: number;
  image?: string;
  attributes: Record<string, string>; // مثل: { color: 'red', size: 'L' }
}

/**
 * استجابة API للمنتجات
 */
export interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * فلترة المنتجات
 */
export interface ProductFilters {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'rating';
}