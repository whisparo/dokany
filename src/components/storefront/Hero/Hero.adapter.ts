// src/components/storefront/Hero/Hero.adapter.ts

import type { Store } from '@/types';

export interface ExtendedStore extends Store {
  desktopImages?: string[];
  mobileImages?: string[];
}

export interface HeroAdapterResult {
  title: string;
  description: string;
  image: string;
  desktopImages?: string[];
  mobileImages?: string[];
  ctaText?: string;
  ctaLink?: string;
  variant: 'default' | 'centered' | 'split';
}

export interface HeroAdapterOptions {
  ctaText?: string;
  ctaLink?: string;
  variant?: 'default' | 'centered' | 'split';
  showCta?: boolean;
}

// ⚡ صور افتراضية مضمونة 100% من Unsplash كبديل آمن وسريع في حالة عدم وجود صورة بالمتجر
const FALLBACK_HERO_IMAGES = [
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop"
];

function optimizeImageUrl(url: string, width = 1200): string {
  if (!url || typeof url !== 'string') return url;

  if (url.includes('res.cloudinary.com') && !url.includes('/upload/f_auto')) {
    return url.replace('/upload/', `/upload/w_${width},f_auto,q_auto/`);
  }

  return url;
}

export function adaptHero(
  store: ExtendedStore,
  options: HeroAdapterOptions = {}
): HeroAdapterResult {
  if (!store || !store.id || !store.name) {
    throw new Error('[HeroAdapter] Invalid store data: Identity fields are required');
  }

  const safeSlug = store.slug ? encodeURIComponent(store.slug) : '';

  const {
    ctaText = 'تسوق الآن',
    ctaLink = options.ctaLink || `/${safeSlug}/products`,
    variant = 'split',
    showCta = true,
  } = options;

  // 1. تحديد الصورة الرئيسية
  const mainImage = optimizeImageUrl(
    store.coverImage || FALLBACK_HERO_IMAGES[0]
  );

  // 2. تجميع صور الديسكتوب والموبايل مع الضمان ألا تكون المصفوفة فارغة أبداً
  const rawDesktopImages = 
    store.desktopImages && store.desktopImages.length > 0
      ? store.desktopImages
      : store.coverImage
      ? [store.coverImage]
      : FALLBACK_HERO_IMAGES;

  const rawMobileImages = 
    store.mobileImages && store.mobileImages.length > 0
      ? store.mobileImages
      : rawDesktopImages;

  const desktopImages = rawDesktopImages.map((img) => optimizeImageUrl(img, 1200));
  const mobileImages = rawMobileImages.map((img) => optimizeImageUrl(img, 800));

  return {
    title: store.name.trim(),
    description: store.description?.trim() || 'اكتشف أفضل المنتجات في متجرنا',
    image: mainImage,
    desktopImages,
    mobileImages,
    ctaText: showCta ? ctaText : undefined,
    ctaLink: showCta ? ctaLink : undefined,
    variant,
  };
}