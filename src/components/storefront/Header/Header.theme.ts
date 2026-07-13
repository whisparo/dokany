// src/components/storefront/Header/Header.theme.ts

import type { ThemeTokens } from '@/types/store';

interface HeaderThemeProps {
  isScrolled: boolean;
  isEditorMode: boolean;
  theme: ThemeTokens;
}

export function getHeaderTheme({ isScrolled, isEditorMode, theme }: HeaderThemeProps) {
  // 🌟 رجعناها تعتمد على السكرول: شفاف في الأول، وزجاجي ناعم لما تسكرول وتحرك الصفحة
  const containerStyles = {
    backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.75)" : "transparent",
    fontFamily: theme?.fontFamily,
    borderColor: isScrolled ? "rgba(255, 255, 255, 0.2)" : "transparent",
  };

  // 🌟 التعديل الصح: رجعنا الـ "fixed top-0 left-0 right-0" عشان يخرج ويتحرك مع السكرول بحرية
  const containerClasses = `z-50 transition-all duration-300 px-4 md:px-8 flex items-center justify-between ${
    isEditorMode ? "relative" : "fixed top-0 left-0 right-0"
  } ${
    isScrolled 
      ? "py-2 shadow-sm backdrop-blur-md border-b border-white/20" 
      : "py-3 bg-transparent border-b-0"
  }`;

  return {
    container: containerClasses,
    containerStyles,
    innerWrapper: "max-w-7xl mx-auto w-full flex items-center justify-between flex-row-reverse",
    storeName: "text-lg md:text-xl font-black tracking-wide cursor-pointer transition-all duration-300",
    cartButton: "relative p-2 rounded-full transition-all bg-slate-900/5 border border-slate-950/0 hover:border-slate-950/10 hover:bg-slate-900/10",
    cartBadge: "absolute -top-1 -left-1 text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold shadow-sm"
  };
}