// src/components/storefront/Hero/Hero.adapter.ts

import type { Store } from '@/types';

// ============================================================
// 📦 الأنواع (Strongly Typed Contracts)
// ============================================================

export interface HeroAdapterResult {
  title: string;
  description: string;
  image: string;
  ctaText?: string;
  ctaLink?: string;
  variant: 'default' | 'centered' | 'split'; // جعل الـ variant إلزامي لمنع العشوائية بالـ UI
}

export interface HeroAdapterOptions {
  ctaText?: string;
  ctaLink?: string;
  variant?: 'default' | 'centered' | 'split';
  showCta?: boolean;
}

// ============================================================
// 🧠 الـ Adapter الرئيسي
// ============================================================

/**
 * ✅ يحول بيانات المتجر الخام إلى Payload نظيف ومحدد الـ Variant للـ UI
 */
export function adaptHero(
  store: Store,
  options: HeroAdapterOptions = {}
): HeroAdapterResult {
  if (!store || !store.id || !store.name) {
    throw new Error('[HeroAdapter] Invalid store data: Identity fields are required');
  }
  
  const {
    ctaText = 'تسوق الآن',
    ctaLink = `/${store.slug}/products`,
    variant = 'split', // تغيير الافتراضي لـ split عشان الصورة تظهر فوراً مع المحتوى النصي
    showCta = true,
  } = options;
  
  return {
    title: store.name.trim(),
    description: store.description?.trim() || 'اكتشف أفضل المنتجات في متجرنا',
    image: store.coverImage || '/images/default-banner.png',
    ctaText: showCta ? ctaText : undefined,
    ctaLink: showCta ? ctaLink : undefined,
    variant,
  };
}