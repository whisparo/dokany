// src/components/storefront/ProductDetails/ProductDetails.adapter.ts

import type { Product } from '@/types';

// ============================================================
// 📦 الأنواع والواجهات الحقيقية للإنتاج
// ============================================================

export interface ProductMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
}

export interface SpecItem {
  label: string;
  value: string;
}

export interface UrgencyBadge {
  text: string;
  variant: 'danger' | 'warning' | 'success' | 'info' | 'primary';
}

export interface ProductDetailsAdapterResult {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  formattedPrice: string;
  originalPrice?: number;
  formattedOriginalPrice?: string;
  discountPercentage?: number;
  stock: number;
  isOutOfStock: boolean;
  lowStockThreshold: boolean;
  urgencyBadge?: UrgencyBadge;
  mainMedia: ProductMedia;
  mediaGallery: ProductMedia[];
  specs: SpecItem[];
  rating?: number;
  reviewCount?: number;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 🔧 تهيئة الـ Formatter الديناميكي النظيف والآمن تماماً
// ============================================================

const formattersCache = new Map<string, Intl.NumberFormat>();

function getPriceFormatter(currency: string): Intl.NumberFormat {
  if (!formattersCache.has(currency)) {
    formattersCache.set(
      currency,
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    );
  }
  return formattersCache.get(currency)!;
}

const ensureStringDate = (date: string | Date | undefined | null): string => {
  if (!date) return new Date().toISOString();
  return date instanceof Date ? date.toISOString() : date;
};

function parseMediaUrl(url: string): ProductMedia {
  const isVideo =
    /\.(mp4|webm|ogg|mov)$/i.test(url) ||
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('vimeo.com') ||
    (url.includes('cloudinary.com') && url.includes('/video/'));

  return {
    id: url,
    type: isVideo ? 'video' : 'image',
    url,
    thumbnailUrl: isVideo ? '/images/video-placeholder.png' : undefined,
  };
}

// ============================================================
// 🧠 الـ Adapter الرئيسي الفعلي
// ============================================================

export function adaptProductDetails(
  product: Product,
  userCurrency: string = 'EGP'
): ProductDetailsAdapterResult {
  if (!product || !product.id || !product.name) {
    throw new Error('[ProductDetailsAdapter] Invalid product data: missing id or name');
  }

  // ✅ 1. تأمين قيمة المخزن لحل خطأ undefined
  const safeStock = product.stock ?? 0;

  // حساب الخصم الفعلي والأسعار مباشرة
  const discountPercentage = product.discount?.percentage || 0;
  const safeDiscount = Math.min(Math.max(discountPercentage, 0), 100);
  const price = product.price;
  const hasDiscount = safeDiscount > 0;

  const discountedPrice = hasDiscount ? price * (1 - safeDiscount / 100) : price;

  // جلب الـ Formatter المناسب للعملة
  const formatter = getPriceFormatter(userCurrency);

  // تنسيق الأسعار ديناميكياً
  const formattedPrice = formatter.format(discountedPrice);
  const formattedOriginalPrice = hasDiscount ? formatter.format(price) : undefined;

  // الميديا والوسائط مع آمان التعامل مع الكائنات أو الروابط
  const rawMediaUrls: string[] = [];
  if (product.image) rawMediaUrls.push(product.image);

  if (product.images && Array.isArray(product.images)) {
    product.images.forEach((img) => {
      if (typeof img === 'string' && img.trim()) {
        rawMediaUrls.push(img);
      } else if (img && typeof img === 'object' && 'url' in img && typeof (img as { url: string }).url === 'string') {
        rawMediaUrls.push((img as { url: string }).url);
      }
    });
  }

  // ✅ 2. فحص آمن لـ videoUrl لتجنب خطأ Property does not exist
  const rawProduct = product as Product & { videoUrl?: string };
  if (rawProduct.videoUrl) {
    rawMediaUrls.push(rawProduct.videoUrl);
  }

  const uniqueUrls = Array.from(new Set(rawMediaUrls)).slice(0, 6);
  const mediaGallery =
    uniqueUrls.length > 0
      ? uniqueUrls.map(parseMediaUrl)
      : [{ id: 'placeholder', type: 'image' as const, url: '/images/default-product.png' }];

  const mainMedia = mediaGallery[0];

  // المخزن وندرة المنتج باستخدام safeStock
  const isOutOfStock = safeStock <= 0;
  const lowStockThreshold = !isOutOfStock && safeStock <= 5;

  let urgencyBadge: UrgencyBadge | undefined;
  if (isOutOfStock) {
    urgencyBadge = { text: 'نفد من المخزون', variant: 'danger' };
  } else if (lowStockThreshold) {
    urgencyBadge = { text: `متبقي ${safeStock} قطع فقط!`, variant: 'warning' };
  } else if (safeDiscount >= 30) {
    urgencyBadge = { text: `خصم لقطة ${safeDiscount}%`, variant: 'success' };
  }

  // المواصفات
  const specs: SpecItem[] = [];
  if (product.category) {
    const categoryName = typeof product.category === 'string' 
      ? product.category 
      : (product.category as { name?: string })?.name || '';
      
    if (categoryName) {
      specs.push({ label: 'القسم', value: categoryName });
    }
  }

  specs.push({
    label: 'حالة التوفر',
    value: isOutOfStock ? 'نفد من المخزون' : 'متوفر في المخزن',
  });

  if (product.variants && Array.isArray(product.variants)) {
    product.variants.forEach((variant) => {
      if (variant.attributes) {
        Object.entries(variant.attributes).forEach(([key, val]) => {
          if (typeof val === 'string' && !specs.some((s) => s.label === key)) {
            specs.push({ label: key, value: val });
          }
        });
      }
    });
  }

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || 'لا يوجد وصف متاح لهذا المنتج حالياً.',
    price: discountedPrice,
    formattedPrice,
    originalPrice: hasDiscount ? price : undefined,
    formattedOriginalPrice,
    discountPercentage: hasDiscount ? safeDiscount : undefined,
    stock: safeStock, // ✅ إرجاع number فقط
    isOutOfStock,
    lowStockThreshold,
    urgencyBadge,
    mainMedia,
    mediaGallery,
    specs,
    rating: product.rating,
    reviewCount: product.reviewCount,
    category: typeof product.category === 'string' ? product.category : undefined,
    createdAt: ensureStringDate(product.createdAt),
    updatedAt: ensureStringDate(product.updatedAt),
  };
}

export function clearProductDetailsCache(): void {
  formattersCache.clear();
}