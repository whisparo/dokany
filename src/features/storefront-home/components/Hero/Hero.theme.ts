// src/components/storefront/Hero/Hero.theme.ts

import { cn } from '@/lib/utils';

interface ThemeProps {
  variant: 'default' | 'centered' | 'split';
  hasImage: boolean;
}

export function getHeroTheme({ variant, hasImage }: ThemeProps) {
  return {
    // ✅ 1. الحاوية الرئيسية
    container: cn(
      'relative z-10 overflow-hidden w-full', 
      'pt-28 pb-16 sm:pb-20 md:pb-24 lg:pb-28 px-4 sm:px-8 md:px-16 lg:px-24',
      'transition-all duration-500 ease-out',
      
      variant === 'centered' && 'text-center flex flex-col items-center justify-center',
      variant === 'split' && 'flex flex-col lg:flex-row items-center gap-10 text-start justify-between',
      
      'min-h-[60vh] lg:min-h-[75vh]'
    ),
    
    // ✅ 2. الخلفية
    background: cn(
      'absolute inset-0 -z-10 bg-gradient-to-br',
      variant === 'centered' && 'from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-900',
      variant === 'split' && 'from-slate-100 via-slate-50/80 to-white dark:from-slate-900/90 dark:via-slate-950/70 dark:to-slate-900',
      variant === 'default' && 'from-slate-50 via-white to-white dark:from-slate-900/50 dark:via-slate-950 dark:to-slate-950'
    ),
    
    // ✅ 3. حاوية المحتوى
    content: cn(
      'relative z-10 w-full',
      variant === 'centered' && 'mx-auto max-w-2xl',
      variant === 'split' && 'flex-1 max-w-xl'
    ),
    
    // ✅ 4. العنوان الملكي (تم تعزيز تباين النص الفاتح)
    title: cn(
      'mb-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.2]',
      'text-slate-950 dark:text-slate-100', // 🎨 رفع التباين من 900 إلى 950
      variant === 'centered' && 'mx-auto'
    ),
    
    // 🎯 5. الوصف واسم المتجر (رفع التباين من slate-500/400 إلى slate-700/300)
    description: cn(
      'text-slate-700 dark:text-slate-300',
      'text-sm sm:text-base lg:text-lg',
      'leading-relaxed font-medium',
      variant === 'centered' && 'mx-auto'
    ),
    
    // ✅ 6. حاوية الصورة
    imageWrapper: cn(
      'relative overflow-hidden z-10',
      'transition-all duration-500 ease-out',
      variant === 'split' && 'w-full lg:w-1/2 aspect-[4/3] lg:max-w-lg'
    ),
    
    // ✅ 7. الصورة نفسها
    image: cn(
      'object-cover w-full h-full'
    ),
    
    // ✅ 8. حاوية زر الـ CTA
    cta: cn(
      'mt-6 sm:mt-8',
      variant === 'centered' && 'w-full flex justify-center'
    ),
    
    // ✅ 9. زر الـ CTA (رفع درجة اللون لضمان تباين أعلى للنص الأبيض)
    ctaButton: cn(
      'rounded-xl px-6 sm:px-8 h-11 sm:h-12 text-xs sm:text-sm font-bold',
      'bg-primary-700 text-white shadow-md shadow-primary-700/10',
      'transition-all duration-300 ease-out',
      'hover:bg-primary-800 hover:shadow-lg hover:shadow-primary-700/20 active:scale-[0.98]',
      'dark:bg-primary-600 dark:hover:bg-primary-500'
    ),
    
    // ✅ 10. الـ Overlay
    overlay: cn(
      'absolute inset-0 z-0',
      'bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent'
    ),
  };
}