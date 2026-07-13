// src/components/storefront/Footer/Footer.adapter.ts

import type { Store } from '@/types';
import type { ThemeTokens } from '@/types/store';

export interface FooterAdapterResult {
  storeName: string;
  currentYear: string;
  theme: ThemeTokens;
  copyrightText: string;
}

export interface FooterAdapterOptions {
  customTheme?: ThemeTokens;
}

/**
 * ✅ أدابتر الفوتر السيادي: تأمين داتا القاع وحساب حقوق الملكية ديناميكياً
 */
export function adaptFooter(
  store: Store,
  options: FooterAdapterOptions = {}
): FooterAdapterResult {
  if (!store || !store.name) {
    throw new Error('[FooterAdapter] Store data is required for footer context');
  }

  const { customTheme } = options;
  const currentYear = new Date().getFullYear().toString();

  const defaultTheme: ThemeTokens = {
    fontFamily: 'var(--font-geist-sans)',
    colors: {
      primary: '#D4AF37',
      background: '#0A0A0A',
      text: '#94A3B8', // رمادي ناعم مريح للعين في الأسفل
    }
  };

  return {
    storeName: store.name.trim(),
    currentYear,
    theme: customTheme || store.theme || defaultTheme,
    copyrightText: `جميع الحقوق محفوظة لـ ${store.name.trim()} © ${currentYear}`,
  };
}