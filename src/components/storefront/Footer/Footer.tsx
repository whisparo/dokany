// src/components/storefront/Footer/Footer.tsx

import React from 'react';
import Link from 'next/link';
import { getFooterTheme } from './Footer.theme';
import type { FooterAdapterResult } from './Footer.adapter';

export interface FooterProps {
  payload: FooterAdapterResult;
  className?: string;
}

export function Footer({ payload, className }: FooterProps) {
  const { storeName, theme, copyrightText } = payload;
  const footerTheme = getFooterTheme({ theme, className });

  return (
    <footer 
      className={footerTheme.container}
      style={{ fontFamily: theme?.fontFamily }}
      dir="rtl" // 👈 تأمين التوجيه العربي الصريح لمنع بعثرة المتصفح في القاع
      data-testid="storefront-footer"
    >
      <div className={footerTheme.innerWrapper}>
        
        {/* 1. يمين الفوتر: حقوق الملكية الفخمة */}
        <div className={footerTheme.copyright}>
          {copyrightText}
        </div>

        {/* 2. شمال الفوتر: اسم المتجر مع روابط تصفح سريعة وناعمة */}
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
          <span 
            className={footerTheme.brandName}
            style={{ color: theme?.colors?.primary ?? '#D4AF37' }}
          >
            {storeName}
          </span>
          
          <nav className={footerTheme.linksContainer} aria-label="روابط الفوتر">
            <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              سياسة الخصوصية
            </Link>
            <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              شروط الخدمة
            </Link>
          </nav>
        </div>

      </div>
    </footer>
  );
}