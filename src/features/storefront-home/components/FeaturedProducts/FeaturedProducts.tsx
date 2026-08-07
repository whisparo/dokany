// features/storefront-home/components/FeaturedProducts/FeaturedProducts.tsx
import { ProductGrid } from '@/components/shared/ProductGrid';
import { adaptProductGrid } from '@/components/shared/ProductGrid/ProductGrid.adapter';
import type { Product } from '@/types';

interface FeaturedProductsProps {
  products: Product[];
  storeSlug: string;
  currency?: string;
  title?: string;
  description?: string;
  viewAllHref?: string;
}

export function FeaturedProducts({
  products,
  storeSlug,
  currency = 'EGP',
  title = 'منتجات مميرة',
  description,
  viewAllHref,
}: FeaturedProductsProps) {
  if (!products || products.length === 0) return null;

  // تحويل المنتجات باستخدام adaptProductGrid الصريح الخاص بك
  const gridData = adaptProductGrid(products, currency, {
    page: 1,
    limit: products.length,
    totalCountFromDB: products.length,
  });

  return (
    <ProductGrid
      data={gridData}
      storeSlug={storeSlug}
      title={title}
      description={description}
      viewAllHref={viewAllHref}
      columns={4}
      showAddToCart={true}
    />
  );
}