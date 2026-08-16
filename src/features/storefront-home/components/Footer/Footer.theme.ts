// src/components/storefront/Footer/Footer.theme.ts

import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/types/store';

interface FooterThemeProps {
  theme?: ThemeTokens & { storeName?: string }; // إدراج اسم المتجر ضمن الـ Tokens
  className?: string;
}

export function getFooterTheme({ theme, className }: FooterThemeProps = {}) {
  // استخراج اسم المحل من بيانات الثيم أو استخدام fallback
  const storeName = theme?.storeName || '';

  return {
    // البيانات الأساسية المرجعة للمكون
    storeName,

    // 🌟 السحر والنعومة: بدون حدود قاطعة، متجاوب، وسايح مع نهاية الصفحة
    container: cn(
      'w-full py-12 md:py-16 px-4 md:px-8 mt-auto -mt-[1px] select-none bg-transparent',
      className
    ),
    
    // ✅ الحاوية الداخلية: توزيع احترافي مع دعم RTL الموزون
    innerWrapper: cn(
      'max-w-7xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8',
      'text-center start:md:text-start'
    ),

    // ✅ قسم العلامة التجارية والحقوق
    brandSection: 'flex flex-col md:flex-row items-center gap-2 md:gap-4',
    brandName: cn(
      'text-sm md:text-base font-bold tracking-wide transition-all duration-300',
      'text-slate-900 dark:text-slate-100' // تأكيد وجود لون النص لاسم المحل
    ),
    copyright: 'text-xs font-medium text-slate-600 dark:text-slate-300 tracking-normal leading-relaxed',

    // ✅ روابط السياسات
    linksContainer: cn(
      'flex items-center justify-center gap-4 md:gap-6 text-xs font-medium',
      'text-slate-600 dark:text-slate-300'
    ),
    link: cn(
      'hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-1 py-0.5'
    ),

    // 🎯 "تم الإنشاء بواسطة"
    poweredBy: 'text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center justify-center end:md:justify-end gap-1.5 mt-1 md:mt-0',
  };
}