// src/components/storefront/ProductCard/ProductCard.theme.ts

import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع
// ============================================================
interface ThemeProps {
  variant: 'default' | 'compact' | 'horizontal';
  isOutOfStock: boolean;
}

// ============================================================
// 🎨 الـ Theme الرئيسي الموحد (Sharp Bottom & Equal Height Edition)
// ============================================================
export function getProductCardTheme({ variant, isOutOfStock }: ThemeProps) {
  return {
    // ✅ الحاوية الرئيسية: حواف حادة من الأسفل تماماً لمنع الدوران السفلي (Sharp Bottom)
    container: cn(
      'group relative flex w-full flex-col overflow-hidden bg-card',
      'rounded-t-2xl rounded-b-none transition-all duration-500 backface-hidden',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
      'shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-none border border-slate-200/60 dark:border-slate-800/50',
      
      variant === 'default' && [
        'hover:shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:hover:shadow-none',
        !isOutOfStock && 'hover:-translate-y-1.5',
      ],
      
      variant === 'compact' && [
        'flex-row items-center gap-3.5 p-2.5 rounded-2xl', // الـ compact يفضل دائري بالكامل لأنه شريط صغير
        'hover:shadow-[0_12px_24px_rgba(0,0,0,0.03)]',
      ],
      
      variant === 'horizontal' && [
        'flex-col sm:flex-row gap-4 p-3.5 rounded-2xl', // الـ horizontal يفضل دائري بالكامل لتناسق الأبعاد
        'hover:shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:hover:shadow-none',
        !isOutOfStock && 'hover:-translate-y-1',
      ]
    ),
    
    // ✅ حاوية الصورة: واخد bg-slate-50/90 لحماية تباين الصور البيضاء وبوردر سفلي خفيف جداً
    imageContainer: cn(
      'relative overflow-hidden bg-slate-50/90 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/40', 
      variant === 'default' && 'aspect-[1/1] w-full',
      variant === 'compact' && 'h-14 w-14 shrink-0 rounded-xl border-none',
      variant === 'horizontal' && 'h-48 w-full sm:h-32 sm:w-36 shrink-0 rounded-xl'
    ),
    
    // ✅ الصورة نفسها (الزوم الناعم الفاخر)
    image: cn(
      'object-cover',
      variant === 'default' && [
        'transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]',
        'group-hover:scale-105 origin-center',
      ],
      variant === 'compact' && 'h-full w-full transition-transform duration-500 group-hover:scale-105',
      variant === 'horizontal' && 'transition-transform duration-700 ease-out group-hover:scale-105'
    ),
    
    // ✅ حاوية المحتوى: تثبيت الـ min-h لتوحيد الارتفاع الكلي للكروت تماماً حتى لو فيه سطر خصم أو طلب توفر
    content: cn(
      'flex flex-1 flex-col justify-between',
      variant === 'default' && 'p-3 sm:p-4 min-h-[120px] sm:min-h-[140px]', 
      variant === 'compact' && 'flex-1 min-w-0 space-y-0.5',
      variant === 'horizontal' && 'py-0.5 justify-between'
    ),
    
    // ✅ عنوان المنتج
    title: cn(
      'text-slate-800 dark:text-slate-100 transition-colors duration-300',
      variant === 'default' && [
        'line-clamp-2 font-medium tracking-tight leading-snug text-xs sm:text-sm',
        'min-h-[2.4rem] sm:min-h-[2.8rem]', 
        'group-hover:text-primary-600 dark:group-hover:text-primary-400',
      ],
      variant === 'compact' && [
        'truncate font-medium text-sm',
        'group-hover:text-primary-600 dark:group-hover:text-primary-400',
      ],
      variant === 'horizontal' && [
        'mb-1.5 line-clamp-2 font-semibold leading-snug',
        'group-hover:text-primary-600 dark:group-hover:text-primary-400',
      ]
    ),
    
    // ✅ السعر الرئيسي
    price: cn(
      'font-bold tracking-tight text-primary-600 dark:text-primary-400 whitespace-nowrap',
      variant === 'default' && 'text-xs sm:text-sm',
      variant === 'compact' && 'text-sm font-bold',
      variant === 'horizontal' && 'text-sm sm:text-base'
    ),
    
    // ✅ السعر الأصلي (قبل الخصم)
    originalPrice: 'text-[9px] sm:text-[11px] text-slate-400 line-through block mt-0.5',
    
    // ✅ شارة الخصم الذكية الطائرة فوق الصورة فقط
    badges: {
      container: 'absolute start-2.5 top-2.5 flex flex-col gap-1.5 z-10',
      discount: cn(
        'inline-flex items-center rounded-lg bg-emerald-500/90',
        'px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-sm animate-fade-in'
      ),
    },
    
    // ✅ حالة المخزون الذكية (اللمبة والنقطة التفاعلية) 🟢 / 🔴
    stockStatus: {
      container: 'flex items-center gap-1.5 mt-0.5',
      dot: cn(
        'h-1.5 w-1.5 rounded-full transition-all duration-300',
        isOutOfStock ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]' : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
      ),
      text: cn(
        'text-[10px] sm:text-[11px] font-semibold tracking-tight',
        isOutOfStock ? 'text-red-500' : 'text-slate-500'
      )
    },

    // ✅ زر "اسأل عن التوفر" البريميوم
    askAvailabilityButton: cn(
      'text-[10px] sm:text-[11px] font-bold text-primary-600 dark:text-primary-400',
      'hover:text-primary-700 transition-colors duration-200',
      'flex items-center gap-1 bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 sm:py-1 rounded-lg mt-0.5'
    ),
    
    // ✅ قسم التقييم
    rating: {
      container: 'mt-1 mb-2 flex items-center gap-1',
      star: 'h-3 w-3 fill-amber-400 text-amber-400',
      value: 'font-semibold text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs',
      count: 'text-slate-400 text-[10px] sm:text-xs',
    },
    
    // ✅ زر الإضافة الأساسي بالأسفل (تم تبسيطه لربطه بالـ layout الموحد)
    addToCartButton: cn(
      'rounded-xl shadow-sm transition-all duration-300 text-xs font-semibold',
      variant === 'default' && 'h-8 sm:h-9 px-3.5 sm:px-4 bg-slate-900 hover:bg-primary-600 text-white active:scale-95 dark:bg-slate-800 dark:hover:bg-primary-600 border-none',
      variant === 'horizontal' && 'px-5 h-9 bg-primary-600 hover:bg-primary-700 active:scale-95 shadow-primary-100 text-white border-none',
      isOutOfStock && 'hidden'
    ),
  };
}