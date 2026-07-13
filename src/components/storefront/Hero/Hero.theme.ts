// src/components/storefront/Hero/Hero.theme.ts

import { cn } from '@/lib/utils';

interface ThemeProps {
  variant: 'default' | 'centered' | 'split';
  hasImage: boolean;
}

export function getHeroTheme({ variant, hasImage }: ThemeProps) {
  return {
    // ✅ 1. الحاوية الرئيسية: حواف حادة تماماً، ممتدة w-full، و pt-28 عشان ينزل تحت الهيدر بروقان
    container: cn(
      'relative z-10 overflow-hidden w-full', 
      'pt-28 pb-16 sm:pb-20 md:pb-24 lg:pb-28 px-4 sm:px-8 md:px-16 lg:px-24', // 👈 pt-28 نزلت الهيرو بالملي
      'transition-all duration-500 ease-out',
      
      variant === 'centered' && 'text-center flex flex-col items-center justify-center',
      variant === 'split' && 'flex flex-col lg:flex-row items-center gap-10 text-start justify-between',
      
      // ارتفاع محترم يخلي الهيرو مالي الشاشة وفخم
      'min-h-[60vh] lg:min-h-[75vh]'
    ),
    
    // ✅ 2. الخلفية: ممتدة بالكامل في الـ absolute بدون أي قيود
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
    
    // ✅ 4. العنوان الملكي
    title: cn(
      'mb-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.2]',
      'text-slate-900 dark:text-slate-50',
      variant === 'centered' && 'mx-auto'
    ),
    
    // ✅ 5. الوصف
    description: cn(
      'text-slate-500 dark:text-slate-400',
      'text-sm sm:text-base lg:text-lg',
      'leading-relaxed font-medium',
      variant === 'centered' && 'mx-auto'
    ),
    
    // ✅ 6. حاوية الصورة (شيلنا rounded-2xl والـ Borders عشان تطلع حادة شفرة)
    imageWrapper: cn(
      'relative overflow-hidden z-10', // 👈 شيلنا الـ rounded والـ Shadow عشان تندمج حادة
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
    
    // ✅ 9. زر الـ CTA
    ctaButton: cn(
      'rounded-xl px-6 sm:px-8 h-11 sm:h-12 text-xs sm:text-sm font-bold',
      'bg-primary-600 text-white shadow-md shadow-primary-600/10',
      'transition-all duration-300 ease-out',
      'hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/20 active:scale-[0.98]',
      'dark:bg-primary-500 dark:hover:bg-primary-600'
    ),
    
    // ✅ 10. الـ Overlay
    overlay: cn(
      'absolute inset-0 z-0',
      'bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent'
    ),
  };
}