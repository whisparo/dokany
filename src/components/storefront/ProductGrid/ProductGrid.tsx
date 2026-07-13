// src/components/storefront/ProductGrid/ProductGrid.tsx

import Link from 'next/link';
import { RotateCcw, ArrowLeft, PackageX } from 'lucide-react'; // أيقونات هندسية بريميوم بدلاً من الإيموجي
import { ProductCard } from '../ProductCard';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';
import { getProductGridTheme } from './ProductGrid.theme';
import type { ProductGridAdapterResult } from './ProductGrid.adapter';
import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع
// ============================================================
export interface ProductGridProps {
  data: ProductGridAdapterResult;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  showAddToCart?: boolean;
  showRating?: boolean;
  title?: string;
  description?: string;
  viewAllHref?: string;
  viewAllText?: string;
  className?: string;
}

// ============================================================
// 🧠 المكون الرئيسي (Server Component)
// ============================================================
export function ProductGrid({
  data,
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

  // ✅ 1. الـ Empty State الفاخر والمحصن
  if (!products || products.length === 0) {
    return (
      <div 
        className={theme.emptyState.container}
        data-testid="product-grid-empty"
        dir="rtl"
      >
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
              <Link href={viewAllHref}>تصفح المجموعات الأخرى</Link>
            </Button>
          )}
          <LocalReloadButton />
        </div>
      </div>
    );
  }

  return (
    <section 
      aria-label={title || 'قائمة المنتجات'}
      data-testid="product-grid"
      className="w-full"
      dir="rtl" // 👈 تدبيس التوجيه من اليمين إلى اليسار صراحة هنا لمنع عشوائية المتصفحات
    >
      {/* ✅ 2. الـ Header (دعم الـ RTL بالأيقونات الهندسية الناعمة) */}
      {(title || description || viewAllHref) && (
        <div className={theme.header.container}>
          <div className="text-start"> {/* تأمين محاذاة النص لليمين صراحة */}
            {title && (
              <Typography variant="h2" className={theme.header.title}>
                {title}
              </Typography>
            )}
            {description && (
              <Typography 
                variant="body1" 
                className={theme.header.description}
              >
                {description}
              </Typography>
            )}
          </div>
          
          {viewAllHref && (
            <Button 
              variant="ghost" 
              asChild 
              className={theme.header.viewAllButton}
            >
              <Link href={viewAllHref} className="flex items-center gap-1">
                {viewAllText}
                {/* قلب اتجاه حركة السهم ليتحرك لليمين (العربي) في الـ Hover بدلاً من اليسار */}
                <ArrowLeft size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* ✅ 3. الـ Grid (توزيع مصفوف من اليمين إلى اليسار تلقائياً بناءً على الـ dir) */}
      <div 
        className={cn(theme.container, "text-right")} 
        role="list"
        aria-label={`${products.length} منتج`}
      >
        {products.map((product, index) => (
          <div key={product.id} role="listitem" className="w-full">
            <ProductCard
              data={product}
              showAddToCart={showAddToCart}
              showRating={showRating}
              priority={index < 2}
              index={index}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* ✅ 4. الـ Footer الـ متطابق بالملي مع داتا الأدابتر الجديدة */}
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

// ============================================================
// 🔄 مكوّن فرعي داخلي وآمن للـ Client-Side Action
// ============================================================
function LocalReloadButton() {
  return (
    <Button 
      variant="ghost" 
      size="sm"
      className="rounded-xl h-9 text-xs flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }}
    >
      <RotateCcw size={14} />
      إعادة المحاولة
    </Button>
  );
}