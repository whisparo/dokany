// src/components/storefront/Header/Header.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { getHeaderTheme } from './Header.theme';
import type { HeaderAdapterResult } from './Header.adapter';
import { useCartStore } from '@/stores/cart-store';
// 🚀 استيراد العداد الذكي والمستقل اللي عندك
import { CartCounter } from '../CartCounter'; 

export interface HeaderProps {
  payload: HeaderAdapterResult;
  onCartClick?: () => void;
}

export function Header({ payload, onCartClick }: HeaderProps) {
  const { storeName, theme, isEditorMode } = payload;
  const [isScrolled, setIsScrolled] = useState(false);
  
  const toggleCart = useCartStore((state) => state.toggleCart);
  const setIsOpen = useCartStore((state) => state.setIsOpen);

  // مراقبة السكرول
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headerTheme = getHeaderTheme({ isScrolled, isEditorMode, theme });

  const handleCartPress = () => {
    if (onCartClick) {
      onCartClick();
    } else if (toggleCart) {
      toggleCart();
    } else if (setIsOpen) {
      setIsOpen(true);
    }
  };

  return (
    <header className={headerTheme.container} style={headerTheme.containerStyles}>
      <div className={headerTheme.innerWrapper}>
        
        {/* اسم المتجر */}
        <div className="flex items-center">
          <span 
            className={headerTheme.storeName}
            style={{ color: theme?.colors?.primary ?? "#D4AF37" }}
          >
            {storeName}
          </span>
        </div>

        {/* زر السلة مع العداد الذكي */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleCartPress}
            className="relative p-2.5 rounded-full transition-all duration-300 flex items-center justify-center bg-black/10 border border-white/20 hover:bg-black/15 shadow-sm"
            style={{ color: theme?.colors?.primary ?? "#D4AF37" }}
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
            </svg>
            
            {/* 🌟 استدعاء العداد هنا مباشرة - هو هيتصرف ويظهر فقط لو فيه منتجات وبدون أخطاء ريندر */}
            <CartCounter />
          </button>
        </div>

      </div>
    </header>
  );
}