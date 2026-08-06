// src/components/storefront/ProductCard/ProductCard.adapter.ts

import type { Product } from '@/types'; // توحيد الـ path لتفادي تضارب الـ Aliases

// ============================================================
// 📦 الأنواع
// ============================================================
export interface ProductCardAdapterResult {
  id: string;
  name: string;
  slug: string;
  image: string;
  formattedPrice: string;
  originalPrice?: string;
  discountedPrice: number;
  isOutOfStock: boolean;
  discount?: number;
  rating?: number;
  stock: number;
  reviewCount?: number;
}

// ============================================================
// 🧠 الـ Adapter الرئيسي (Premium & Structurally Grounded)
// ============================================================

/**
 * ✅ يحول بيانات المنتج الخام إلى Payload مصفى ومستقر 100% للـ UI بناءً على عملة العميل ديناميكياً
 * @param product - بيانات المنتج القادمة من D1
 * @param userCurrency - العملة المستهدفة الممررة من السيرفر (مثل: EGP, SAR, USD)
 */
export function adaptProductCard(product: Product, userCurrency: string = 'EGP'): ProductCardAdapterResult {
  try {
    // 1. Validation صارم لمنع تسريب داتا مشوهة لشاشات العميل
    validateProduct(product);
    
    // 2. حساب نسبة الخصم وتأمين الحدود الرياضية
    const discountPercentage = Math.min(product.discount?.percentage || 0, 100);
    
    // 3. هندسة الأسعار: احتساب السعر الفعلي بعد الخصم وحماية النتيجة من السوالب
    const discountedPrice = Math.max(
      0,
      product.price * (1 - discountPercentage / 100)
    );
    
    // 4. تنسيق الأسعار ديناميكياً (رقم إنجليزي نقي + اسم العملة الطائرة)
    const formattedPrice = formatPrice(discountedPrice, userCurrency);
    
    // تأمين ظهور السعر القديم مشطوباً إذا وجد خصم حقيقي فعلي
    const originalPrice = discountPercentage > 0 
      ? formatPrice(product.price, userCurrency) 
      : undefined;
    
    // 5. بناء كائن النتيجة المستقر والمحصن ضد الـ Runtime Failures
    return {
      id: product.id,
      name: product.name.trim(),
      slug: product.slug.trim(),
      image: product.image || '/images/default-product.png',
      discountedPrice,
      formattedPrice,
      originalPrice,
      isOutOfStock: product.stock <= 0,
      discount: discountPercentage > 0 ? discountPercentage : undefined,
      rating: product.rating,
      stock: product.stock,
      reviewCount: product.reviewCount,
    };
  } catch (error) {
    console.error('[ProductCardAdapter] Critical failure during transformation:', error);
    
    // ✅ Fallback دفاعي آمن يحمي الجريد والصفحة من الانهيار الكامل
    return {
      id: product?.id || 'unknown',
      name: product?.name || 'منتج غير متوفر حالياً',
      slug: product?.slug || 'unknown',
      image: '/images/default-product.png',
      discountedPrice: 0,
      formattedPrice: `0 ${userCurrency.toUpperCase()}`,
      isOutOfStock: true,
      stock: 0,
    };
  }
}

// ============================================================
// 🔧 الدوال المساعدة والمعزولة (Pure Helpers)
// ============================================================

function validateProduct(product: Product): void {
  if (!product.id || !product.name || !product.slug) {
    throw new Error('Invalid product structure: missing identity identifiers (id, name, slug)');
  }
  
  if (typeof product.price !== 'number' || product.price < 0) {
    throw new Error(`Invalid data type or range for product price: ${product.price}`);
  }
  
  if (typeof product.stock !== 'number' || product.stock < 0) {
    throw new Error(`Invalid data type or range for product stock: ${product.stock}`);
  }
}

function formatPrice(price: number, currency: string): string {
  try {
    const formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);

    return `${formattedNumber} ${currency.toUpperCase()}`;
  } catch (error) {
    console.error('[ProductCardAdapter] NumberFormat crashed, executing fallback:', error);
    return `${price.toFixed(2)} ${currency.toUpperCase()}`;
  }
}