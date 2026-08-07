// src/components/storefront/ProductCard/ProductCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Star, Tag, Send } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import { getProductCardTheme } from './ProductCard.theme';
import type { ProductCardAdapterResult } from './ProductCard.adapter';
import { cn } from '@/lib/utils';

// 🚀 تحميل زر الإضافة للسلة بشكل ديناميكي لعزل Zustand Bundle من الصفحات الرئيسية
const AddToCartButton = dynamic(() => import('@/features/storefront-home/components/AddToCartButton'), {
  ssr: false,
  loading: () => (
    <div className="h-8 w-8 sm:w-20 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl" />
  ),
});

export interface ProductCardProps {
  data: ProductCardAdapterResult;
  storeSlug: string;
  variant?: 'default' | 'compact' | 'horizontal';
  showAddToCart?: boolean;
  showRating?: boolean;
  priority?: boolean;
  index?: number;
  className?: string;
}

export function ProductCard({
  data,
  storeSlug,
  variant = 'default',
  showAddToCart = true,
  showRating = true,
  priority = false,
  index = 0,
  className,
}: ProductCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // حالات الفورم لطلب التوفر
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const theme = getProductCardTheme({ variant, isOutOfStock: data.isOutOfStock });
  const productHref = `/${storeSlug}/products/${data.slug}`;

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!phoneNumber.trim()) return;

    setIsLoading(true);
    try {
      console.log('Phone registered for product:', data.id, phoneNumber);
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const productAriaLabel = `منتج ${index + 1}: ${data.name}`;

  // ============================================================
  // ✨ 1. الوضع المضغوط (Compact Variant)
  // ============================================================
  if (variant === 'compact') {
    return (
      <div
        className={cn(theme.container, className)}
        data-testid="product-card-compact"
        data-index={index}
        aria-label={productAriaLabel}
      >
        <Link href={productHref} prefetch={false} className="shrink-0">
          <div className={theme.imageContainer}>
            <Image
              src={imageError ? '/placeholder.png' : data.image}
              alt={data.name}
              width={56}
              height={56}
              className={theme.image}
              onError={() => setImageError(true)}
            />
          </div>
        </Link>

        <div className="flex-1 min-w-0 space-y-0.5">
          <Link href={productHref} prefetch={false} className="block">
            <Typography variant="body2" weight="medium" className={theme.title}>
              {data.name}
            </Typography>
          </Link>
          <Typography variant="caption" className={theme.price}>
            {data.formattedPrice}
          </Typography>
        </div>

        {showAddToCart && !data.isOutOfStock && (
          <AddToCartButton data={data} variant="compact" />
        )}
      </div>
    );
  }

  // ============================================================
  // ✨ 2. الوضع الأفقي (Horizontal Variant)
  // ============================================================
  if (variant === 'horizontal') {
    return (
      <div
        className={cn(theme.container, className)}
        data-testid="product-card-horizontal"
        data-index={index}
        aria-label={productAriaLabel}
      >
        <Link href={productHref} prefetch={false} className={theme.imageContainer}>
          <Image
            src={imageError ? '/placeholder.png' : data.image}
            alt={data.name}
            fill
            className={theme.image}
            priority={priority}
            onError={() => setImageError(true)}
          />
        </Link>
        <div className={theme.content}>
          <div>
            <Link href={productHref} prefetch={false} className="block">
              <Typography variant="h5" className={theme.title}>
                {data.name}
              </Typography>
            </Link>
            {showRating && data.rating && (
              <div className={theme.rating.container}>
                <Star className={theme.rating.star} aria-hidden="true" />
                <Typography variant="caption" className={theme.rating.value}>
                  {data.rating} <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span> ({data.reviewCount || 0})
                </Typography>
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 pt-3">
            <div className="space-y-0.5">
              <Typography variant="h5" className={theme.price}>
                {data.formattedPrice}
              </Typography>
              {data.originalPrice && (
                <Typography variant="caption" className={theme.originalPrice}>
                  {data.originalPrice}
                </Typography>
              )}
            </div>
            {showAddToCart && !data.isOutOfStock && (
              <AddToCartButton data={data} variant="horizontal" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✨ 3. الوضع الافتراضي (Default Card)
  // ============================================================
  return (
    <div
      className={cn(theme.container, className)}
      data-testid="product-card"
      data-variant={variant}
      data-index={index}
      aria-label={productAriaLabel}
    >
      {/* 🖼️ منطقة الصورة */}
      <Link href={productHref} prefetch={false} className={theme.imageContainer}>
        <div className="aspect-[1/1] w-full relative">
          <Image
            src={imageError ? '/placeholder.png' : data.image}
            alt={data.name}
            fill
            className={theme.image}
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImageError(true)}
          />
        </div>

        <div className={theme.badges.container}>
          {data.discount && data.discount > 0 && !data.isOutOfStock && (
            <span className={theme.badges.discount}>
              <Tag className="me-1 h-2.5 w-2.5" aria-hidden="true" />
              خصم {data.discount}%
            </span>
          )}
        </div>
      </Link>

      {/* 📝 منطقة محتوى الكارت */}
      <div className={theme.content}>
        <Link href={productHref} prefetch={false} className="block">
          <Typography variant="body1" className={theme.title}>
            {data.name}
          </Typography>
        </Link>

        {/* 💵 السعر وزر الإضافة */}
        <div className="mt-auto flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            {/* منطقة السعر والخصم */}
            <div className="flex flex-col min-w-0">
              <Typography variant="h6" className={theme.price}>
                {data.formattedPrice}
              </Typography>
              {data.originalPrice && (
                <Typography variant="caption" className={theme.originalPrice}>
                  {data.originalPrice}
                </Typography>
              )}
            </div>

            {/* أزرار الإضافة وسلة المشتريات */}
            {showAddToCart && !data.isOutOfStock && (
              <AddToCartButton data={data} variant="default" />
            )}

            {/* حالة عدم التوفر والطلب السريع */}
            {data.isOutOfStock && !showPhoneInput && !isSubmitted && (
              <div className="flex flex-col items-end gap-0.5">
                <div className={theme.stockStatus.container}>
                  <span className={theme.stockStatus.dot} />
                  <span className={theme.stockStatus.text}>غير متوفر</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowPhoneInput(true);
                  }}
                  className={theme.askAvailabilityButton}
                >
                  💬 اسأل عنه
                </button>
              </div>
            )}
          </div>

          {/* خانة رقم الموبايل */}
          {data.isOutOfStock && showPhoneInput && !isSubmitted && (
            <form
              onSubmit={handleNotifySubmit}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/80 animate-fade-in w-full"
            >
              <input
                type="tel"
                placeholder="رقم هاتفك وسيتم التواصل معاك "
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1 bg-transparent px-1.5 py-0.5 text-[11px] outline-none text-slate-800 dark:text-slate-200"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="bg-primary-600 text-white p-1 rounded-lg"
              >
                <Send className="h-3 w-3 transform rotate-180" />
              </button>
            </form>
          )}

          {/* رسالة النجاح */}
          {data.isOutOfStock && isSubmitted && (
            <div className="flex items-center gap-1 justify-center bg-emerald-50/50 py-1 px-1.5 rounded-xl border border-emerald-100 animate-fade-in">
              <span className="text-[10px] font-medium text-emerald-600">
                تم الحفظ، سنبلغك فوراً! ✨
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}