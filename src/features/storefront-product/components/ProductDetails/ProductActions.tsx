'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingCart, Check, AlertCircle } from 'lucide-react';
import Button from '@/components/shared/Button';
import { useCartStore } from '@/stores/cart-store';
import { MOCK_COLORS, MOCK_SIZES } from './ProductVariants';
import type { ProductDetailsAdapterResult } from './ProductDetails.adapter';

interface ProductActionsProps {
  data: ProductDetailsAdapterResult;
  theme: any;
  selectedColor: string;
  selectedSize: string;
}

export function ProductActions({ data, theme, selectedColor, selectedSize }: ProductActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

  // استدعاء الـ Store بأعلى فاعلية
  const addItem = useCartStore((state) => state.addItem);
  // 👈 قمنا بحذف setIsOpen لمنع السلة من الفتح تلقائياً عند الضغط

  const increaseQuantity = () => {
    if (quantity < data.stock) {
      setQuantity((prev) => prev + 1);
    }
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const handleAddToCart = async () => {
    if (data.isOutOfStock) return;

    try {
      const colorName = MOCK_COLORS.find((c) => c.id === selectedColor)?.name || '';
      const sizeValue = MOCK_SIZES.find((s) => s.id === selectedSize)?.value || '';
      const fullName = `${data.name} - ${colorName} / ${sizeValue}`;

      // 1. إضافة المنتج للمخزن (الـ Store)
      addItem({
        productId: data.id,
        variantId: `${selectedColor}-${selectedSize}`,
        name: fullName,
        price: data.price,
        image: data.mainMedia.url,
        maxStock: data.stock,
        quantity: quantity,
      });

      // 2. تفعيل حالة النجاح البصرية على الزر فقط
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);

    } catch (error) {
      console.error('[ProductActions] Failed to add to cart:', error);
    }
  };

  return (
    <div className={theme.actions}>
      {/* كبسولة الكمية */}
      <div className="flex flex-col gap-2">
        <span className={theme.quantityLabel}>الكمية المطلوبة:</span>
        <div className={theme.quantityWrapper}>
          <button
            type="button"
            onClick={decreaseQuantity}
            disabled={quantity <= 1 || data.isOutOfStock}
            className={theme.quantityBtn}
            aria-label="تقليل الكمية"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className={theme.quantityInput} aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={increaseQuantity}
            disabled={quantity >= data.stock || data.isOutOfStock}
            className={theme.quantityBtn}
            aria-label="زيادة الكمية"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* زر السلة الأنيق */}
      <Button
        type="button"
        className={theme.addToCartButton}
        onClick={handleAddToCart}
        disabled={data.isOutOfStock}
      >
        {data.isOutOfStock ? (
          <span className="flex items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5" />
            غير متوفر حالياً
          </span>
        ) : isAdded ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="h-5 w-5 animate-bounce" />
            تمت الإضافة بنجاح!
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            إضافة إلى السلة • {data.formattedPrice}
          </span>
        )}
      </Button>
    </div>
  );
}