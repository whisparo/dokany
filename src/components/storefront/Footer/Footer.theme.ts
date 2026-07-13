// src/components/storefront/Footer/Footer.theme.ts

import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/types/store';

interface FooterThemeProps {
  theme: ThemeTokens;
  className?: string;
}

export function getFooterTheme({ theme, className }: FooterThemeProps) {
  return {
    // 🌟 التعديل الساحر: حذفنا الـ border-t وحدود الألوان تماماً وزودنا المسافات (py-16) عشان يسيح بنعومة
    container: cn(
      // 🌟 أضفنا -mt-[1px] عشان نضمن لو الخط جاي من السكشن اللي فوقه يختفي وراه تماماً
      'w-full py-16 px-4 md:px-8 mt-auto -mt-[1px] select-none bg-transparent', 
      className
    ),
    
    // ✅ الـ Wrapper: سنترة المحتوى في مساحة الـ 7xl ودعم الـ RTL العربي صراحة
    innerWrapper: cn(
      'max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start',
      'flex-row-reverse' // 👈 قلب ترتيب الفليكس ليتناسب مع الاتجاه العربي
    ),
    
    // النصوص والروابط
    brandName: 'text-sm font-bold tracking-wide transition-all duration-300',
    copyright: 'text-xs font-medium text-slate-400 dark:text-slate-500 tracking-normal',
    linksContainer: 'flex items-center gap-6 text-xs font-medium text-slate-400 dark:text-slate-500'
  };
}