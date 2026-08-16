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

  // 1. تحديد الصور الخاصة بالمتجر فقط (بدون Unsplash)
  const hasCover = Boolean(store.coverImage);
  const mainImage = hasCover ? optimizeImageUrl(store.coverImage!, 1200) : '';

  const rawDesktopImages = 
    store.desktopImages && store.desktopImages.length > 0
      ? store.desktopImages
      : hasCover
      ? [store.coverImage!]
      : [];

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