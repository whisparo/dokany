// src/components/storefront/ProductDetails/ProductDetails.adapter.ts

import type { Product } from '@/types/product';

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

/**
 * استخدام 'en-US' يضمن عدم توليد أي حروف تحكم عربي (Bidi) مخفية من المتصفح تسبب عك بصري.
 * سيعرض السعر بالصيغة العالمية الفخمة والمستقرة: EGP 100 أو SAR 120
 */
function getPriceFormatter(currency: string): Intl.NumberFormat {
  if (!formattersCache.has(currency)) {
    formattersCache.set(currency, new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }));
  }
  return formattersCache.get(currency)!;
}

const ensureStringDate = (date: string | Date | undefined | null): string => {
  if (!date) return new Date().toISOString();
  return date instanceof Date ? date.toISOString() : date;
};

function parseMediaUrl(url: string): ProductMedia {
  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || 
                  url.includes('youtube.com') || 
                  url.includes('youtu.be') || 
                  url.includes('vimeo.com') ||
                  (url.includes('cloudinary.com') && url.includes('/video/'));

  return {
    id: url, 
    type: isVideo ? 'video' : 'image',
    url,
    thumbnailUrl: isVideo ? '/images/video-placeholder.png' : undefined
  };
}

// ============================================================
// 🧠 الـ Adapter الرئيسي الفعلي (المطابق للبيانات الفعالة بالملي)
// ============================================================

export function adaptProductDetails(
  product: Product,
  userCurrency: string = 'EGP' // 👈 تأتي ديناميكياً بناءً على تسجيل المستخدم من تليجرام
): ProductDetailsAdapterResult {
  
  if (!product || !product.id || !product.name) {
    throw new Error('[ProductDetailsAdapter] Invalid product data: missing id or name');
  }

  // حساب الخصم الفعلي والأسعار مباشرة من الداتابيز
  const discountPercentage = product.discount?.percentage || 0;
  const safeDiscount = Math.min(Math.max(discountPercentage, 0), 100);
  const price = product.price; 
  const hasDiscount = safeDiscount > 0;

  const discountedPrice = hasDiscount 
    ? price * (1 - safeDiscount / 100) 
    : price;

  // جلب الـ Formatter المناسب للعملة القادمة من تليجرام تلقائياً (منسق بالـ en-US النظيف)
  const formatter = getPriceFormatter(userCurrency);

  // تنسيق الأسعار ديناميكياً 100% ومستقر تماماً على كل المتصفحات
  const formattedPrice = formatter.format(discountedPrice);
  const formattedOriginalPrice = hasDiscount ? formatter.format(price) : undefined;

  // الميديا والوسائط
  const rawMediaUrls: string[] = [];
  if (product.image) rawMediaUrls.push(product.image);
  if (product.images && Array.isArray(product.images)) {
    rawMediaUrls.push(...product.images.filter((img): img is string => Boolean(img)));
  }
  if (product.videoUrl) {
    rawMediaUrls.push(product.videoUrl);
  }

  const uniqueUrls = Array.from(new Set(rawMediaUrls)).slice(0, 6);
  const mediaGallery = uniqueUrls.length > 0 
    ? uniqueUrls.map(parseMediaUrl)
    : [{ id: 'placeholder', type: 'image' as const, url: '/images/default-product.png' }];

  const mainMedia = mediaGallery[0];

  // المخزن وندرة المنتج
  const isOutOfStock = product.stock <= 0;
  const lowStockThreshold = !isOutOfStock && product.stock <= 5;
  
  let urgencyBadge: UrgencyBadge | undefined;
  if (isOutOfStock) {
    urgencyBadge = { text: 'نفد من المخزون', variant: 'danger' };
  } else if (lowStockThreshold) {
    urgencyBadge = { text: `متبقي ${product.stock} قطع فقط!`, variant: 'warning' };
  } else if (safeDiscount >= 30) {
    urgencyBadge = { text: `خصم لقطة ${safeDiscount}%`, variant: 'success' };
  }

  // المواصفات
  const specs: SpecItem[] = [];
  if (product.category) {
    specs.push({ label: 'القسم', value: product.category });
  }
  
  specs.push({ 
    label: 'حالة التوفر', 
    value: isOutOfStock ? 'نفد من المخزون' : 'متوفر في المخزن' 
  });
  
  if (product.variants && Array.isArray(product.variants)) {
    product.variants.forEach((variant) => {
      if (variant.attributes) {
        Object.entries(variant.attributes).forEach(([key, val]) => {
          if (typeof val === 'string' && !specs.some(s => s.label === key)) {
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
    stock: product.stock,
    isOutOfStock,
    lowStockThreshold,
    urgencyBadge,
    mainMedia,
    mediaGallery,
    specs,
    rating: product.rating,
    reviewCount: product.reviewCount,
    category: product.category,
    createdAt: ensureStringDate(product.createdAt),
    updatedAt: ensureStringDate(product.updatedAt),
  };
}

export function clearProductDetailsCache(): void {
  formattersCache.clear();
}