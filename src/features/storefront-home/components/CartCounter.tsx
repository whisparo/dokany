// src/components/storefront/CartCounter.tsx
'use client';

import { useEffect, useState } from 'react';
import { useCartStore } from '@/stores/cart-store';

export function CartCounter() {
  const [mounted, setMounted] = useState(false);
  const count = useCartStore((state) => state.totalQuantity);

  // ✅ ننتظر حتى يتم عمل Mount للمكون على الـ Client لضمان مطابقة الـ SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // لمنع الـ Hydration Mismatch: نرجع null في أول ريندر (السيرفر وأول لقطة عميل)
  if (!mounted || count === 0) return null;

  return (
    <span 
      className="absolute -top-1.5 -end-1.5 flex h-4.5 w-4.5 animate-in fade-in zoom-in-95 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white ring-2 ring-background select-none"
      aria-label={`${count} منتج في السلة`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}