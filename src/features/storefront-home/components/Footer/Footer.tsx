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

  const currentYear = new Date().getFullYear();
  const displayCopyright = copyrightText || `جميع الحقوق محفوظة © ${currentYear} ${storeName || ''}`;

  return (
    <footer 
      className={footerTheme.container}
      style={{ fontFamily: theme?.fontFamily }}
      dir="rtl"
      data-testid="storefront-footer"
    >
      <div className={footerTheme.innerWrapper}>
        
        {/* 1. الجانب الأيمن: اسم المتجر + حقوق الملكية */}
        <div className={footerTheme.brandSection}>
          {storeName && (
            <span 
              className={footerTheme.brandName}
              style={{ color: theme?.colors?.primary ?? '#D4AF37' }}
            >
              {storeName}
            </span>
          )}
          <p className={footerTheme.copyright}>
            {displayCopyright}
          </p>
        </div>

        {/* 2. الجانب الأيسر: روابط السياسات + صُنِع بواسطة دكاني */}
        <div className="flex flex-col items-center md:items-end gap-3">
          <nav className={footerTheme.linksContainer} aria-label="روابط الفوتر القانونية">
            <Link 
              href="/privacy" 
              className={footerTheme.link}
              aria-label="عرض سياسة الخصوصية"
            >
              سياسة الخصوصية
            </Link>
            <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
            <Link 
              href="/terms" 
              className={footerTheme.link}
              aria-label="عرض شروط الخدمة"
            >
              شروط الخدمة
            </Link>
          </nav>

          {/* ⚡ توقيع منصة دكاني الراقي */}
          <div className={footerTheme.poweredBy}>
            <span>تم الإنشاء بواسطة</span>
            <a 
              href="https://dokkani.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-bold text-slate-700 dark:text-slate-300 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors"
            >
              دكاني⚡
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}