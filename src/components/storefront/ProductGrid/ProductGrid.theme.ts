// src/components/storefront/ProductGrid/ProductGrid.theme.ts

import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع
// ============================================================
interface ThemeProps {
  columns: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  /** هل الـ grid فيه animations؟ */
  animated?: boolean;
}

// ============================================================
// 🎨 الـ Columns Map (توزيع الأبعاد الذكي والـ Responsive الموزون)
// ============================================================
const columnsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  // 🌟 هنا ضبطنا الـ md عشان لما المتصفح يصغر لنص الشاشة يعرض 3 كروت ملمومين بدال ما يفرشوا
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6',
};

// ============================================================
// 🧠 الـ Theme الرئيسي (Premium Edition)
// ============================================================
export function getProductGridTheme({ 
  columns, 
  className,
  animated = true,
}: ThemeProps) {
  return {
    // ✅ الحاوية الرئيسية (Grid الموزون بالمسطرة)
    container: cn(
      'grid w-full',
      columnsMap[columns],
      
      // مسافات متناسقة مع أبعاد الـ Card الجديدة
      'gap-3.5 sm:gap-6', 
      
      animated && 'transition-all duration-500 ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
      className
    ),
    
    // ✅ الـ Empty State (لو مفيش داتا - متظبط عشان يجذب عين العميل)
    emptyState: {
      container: cn(
        'flex flex-col items-center justify-center',
        'py-20 px-6 text-center rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800'
      ),
      icon: 'mb-4 text-5xl text-slate-300 dark:text-slate-700 animate-bounce duration-1000',
      title: 'text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200 tracking-tight',
      description: cn(
        'mt-2 mb-6 text-slate-400 dark:text-slate-500',
        'max-w-sm mx-auto text-xs sm:text-sm leading-relaxed'
      ),
      actions: 'flex flex-wrap gap-3 justify-center',
    },
    
    // ✅ الـ Footer (تم تطهيره وحذف الخطوط القاطعة ليصبح سايح تماماً)
    footer: {
      container: cn(
        'mt-8 text-center',
        'text-xs sm:text-sm text-slate-400 dark:text-slate-500'
      ),
      text: 'font-medium tracking-tight',
    },
    
    // ✅ الـ Header (عنوان القسم أو المجموعة)
    header: {
      container: cn(
        'mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between',
        'gap-3 pb-4 border-b border-slate-50 dark:border-slate-900/60'
      ),
      title: 'text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight',
      description: 'mt-1 text-slate-400 dark:text-slate-500 text-xs sm:text-sm',
      viewAllButton: cn(
        'rounded-xl px-4 h-9 flex items-center justify-center text-xs font-semibold',
        'text-primary-600 dark:text-primary-400 border border-slate-100 dark:border-slate-800 bg-card',
        'hover:bg-primary-50/50 dark:hover:bg-primary-950/20 hover:border-primary-500/20',
        'transition-all duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
      ),
    },
    
    // ✅ الـ Skeleton Loading
    skeleton: {
      container: cn(
        'grid w-full',
        columnsMap[columns],
        'gap-3.5 sm:gap-6'
      ),
      card: cn(
        'rounded-2xl border border-slate-100 dark:border-slate-800/50 bg-card overflow-hidden',
        'flex flex-col'
      ),
      image: 'aspect-[1/1] bg-slate-100 dark:bg-slate-900 animate-pulse',
      content: 'p-3 sm:p-4 flex-1 flex flex-col space-y-3',
      title: 'h-4 w-5/6 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse',
      price: 'h-4 w-1/3 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse mt-auto',
      button: 'h-8 sm:h-9 w-1/2 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse self-end max-sm:hidden',
    },
  };
}