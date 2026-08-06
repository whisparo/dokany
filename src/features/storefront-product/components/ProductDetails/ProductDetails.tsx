// src/components/storefront/ProductDetails/ProductDetails.tsx
'use client';

import { useState } from 'react';
import { Star, ShieldCheck, Truck } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import { getProductDetailsTheme } from './ProductDetails.theme';
import { ProductMedia } from './ProductMedia';
import { ProductVariants, MOCK_COLORS, MOCK_SIZES } from './ProductVariants';
import { ProductActions } from './ProductActions';
import type { ProductDetailsAdapterResult } from './ProductDetails.adapter';
import { cn } from '@/lib/utils';

export interface ProductDetailsProps {
  data: ProductDetailsAdapterResult;
  className?: string;
}

export function ProductDetails({ data, className }: ProductDetailsProps) {
  // 🎨 حالات المتغيرات الموحدة في الأب لتسهيل تمريرها
  const [selectedColor, setSelectedColor] = useState(MOCK_COLORS[0].id);
  const [selectedSize, setSelectedSize] = useState(MOCK_SIZES[0].id);

  const theme = getProductDetailsTheme({
    isOutOfStock: data.isOutOfStock,
    hasMultipleMedia: data.mediaGallery.length > 1,
  });

  return (
    <div className={cn(theme.container, className)}>
      
      {/* 📸 1. قسم الميديا (معرض الصور والفيديو والـ Zoom) */}
      <ProductMedia data={data} theme={theme} />

      {/* 📄 2. قسم التفاصيل والشراء */}
      <div className={theme.contentSection}>
        {/* القسم أو التصنيف */}
        {data.category && (
          <div>
            <span className={theme.category}>{data.category}</span>
          </div>
        )}

        {/* عنوان المنتج */}
        <Typography variant="h1" className={theme.title}>
          {data.name}
        </Typography>

        {/* التقييمات */}
        {data.rating && (
          <div className={theme.rating}>
            <div className={theme.ratingStars}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'h-4 w-4',
                    i < Math.floor(data.rating!) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className={theme.ratingCount}>
              {data.rating} ({data.reviewCount || 0} تقييم)
            </span>
          </div>
        )}

        {/* الأسعار */}
        <div className={theme.priceSection}>
          <span className={theme.price}>{data.formattedPrice}</span>
          {data.formattedOriginalPrice && (
            <span className={theme.originalPrice}>{data.formattedOriginalPrice}</span>
          )}
          {data.discountPercentage && (
            <span className={theme.discountLabel}>وفر {data.discountPercentage}%</span>
          )}
        </div>

        {/* 🎨 3. قسم خيارات الألوان والمقاسات (Variants) */}
        {!data.isOutOfStock && (
          <ProductVariants
            theme={theme}
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            selectedSize={selectedSize}
            setSelectedSize={setSelectedSize}
          />
        )}

        {/* الوصف */}
        <Typography variant="body1" className={theme.description}>
          {data.description}
        </Typography>

        {/* المواصفات الفنية */}
        {data.specs && data.specs.length > 0 && (
          <div className={theme.specsSection}>
            {data.specs.map((spec, index) => (
              <div key={index} className={theme.specCard}>
                <span className={theme.specLabel}>{spec.label}</span>
                <span className={theme.specValue}>{spec.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ⚡ 4. قسم الإجراءات (الكمية وإضافة للسلة الفورية) */}
        <ProductActions
          data={data}
          theme={theme}
          selectedColor={selectedColor}
          selectedSize={selectedSize}
        />

        {/* شارات الأمان والثقة */}
        <div className={theme.meta}>
          <div className={theme.metaRow}>
            <Truck className={theme.metaIcon} />
            <span className={theme.metaText}>شحن سريع وآمن إلى جميع المحافظات</span>
          </div>
          <div className={theme.metaRow}>
            <ShieldCheck className={theme.metaIcon} />
            <span className={theme.metaText}>ضمان جودة المنتج 100% وإمكانية الفحص عند الاستلام</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 🎨 Skeleton (حالة التحميل الفاخرة)
// ============================================================
export function ProductDetailsSkeleton({ className }: { className?: string }) {
  const theme = getProductDetailsTheme({
    isOutOfStock: false,
    hasMultipleMedia: true,
  });

  return (
    <div className={cn(theme.skeleton.container, className)}>
      <div className={theme.skeleton.image} aria-hidden="true" />
      <div className={theme.skeleton.content}>
        <div className={theme.skeleton.title} />
        <div className={theme.skeleton.price} />
        <div className={theme.skeleton.specs}>
          <div className={theme.skeleton.spec} />
          <div className={theme.skeleton.spec} />
        </div>
        <div className="space-y-2.5">
          <div className={theme.skeleton.description} />
          <div className={theme.skeleton.description} style={{ width: '85%' }} />
        </div>
        <div className={theme.skeleton.button} />
      </div>
    </div>
  );
}