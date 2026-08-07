'use client';

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import Button from '@/components/shared/Button';
import { useCartStore } from '@/stores/cart-store';
import type { ProductCardAdapterResult } from '@/components/shared/ProductCard/ProductCard.adapter';

interface AddToCartButtonProps {
  data: ProductCardAdapterResult;
  variant?: 'default' | 'compact' | 'horizontal';
}

export default function AddToCartButton({ data, variant = 'default' }: AddToCartButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (data.isOutOfStock || isLoading) return;

    setIsLoading(true);
    try {
      addItem({
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

  if (variant === 'compact') {
    return (
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
    );
  }

  if (variant === 'horizontal') {
    return (
      <Button
        variant="primary"
        size="sm"
        onClick={handleAddToCart}
        loading={isLoading}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold"
      >
        🛒 إضافة
      </Button>
    );
  }

  return (
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
        className="flex sm:hidden rounded-xl h-8 w-8 p-0 items-center justify-center bg-slate-900 text-white border-none active:scale-95"
        onClick={handleAddToCart}
        loading={isLoading}
        aria-label="إضافة للسلة"
      >
        <ShoppingCart className="h-4 w-4" />
      </Button>
    </>
  );
}