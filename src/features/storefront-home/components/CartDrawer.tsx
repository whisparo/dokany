// src/components/storefront/CartDrawer.tsx
"use client";

import React, { useEffect } from 'react';
import { 
  useCartStore, 
  useCartItems, 
  useCartTotal, 
  useCartCount, 
  useIsCartReady 
} from '@/stores/cart-store';
import { useRouter, useParams } from 'next/navigation';
import { CartSheet } from './CartSheet';

export function CartDrawer() {
  const router = useRouter();
  const params = useParams();

  // ⚡ استخدام جاهزية الـ Store للـ Hydration بدلاً من local state يدوي
  const isReady = useIsCartReady();

  // 🎯 استدعاء الـ Actions والـ Selectors المجهزة والمحسنة للأداء
  const isOpen = useCartStore((state) => state.isOpen);
  const setIsOpen = useCartStore((state) => state.setIsOpen);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  // 🚀 استخدام المخرجات المحسنة مسبقاً لمنع العمليات الحسابية المكررة في كل Re-render
  const items = useCartItems();
  const totalPrice = useCartTotal();
  const totalItemsCount = useCartCount();

  // 🔒 قفل السكرول في الخلفية عند فتح السلة بأمان
  useEffect(() => {
    if (!isOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalDocOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocOverflow;
    };
  }, [isOpen]);

  // ⛔ عدم رندرة أي شيء إلا بعد اكتمال الـ Hydration وفتح السلة
  if (!isReady || !isOpen) return null;

  const handleCheckout = () => {
    setIsOpen(false);

    let storeSlug = (params?.storeSlug || params?.slug || params?.store) as string;

    if (!storeSlug && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts[0] && pathParts[0] !== 'checkout') {
        storeSlug = pathParts[0];
      }
    }

    if (storeSlug) {
      router.push(`/${storeSlug}/checkout`);
    } else {
      router.push(`/checkout`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => setIsOpen(false)}
      />

      <CartSheet
        items={items}
        totalPrice={totalPrice}
        totalItemsCount={totalItemsCount}
        onClose={() => setIsOpen(false)}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onCheckout={handleCheckout}
      />
    </div>
  );
}

// ✅ إضافة export default لحل مشكلة Next Dynamic Import والـ Type Checking
export default CartDrawer;