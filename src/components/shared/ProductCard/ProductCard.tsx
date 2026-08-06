// src/components/storefront/ProductCard/ProductCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Tag, Send, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';
import { useCartStore } from '@/stores/cart-store';
import { getProductCardTheme } from './ProductCard.theme';
import type { ProductCardAdapterResult } from './ProductCard.adapter';
import { cn } from '@/lib/utils';

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

  const addItem = useCartStore((state) => state.addItem);
  const theme = getProductCardTheme({ variant, isOutOfStock: data.isOutOfStock });

  // 🚀 [هنا السحر!] توحيد المسار في متغير واحد لمنع الـ 404 في أي مكان
  const productHref = `/${storeSlug}/products/${data.slug}`;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (data.isOutOfStock || isLoading) return;
    
    setIsLoading(true);
    try {
      addItem({
        productId: data.id, // الـ Store هيولد الـ id تلقائياً ويخليه "1"
        name: data.name,
        price: data.discountedPrice,
        image: data.image,
        maxStock: data.stock,
        quantity: 1,
      });
    } finally {
      setIsLoading(false);
    }
  };

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
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddToCart}
            loading={isLoading}
            className="rounded-xl h-9 w-9 p-0 flex items-center justify-center border-slate-200 dark:border-slate-700 text-sm font-semibold"
            aria-label={`إضافة ${data.name} للسلة`}
          >
            +
          </Button>
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
        {/* ✅ تم تحديث الرابط هنا */}
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
            {/* ✅ تم تحديث الرابط هنا */}
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
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddToCart}
                loading={isLoading}
                className={theme.addToCartButton}
              >
                🛒 إضافة
              </Button>
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
      {/* ✅ تم تحديث الرابط هنا */}
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
        {/* ✅ تم تحديث الرابط هنا */}
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
              <>
                <Button
                  variant="primary"
                  size="sm"
                  className="hidden sm:flex rounded-xl h-9 px-4 text-xs font-semibold bg-slate-900 hover:bg-primary-600 border-none text-white active:scale-95 transition-all"
                  onClick={handleAddToCart}
                  loading={isLoading}
                >
                  🛒 أضف للسلة
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  className="flex sm:hidden rounded-xl h-8 w-8 p-0 flex items-center justify-center bg-slate-900 text-white border-none active:scale-95"
                  onClick={handleAddToCart}
                  loading={isLoading}
                  aria-label="إضافة للسلة"
                >
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </>
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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/80 animate-fade-in w-full"
            >
              <input
                type="tel"
                placeholder="رقم هاتفك وسيتم التواصل معاك "
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1 bg-transparent px-1.5 py-0.5 text-[11px] outline-none text-slate-800"
                required
              />
              <button type="submit" disabled={isLoading} className="bg-primary-600 text-white p-1 rounded-lg">
                <Send className="h-3 w-3 transform rotate-180" />
              </button>
            </form>
          )}

          {/* رسالة النجاح */}
          {data.isOutOfStock && isSubmitted && (
            <div className="flex items-center gap-1 justify-center bg-emerald-50/50 py-1 px-1.5 rounded-xl border border-emerald-100 animate-fade-in">
              <span className="text-[10px] font-medium text-emerald-600">تم الحفظ، سنبلغك فوراً! ✨</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}