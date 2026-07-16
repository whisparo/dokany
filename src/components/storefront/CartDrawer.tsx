// src/components/storefront/CartDrawer.tsx
"use client";

import React, { useEffect } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { useRouter, useParams } from 'next/navigation';
import { CartSheet } from './CartSheet';

export function CartDrawer() {
  const router = useRouter();
  const params = useParams();

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

  if (!isOpen) return null;

  const handleCheckout = () => {
    // 1. قفل السلة أولاً
    setIsOpen(false);
    
    // 2. محاولة قراءة اسم المتجر (Slug) من الـ params
    let storeSlug = (params?.storeSlug || params?.slug || params?.store) as string;
    
    // 3. لو الـ params فاضية (وده اللي بيحصل عندك وغالباً سبب المشكلة)، هنقرأ الرابط من المتصفح مباشرة
    if (!storeSlug && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      // لو الرابط: domains.com/my-store أو domains.com/my-store/products
      // أول جزء في الرابط (index 0) هو دايماً اسم المتجر
      if (pathParts[0] && pathParts[0] !== 'checkout') {
        storeSlug = pathParts[0];
      }
    }

    // 4. التوجيه لصفحة الدفع
    if (storeSlug) {
      // هيوديك لـ: /my-store/checkout
      router.push(`/${storeSlug}/checkout`);
    } else {
      // لو مفيش متجر خالص في الرابط، هيوديك لـ: /checkout
      router.push(`/checkout`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      {/* Backdrop (الخلفية المظلمة الشفافة) */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => setIsOpen(false)}
      />

      {/* السلة الرشيقة الإنجليزية المحدثة */}
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