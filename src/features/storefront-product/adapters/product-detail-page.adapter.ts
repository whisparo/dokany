// src/lib/adapters/product-detail-page.adapter.ts

import type { Store, Product } from '@/types';
import { adaptProductDetails } from '@/features/storefront-product/components/ProductDetails/ProductDetails.adapter';
import type { ProductDetailsAdapterResult } from '@/features/storefront-product/components/ProductDetails/ProductDetails.adapter';

// ============================================================
// 📦 الأنواع والواجهات الصارمة لصفحة تفاصيل المنتج (Payload)
// ============================================================

export interface ProductDetailPagePayload {
  store: Store;
  productDetails: ProductDetailsAdapterResult;
  relatedProducts: Product[]; // 👈 تم إضافة المنتجات ذات الصلة هنا
}

export interface RawProductDetailPageData {
  store: Store;
  product: Product;
  relatedProducts?: Product[]; // 👈 تم إضافتها كـ Optional في البيانات الخام
}

// ============================================================
// 🧠 الـ Adapter العام لصفحة تفاصيل المنتج (Pure Function)
// ============================================================

/**
 * ✅ يحول البيانات الخام المجلوبة بواسطة الأوركسترا إلى Payload نظيف ومُهندم للـ UI
 * @param rawData - البيانات الخام القادمة من السيرفر (المتجر + المنتج + المنتجات ذات الصلة)
 * @param userCurrency - العملة المفضلة للمستخدم المستخرجة ديناميكياً
 */
export function adaptProductDetailPage(
  rawData: RawProductDetailPageData,
  userCurrency: string = 'EGP'
): ProductDetailPagePayload {
  const { store, product, relatedProducts = [] } = rawData;

  // ✅ التحقق الصارم من سلامة البيانات لمنع حدوث Runtime crashes
  if (!store || !store.id || !store.name) {
    throw new Error('[ProductDetailPageAdapter] Invalid store data: missing required fields');
  }

  if (!product || !product.id || !product.name) {
    throw new Error('[ProductDetailPageAdapter] Invalid product data: missing required fields');
  }

  // ✅ تشغيل الأدابتر الصغير الخاص بمكون تفاصيل المنتج وتمرير العملة له
  const productDetails = adaptProductDetails(product, userCurrency);

  // ✅ تجميع الـ Payload النهائي النظيف وإرجاعه
  return {
    store,
    productDetails,
    relatedProducts,
  };
}