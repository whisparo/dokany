// src/components/storefront/ProductGrid/ProductGrid.tsx
// ❌ احذف السطر 'use client'; من أول الملف
import Link from 'next/link';
import { ArrowLeft, PackageX } from 'lucide-react';
import { ProductCard } from '../ProductCard';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';
import { getProductGridTheme } from './ProductGrid.theme';
import type { ProductGridAdapterResult } from './ProductGrid.adapter';
import { cn } from '@/lib/utils';
import { LocalReloadButton } from './LocalReloadButton'; // ✅ استورد الزر

export interface ProductGridProps {
  data: ProductGridAdapterResult;
  storeSlug: string;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  showAddToCart?: boolean;
  showRating?: boolean;
  title?: string;
  description?: string;
  viewAllHref?: string;
  viewAllText?: string;
  className?: string;
}

export function ProductGrid({
  data,
  storeSlug,
  columns = 4,
  showAddToCart = true,
  showRating = true,
  title,
  description,
  viewAllHref,
  viewAllText = 'عرض الكل',
  className,
}: ProductGridProps) {
  const theme = getProductGridTheme({ columns, className });
  const { products, ...pagination } = data;

  if (!products || products.length === 0) {
    return (
      <div className={theme.emptyState.container} data-testid="product-grid-empty" dir="rtl">
        <div className="mb-4 text-slate-300 dark:text-slate-700" aria-hidden="true">
          <PackageX className={theme.emptyState.icon} size={48} strokeWidth={1.5} />
        </div>
        <Typography variant="h3" className={theme.emptyState.title}>
          لا توجد منتجات حالياً
        </Typography>
        <Typography variant="body1" className={theme.emptyState.description}>
          لم نجد أي منتجات تطابق خياراتك، أو ربما لم يتم إضافة منتجات بعد.
        </Typography>
        <div className={theme.emptyState.actions}>
          {viewAllHref && (
            <Button variant="outline" className="rounded-xl h-9 text-xs" asChild>
              <Link href={viewAllHref}>
                <span>تصفح المجموعات الأخرى</span>
              </Link>
            </Button>
          )}
          <LocalReloadButton /> {/* ✅ استخدم المكون المستخرج */}
        </div>
      </div>
    );
  }

  return (
    <section aria-label={title || 'قائمة المنتجات'} data-testid="product-grid" className="w-full" dir="rtl">
      {(title || description || viewAllHref) && (
        <div className={theme.header.container}>
          <div className="text-start">
            {title && <Typography variant="h2" className={theme.header.title}>{title}</Typography>}
            {description && <Typography variant="body1" className={theme.header.description}>{description}</Typography>}
          </div>
          {viewAllHref && (
            <Button variant="ghost" asChild className={theme.header.viewAllButton}>
              <Link href={viewAllHref}>
                <span className="flex items-center gap-1">
                  {viewAllText}
                  <ArrowLeft size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </Link>
            </Button>
          )}
        </div>
      )}
      <div className={cn(theme.container, "text-right")} role="list" aria-label={`${products.length} منتج`}>
        {products.map((product, index) => (
          <div key={product.id} role="listitem" className="w-full">
            <ProductCard
              data={product}
              storeSlug={storeSlug}
              showAddToCart={showAddToCart}
              showRating={showRating}
              priority={index < 2}
              index={index}
              className="w-full"
            />
          </div>
        ))}
      </div>
      {products.length > 0 && pagination && (
        <div className={theme.footer.container}>
          <Typography variant="caption" className={theme.footer.text}>
            عرض {products.length} من {pagination.total} منتج
          </Typography>
        </div>
      )}
    </section>
  );
}