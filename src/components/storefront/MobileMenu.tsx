// src/components/storefront/MobileMenu.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/shared/Button';
import { CartCounter } from './CartCounter';

interface MobileMenuProps {
  storeSlug: string;
  storeName: string;
}

export function MobileMenu({ storeSlug, storeName }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  // ✅ غلق القائمة تلقائياً لو الشاشة كبرت لمنع الـ Layout Bugs
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md breakpoint
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="md:hidden">
      {/* ✅ زر فتح القائمة - ممسوك بـ SVGs صرفة خفيفة جداً */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        aria-expanded={isOpen}
        className="relative z-50 text-foreground"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </Button>
      
      {/* ✅ القائمة المنسدلة - معزولة ومحسنة مع الـ Backdrop blur */}
      {isOpen && (
        <div 
          className="absolute top-14 start-0 end-0 z-40 border-b border-border bg-background/95 backdrop-blur-md shadow-lg transition-all duration-200"
          role="navigation"
          aria-label="قائمة الجوال"
        >
          <nav className="px-4 py-4 space-y-1">
            <Link
              href={`/${storeSlug}/products`}
              className="block rounded-md px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted hover:text-primary-600"
              onClick={() => setIsOpen(false)}
            >
              المنتجات
            </Link>
            
            <Link
              href={`/${storeSlug}/cart`}
              className="flex items-center justify-between rounded-md px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted hover:text-primary-600"
              onClick={() => setIsOpen(false)}
              aria-label="عرض سلة التسوق"
            >
              <span className="flex items-center gap-2.5">
                {/* SVG أيقونة السلة الفيجوال الصرفة */}
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <span>السلة</span>
              </span>
              <CartCounter />
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}