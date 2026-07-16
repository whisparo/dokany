// src/types/product.ts

// 1. استيراد الأنواع والـ Sub-Types مباشرة من الـ Schema
import { 
  type Product as DBProduct,
  type ProductImage,
  type ProductVariant as DBProductVariant
} from '@/lib/db/schema/products';

/**
 * ✅ مواءمة متغير المنتج (Product Variant)
 */
export interface ProductVariant {
  id: string;
  name: string;
  price?: number; // لو مختلف عن السعر الأساسي (بالقرش مثلاً)
  stock: number;
  image?: string;
  attributes: Record<string, string>; // مثل: { color: 'red', size: 'L' }
}

/**
 * ✅ واجهة المنتج الكاملة للـ Frontend (UI-Ready Product Type)
 * نستخدم Omit لاستبعاد الحقول الخام من قاعدة البيانات التي سنعيد صياغتها للـ UI
 */
export interface Product extends Omit<
  DBProduct, 
  | 'price' | 'compareAtPrice' | 'cost' | 'minPrice' // مستبعدين لأنهم في الـ DB (text) وفي الـ UI (number)
  | 'weight' | 'length' | 'width' | 'height' // مستبعدين لتجميعهم في كائن dimensions
  | 'metaTitle' | 'metaDescription' // مستبعدين لتجميعهم في كائن seo
  | 'images' | 'variants' // سنعيد كتابتهم لتطابق متطلبات الـ Frontend
  | 'createdAt' | 'updatedAt'
> {
  
  // 💰 الأسعار مهيأة كـ numbers للعمليات الحسابية والـ UI
  price: number;
  originalPrice?: number; // توازي compareAtPrice في الـ Schema
  cost?: number;
  minPrice?: number;

  // 🖼️ الصور مهيأة للـ Frontend بشكل مبسط
  image?: string; // توازي imageSrc في الـ Schema
  images?: string[]; // مصفوفة الروابط المباشرة للـ UI

  // 📦 الأبعاد مجمعة في كائن واحد مريح للـ UI
  dimensions?: {
    weight?: number; // kg
    length?: number; // cm
    width?: number; // cm
    height?: number; // cm
  };

  // 🏷️ الفئة والوسوم والتقييمات (تُجلب غالباً عن طريق الـ Relations / Join مع الـ Stats والـ Categories)
  category?: string;
  tags?: string[];
  rating?: number; // بيتحول من الـ Stats (مثلا: 450 -> 4.5)
  reviewCount?: number; // يوازي reviewsCount من جدول الـ Stats

  // 💸 الخصومات النشطة
  discount?: {
    percentage: number;
    endsAt?: string;
  };

  // 👥 المتغيرات المهيأة للـ Frontend
  variants?: ProductVariant[];

  // 🔍 تحسين محركات البحث مجمع
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };

  // ⏱️ تكييف التواريخ لتناسب الـ JSON Serialization
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