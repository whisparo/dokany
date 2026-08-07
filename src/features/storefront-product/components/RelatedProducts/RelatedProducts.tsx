// src/features/storefront-product/components/RelatedProducts/RelatedProducts.tsx

import { ProductCard } from '@/components/shared/ProductCard/ProductCard';
import { adaptProductCard } from '@/components/shared/ProductCard/ProductCard.adapter';
import type { Product } from '@/types';

interface ComponentProps {
  products: Product[];
  storeSlug: string;
}

export function RelatedProducts({ products, storeSlug }: ComponentProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          data={adaptProductCard(product)}
          storeSlug={storeSlug}
        />
      ))}
    </div>
  );
}