// src/components/storefront/CartDrawer.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { useRouter, useParams } from 'next/navigation';
import { CartSheet } from './CartSheet';

export function CartDrawer() {
  const router = useRouter();
  const params = useParams();

  // ⚡ منع الـ Hydration Mismatch عبر التأكد من تحميل الكلاينت أولاً
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isOpen = useCartStore((state) => state.isOpen);
  const setIsOpen = useCartStore((state) => state.setIsOpen);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const totalPrice = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const totalItemsCount = items.reduce((total, item) => total + item.quantity, 0);

  // قفل السكرول في الخلفية عند فتح السلة
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  // ⛔ عدم رندرة أي شيء إلا بعد اكتمال الـ Mount في الكلاينت
  if (!hasMounted || !isOpen) return null;

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