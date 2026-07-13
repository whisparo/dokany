// src/components/storefront/Header/Header.adapter.ts

import type { Store, ThemeTokens } from '@/types/store'; // 👈 سحبنا التوكنز والستور مركزياً من ملف المتجر

export interface HeaderAdapterResult {
  storeName: string;
  theme: ThemeTokens;
  isEditorMode: boolean;
}

export interface HeaderAdapterOptions {
  isEditorMode?: boolean;
  customTheme?: ThemeTokens;
}

/**
 * ✅ محول بيانات الهيدر الملكي لتأمين تدرج الألوان والتوكنز ومنع الـ Runtime Errors
 */
export function adaptHeader(
  store: Store,
  options: HeaderAdapterOptions = {}
): HeaderAdapterResult {
  if (!store || !store.name) {
    throw new Error('[HeaderAdapter] Store identity fields are required');
  }

  const { isEditorMode = false, customTheme } = options;

  const defaultTheme: ThemeTokens = {
    fontFamily: 'var(--font-geist-sans)',
    colors: {
      primary: '#D4AF37',
      background: '#0A0A0A',
      text: '#F5F5F5',
      accent: '#D4AF37'
    }
  };

  return {
    storeName: store.name.trim(),
    theme: customTheme || store.theme || defaultTheme,
    isEditorMode,
  };
}