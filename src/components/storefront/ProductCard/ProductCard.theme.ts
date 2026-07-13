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
// 🎨 الـ Theme الرئيسي (Premium Seamless Edition)
// ============================================================
export function getProductCardTheme({ variant, isOutOfStock }: ThemeProps) {
  return {
    // ✅ الحاوية الرئيسية: طيرنا الـ border تماماً واعتمدنا على ظل فائق النعومة متلاشي (Premium Dynamic Shadow)
    container: cn(
      'group relative flex w-full flex-col overflow-hidden bg-card',
      'rounded-t-2xl rounded-b-none transition-all duration-500 backface-hidden',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
      // 🌟 استبدلنا الـ shadow القديم بظل مطاطي ناعم جداً مريح للعين
      'shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-none',
      
      // Default variant - (سايح وطاير مع الـ Hover)
      variant === 'default' && [
        'hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] dark:hover:shadow-none',
        !isOutOfStock && 'hover:-translate-y-1.5',
      ],
      
      // Compact variant
      variant === 'compact' && [
        'flex-row items-center gap-3.5 p-2.5',
        'hover:shadow-[0_12px_24px_rgba(0,0,0,0.03)]',
      ],
      
      // Horizontal variant
      variant === 'horizontal' && [
        'flex-col sm:flex-row gap-4 p-3.5',
        'hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] dark:hover:shadow-none',
        !isOutOfStock && 'hover:-translate-y-1',
      ]
    ),
    
    // ✅ حاوية الصورة: طيرنا الـ border-b والحدود تماماً عشان تسيح جوه الكارت
    imageContainer: cn(
      'relative overflow-hidden bg-slate-50 dark:bg-slate-900', 
      variant === 'default' && 'aspect-[1/1] w-full',
      variant === 'compact' && 'h-14 w-14 shrink-0 rounded-xl',
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
    
    // ✅ حاوية المحتوى
    content: cn(
      'flex flex-1 flex-col',
      variant === 'default' && 'p-3.5 sm:p-4.5', // بحب أزود الـ padding سنة بسيطة مع التصميم السايح بيدي فخامة
      variant === 'compact' && 'flex-1 min-w-0 space-y-0.5',
      variant === 'horizontal' && 'py-0.5 justify-between'
    ),
    
    // ✅ عنوان المنتج (المسافات اللي بتريح العين)
    title: cn(
      'text-slate-800 dark:text-slate-100 transition-colors duration-300',
      variant === 'default' && [
        'line-clamp-2 font-medium tracking-tight leading-snug text-sm sm:text-base',
        'min-h-[2.6rem] sm:min-h-[3rem]', 
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
      'font-bold tracking-tight text-primary-600 dark:text-primary-400',
      variant === 'default' && 'text-sm sm:text-base mt-1',
      variant === 'compact' && 'text-sm font-bold',
      variant === 'horizontal' && 'text-sm sm:text-base'
    ),
    
    // ✅ السعر الأصلي (قبل الخصم)
    originalPrice: 'text-[10px] sm:text-xs text-slate-400 line-through block mt-0.5',
    
    // ✅ الوسوم الذكية الطائرة (Smart Badges)
    badges: {
      container: 'absolute start-2.5 top-2.5 flex flex-col gap-1.5 z-10',
      outOfStock: cn(
        'inline-flex items-center rounded-lg bg-slate-900/90 dark:bg-red-500/90',
        'px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-sm'
      ),
      discount: cn(
        'inline-flex items-center rounded-lg bg-emerald-500/90',
        'px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-sm animate-fade-in'
      ),
    },
    
    // ✅ زر السلة الطائر (شيلنا الـ shadow القديم التقيل وضبطناه ليكون عايم)
    quickAddButton: cn(
      'absolute bottom-3 end-3 rounded-xl bg-white/95 dark:bg-slate-900/95 p-2.5',
      'shadow-[0_8px_20px_rgba(0,0,0,0.06)] dark:shadow-none backdrop-blur-md',
      'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0',
      'max-sm:opacity-100 max-sm:translate-y-0', 
      'transition-all duration-300 ease-out hover:scale-110 active:scale-95',
      'hover:bg-primary-600 dark:hover:bg-primary-600 text-primary-600 dark:text-primary-400'
    ),
    
    // ✅ قسم التقييم
    rating: {
      container: 'mt-1 mb-2 flex items-center gap-1',
      star: 'h-3.5 w-3.5 fill-amber-400 text-amber-400',
      value: 'font-semibold text-slate-600 dark:text-slate-400 text-[11px] sm:text-xs',
      count: 'text-slate-400 text-[11px] sm:text-xs',
    },
    
    // ✅ زر الإضافة الأساسي بالأسفل
    addToCartButton: cn(
      'rounded-xl shadow-sm transition-all duration-300 text-xs font-semibold',
      variant === 'default' && 'h-8 sm:h-9 px-3.5 sm:px-4 max-sm:hidden bg-slate-900 hover:bg-primary-600 text-white active:scale-95 dark:bg-slate-800 dark:hover:bg-primary-600 border-none',
      variant === 'horizontal' && 'px-5 h-9 bg-primary-600 hover:bg-primary-700 active:scale-95 shadow-primary-100 text-white border-none',
      isOutOfStock && 'opacity-60 cursor-not-allowed'
    ),
  };
}