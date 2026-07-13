// src/components/storefront/ProductCard/ProductCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Star, Tag, Ban } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import  Button  from '@/components/shared/Button';
import { useCartStore } from '@/stores/cart-store';
import { getProductCardTheme } from './ProductCard.theme';
import type { ProductCardAdapterResult } from './ProductCard.adapter';
import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع
// ============================================================
export interface ProductCardProps {
  data: ProductCardAdapterResult;
  variant?: 'default' | 'compact' | 'horizontal';
  showAddToCart?: boolean;
  showRating?: boolean;
  priority?: boolean;
  index?: number;
  className?: string;
}

// ============================================================
// 🧠 المكون الرئيسي (Premium Edition)
// ============================================================
export function ProductCard({
  data,
  variant = 'default',
  showAddToCart = true,
  showRating = true,
  priority = false,
  index = 0,
  className,
}: ProductCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const theme = getProductCardTheme({ variant, isOutOfStock: data.isOutOfStock });

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (data.isOutOfStock || isLoading) return;
    
    setIsLoading(true);
    try {
      addItem({
        id: data.id,
        productId: data.id,
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

  const productAriaLabel = `منتج ${index + 1}: ${data.name}`;

  // ============================================================
  // ✨ 1. الوضع المضغوط (Compact Variant) - فخامة الإيجاز
  // ============================================================
  if (variant === 'compact') {
    return (
      <div 
        className={cn(
          "group flex items-center gap-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-card p-2.5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary-500/20",
          theme.container,
          className
        )}
        data-testid="product-card-compact"
        data-index={index}
        aria-label={productAriaLabel}
      >
        <Link href={`/products/${data.slug}`} prefetch={false} className="shrink-0">
          <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100/50 dark:border-slate-800">
            <Image
              src={imageError ? '/placeholder.png' : data.image}
              alt={data.name}
              width={56}
              height={56}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImageError(true)}
            />
          </div>
        </Link>
        <div className="flex-1 min-w-0 space-y-0.5">
          <Link href={`/products/${data.slug}`} prefetch={false} className="block">
            <Typography 
              variant="body2" 
              weight="medium" 
              className="truncate text-slate-800 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            >
              {data.name}
            </Typography>
          </Link>
          <Typography variant="caption" className="font-bold text-primary-600 dark:text-primary-400">
            {data.formattedPrice}
          </Typography>
        </div>
        {showAddToCart && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddToCart}
            loading={isLoading}
            disabled={data.isOutOfStock}
            className={cn(
              "rounded-xl h-9 w-9 p-0 flex items-center justify-center border-slate-200 dark:border-slate-700 hover:bg-primary-50 dark:hover:bg-primary-950/30 hover:text-primary-600",
              data.isOutOfStock && "opacity-50 cursor-not-allowed"
            )}
            aria-label={data.isOutOfStock ? 'نفد من المخزون' : `إضافة ${data.name} للسلة`}
          >
            {data.isOutOfStock ? <Ban className="h-4 w-4 text-slate-400" /> : <span className="text-sm font-semibold">+</span>}
          </Button>
        )}
      </div>
    );
  }

  // ============================================================
  // ✨ 2. الوضع الأفقي (Horizontal Variant) - هيبة العرض
  // ============================================================
  if (variant === 'horizontal') {
    return (
      <div 
        className={cn(
          "group flex flex-col sm:flex-row gap-4 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-card p-3.5 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-none hover:border-primary-500/20",
          theme.container,
          className
        )}
        data-testid="product-card-horizontal"
        data-index={index}
        aria-label={productAriaLabel}
      >
        <Link 
          href={`/products/${data.slug}`} 
          prefetch={false}
          className="relative h-48 w-full sm:h-32 sm:w-36 shrink-0 overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
        >
          <Image
            src={imageError ? '/placeholder.png' : data.image}
            alt={data.name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            priority={priority}
            onError={() => setImageError(true)}
          />
        </Link>
        <div className="flex flex-1 flex-col justify-between py-0.5">
          <div>
            <Link href={`/products/${data.slug}`} prefetch={false} className="block">
              <Typography 
                variant="h5" 
                className="mb-1.5 line-clamp-2 text-slate-800 dark:text-slate-100 font-semibold leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-300"
              >
                {data.name}
              </Typography>
            </Link>
            {showRating && data.rating && (
              <div className="mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                <Typography variant="caption" className="font-medium text-slate-500 dark:text-slate-400">
                  {data.rating} <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span> ({data.reviewCount || 0})
                </Typography>
              </div>
            )}
          </div>
          <div className="flex items-end justify-between gap-2 border-t border-dashed border-slate-100 dark:border-slate-800/80 pt-3">
            <div className="space-y-0.5">
              <Typography variant="h5" className="text-primary-600 dark:text-primary-400 font-bold tracking-tight">
                {data.formattedPrice}
              </Typography>
              {data.originalPrice && (
                <Typography variant="caption" className="text-slate-400 line-through block">
                  {data.originalPrice}
                </Typography>
              )}
            </div>
            {showAddToCart && (
              <Button
                variant={data.isOutOfStock ? "outline" : "primary"}
                size="sm"
                onClick={handleAddToCart}
                loading={isLoading}
                disabled={data.isOutOfStock}
                className={cn(
                  "rounded-xl px-5 h-9 font-medium shadow-sm transition-all duration-300 text-xs",
                  !data.isOutOfStock && "bg-primary-600 hover:bg-primary-700 active:scale-95 shadow-primary-100"
                )}
                aria-label={data.isOutOfStock ? 'نفد من المخزون' : `إضافة ${data.name} للسلة`}
              >
                {data.isOutOfStock ? '🚫 غير متوفر' : '🛒 إضافة'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✨ 3. الوضع الافتراضي (Default Card) - ملك الفخامة (مظبوط للموبايل كارتين بالملي)
  // ============================================================
  return (
    <div 
      className={cn(
        "group flex flex-col rounded-2xl border border-slate-100/80 dark:border-slate-800/50 bg-card overflow-hidden shadow-sm transition-all duration-500 hover:shadow-xl hover:shadow-slate-100/60 dark:hover:shadow-none hover:border-primary-500/20 hover:-translate-y-1 backface-hidden",
        theme.container,
        className
      )}
      data-testid="product-card"
      data-variant={variant}
      data-index={index}
      aria-label={productAriaLabel}
    >
      {/* 🖼️ منطقة الصورة والوسوم */}
      <Link 
        href={`/products/${data.slug}`} 
        prefetch={false}
        className="relative block overflow-hidden bg-slate-50 dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800/40"
      >
        {/* الحفاظ على التناسب المثالي 1:1 وحجم الكارتين في الموبايل */}
        <div className="aspect-[1/1] w-full relative">
          <Image
            src={imageError ? '/placeholder.png' : data.image}
            alt={data.name}
            fill
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105 origin-center"
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImageError(true)}
          />
        </div>
        
        {/* 🏷️ الوسوم الذكية (Smart Badges) */}
        <div className="absolute start-2.5 top-2.5 flex flex-col gap-1.5 z-10">
          {data.isOutOfStock && (
            <span className="inline-flex items-center rounded-lg bg-slate-900/90 dark:bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-sm">
              انتهى
            </span>
          )}
          {data.discount && data.discount > 0 && !data.isOutOfStock && (
            <span className="inline-flex items-center rounded-lg bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-sm animate-fade-in">
              <Tag className="me-1 h-2.5 w-2.5" aria-hidden="true" />
              خصم {data.discount}%
            </span>
          )}
        </div>
        
        {/* 🛒 أيقونة السلة السريعة الطائرة */}
        {showAddToCart && !data.isOutOfStock && (
          <button
            type="button"
            onClick={handleAddToCart}
            className="absolute bottom-3 end-3 rounded-xl bg-white/95 dark:bg-slate-900/95 p-2.5 shadow-lg shadow-slate-200/50 dark:shadow-none backdrop-blur-md opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 max-sm:opacity-100 max-sm:translate-y-0 transition-all duration-300 ease-out hover:scale-110 active:scale-95 hover:bg-primary-600 dark:hover:bg-primary-600 group/btn"
            aria-label={`إضافة ${data.name} للسلة`}
          >
            <ShoppingCart className="h-4 w-4 text-primary-600 dark:text-primary-400 group-hover/btn:text-white transition-colors" aria-hidden="true" />
          </button>
        )}
      </Link>

      {/* 📝 تفاصيل المنتج والداتا */}
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <Link href={`/products/${data.slug}`} prefetch={false} className="flex-1">
          <Typography 
            variant="body1" 
            className="line-clamp-2 text-slate-800 dark:text-slate-100 font-medium tracking-tight leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-300 min-h-[2.6rem] sm:min-h-[3rem]"
          >
            {data.name}
          </Typography>
        </Link>

        {showRating && data.rating && (
          <div className="mt-1 mb-2.5 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <Typography variant="caption" className="font-semibold text-slate-600 dark:text-slate-400 text-[11px] sm:text-xs">
              {data.rating}
            </Typography>
            {data.reviewCount && (
              <Typography variant="caption" className="text-slate-400 text-[11px] sm:text-xs">
                ({data.reviewCount})
              </Typography>
            )}
          </div>
        )}

        {/* 💵 السعر وزر الإضافة الأسفل */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-50 dark:border-slate-800/40 pt-2.5">
          <div className="space-y-0.5">
            <Typography variant="h6" className="text-primary-600 dark:text-primary-400 font-bold tracking-tight text-sm sm:text-base">
              {data.formattedPrice}
            </Typography>
            {data.originalPrice && (
              <Typography variant="caption" className="text-slate-400 line-through block text-[10px] sm:text-xs">
                {data.originalPrice}
              </Typography>
            )}
          </div>

          {showAddToCart && (
            <Button
              variant={data.isOutOfStock ? "outline" : "primary"}
              size="sm"
              className={cn(
                "rounded-xl h-8 sm:h-9 px-3.5 sm:px-4 text-[11px] sm:text-xs font-semibold shadow-sm transition-all duration-300 max-sm:hidden",
                !data.isOutOfStock && "bg-slate-900 hover:bg-primary-600 dark:bg-slate-800 dark:hover:bg-primary-600 border-none text-white active:scale-95"
              )}
              onClick={handleAddToCart}
              loading={isLoading}
              disabled={data.isOutOfStock}
              aria-label={data.isOutOfStock ? 'نفد من المخزون' : `إضافة ${data.name} للسلة`}
            >
              {data.isOutOfStock ? 'نفد' : '🛒 أضف'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}