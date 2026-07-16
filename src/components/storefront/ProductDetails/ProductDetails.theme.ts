// src/components/storefront/ProductDetails/ProductDetails.theme.ts

import { cn } from '@/lib/utils';

export interface ProductDetailsThemeProps { // 👈 غيرنا الاسم هنا ليتوافق مع الاستيراد
  isOutOfStock: boolean;
  hasMultipleMedia: boolean;
}

export function getProductDetailsTheme({ isOutOfStock, hasMultipleMedia }: ProductDetailsThemeProps) {
  return {
    // 🌍 الحاوية الرئيسية: مفرودة وتتنفس مباشرة على خلفية الموقع الطبيعية
    container: 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 md:pt-16 pb-20 grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 items-start bg-transparent',

    // 📸 العمود الأيمن (خاص بالميديا والوسائط)
    mediaSection: 'md:col-span-5 space-y-4 lg:sticky lg:top-28',

    // 🖼️ إطار الصورة البطل: قمنا بضبط الأبعاد كـ مربع مثالي مع خلفية ناعمة وحد خفيف يمنع سيحان اللون الأبيض
    mediaWrapper: 'relative aspect-square w-full max-h-[520px] rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 transition-all duration-300 shadow-sm',

    // الصورة أو الميديا الفعلية: استخدام object-contain يمنع تمدد الصورة ويحمي أبعادها الأصلية
    media: 'object-contain w-full h-full transition-transform duration-500 hover:scale-[1.01]',

    // مشغل الفيديو الداخلي
    videoPlayer: 'absolute inset-0 w-full h-full rounded-2xl border-0',

    // الغطاء الأسود الخفيف فوق الفيديو قبل التشغيل
    videoOverlay: 'absolute inset-0 bg-slate-950/20 flex items-center justify-center transition-colors duration-300 hover:bg-slate-950/30',

    // زر تشغيل الفيديو الفاخر
    playButton: 'h-16 w-16 bg-white/95 text-slate-900 rounded-full flex items-center justify-center shadow-xl transition-transform duration-300 hover:scale-110 active:scale-95',

    // 🏷️ البادجات التسويقية (الخصم وندرة المخزون)
    badges: 'absolute top-4 right-4 z-10 flex flex-col gap-2',
    urgencyBadge: (variant: 'danger' | 'warning' | 'success' | 'info' | 'primary') => {
      const styles = {
        danger: 'bg-rose-500 text-white',
        warning: 'bg-amber-500 text-white',
        success: 'bg-emerald-500 text-white',
        info: 'bg-sky-500 text-white',
        primary: 'bg-teal-500 text-white',
      };
      return `${styles[variant] || styles.primary} text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1`;
    },

    // 🎞️ معرض المصغرات (Thumbnails)
    thumbnailGrid: 'grid grid-cols-5 gap-3',
    thumbnail: (isActive: boolean, isVideo: boolean) => cn(
      'relative aspect-square w-full rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 border-2 transition-all duration-200 cursor-pointer',
      isActive 
        ? 'border-teal-500 ring-2 ring-teal-500/10' 
        : 'border-slate-200/40 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
    ),
    thumbnailImage: 'object-contain w-full h-full p-2.5',
    thumbnailVideoIndicator: 'absolute inset-0 bg-slate-900/40 flex items-center justify-center text-white',

    // 📄 العمود الأيسر (تفاصيل الشراء)
    contentSection: 'md:col-span-7 flex flex-col space-y-6 md:pt-2',

    // التصنيف العلوي
    category: 'inline-flex items-center text-xs md:text-sm font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider',

    // عنوان المنتج
    title: 'text-2xl md:text-4xl font-black text-slate-950 dark:text-white leading-tight',

    // التقييم والنجوم
    rating: 'flex items-center gap-2',
    ratingStars: 'flex items-center gap-0.5',
    ratingCount: 'text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium',

    // 💰 كتلة الأسعار والخصومات
    priceSection: 'flex items-baseline gap-4 flex-wrap pb-4 border-b border-slate-100 dark:border-slate-800/80',
    price: 'text-3xl md:text-4xl font-black text-slate-950 dark:text-white',
    originalPrice: 'text-lg font-medium text-slate-400 dark:text-slate-500 line-through decoration-rose-500/70',
    discountLabel: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-md',

    // ============================================================
    // 🎨 كلاسات المتغيرات الجديدة (Colors & Sizes)
    // ============================================================
    variantsSection: 'flex flex-col gap-5 pb-6 border-b border-slate-100 dark:border-slate-800/80',
    
    // الألوان
    colorOptionLabel: 'text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400',
    colorGrid: 'flex items-center gap-3',
    colorCircle: (isActive: boolean, colorHex: string) => cn(
      'relative h-8 w-8 rounded-full border-2 transition-all duration-200 cursor-pointer flex items-center justify-center',
      isActive 
        ? 'border-slate-950 dark:border-white scale-110 shadow-md ring-2 ring-slate-950/10' 
        : 'border-slate-200/80 dark:border-slate-800 hover:scale-105'
    ),
    
    // المقاسات
    sizeOptionLabel: 'text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400',
    sizeGrid: 'flex flex-wrap gap-2.5',
    sizeChip: (isActive: boolean, isDisabled?: boolean) => cn(
      'min-w-[48px] h-10 px-3 flex items-center justify-center rounded-lg text-sm font-semibold border transition-all duration-200',
      isDisabled 
        ? 'bg-slate-50/50 text-slate-300 border-slate-100 line-through cursor-not-allowed dark:bg-slate-900/20 dark:text-slate-700 dark:border-slate-800' 
        : isActive 
          ? 'bg-slate-950 text-white border-slate-950 dark:bg-white dark:text-slate-950 dark:border-white shadow-sm' 
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:border-slate-600 cursor-pointer'
    ),

    // الوصف
    description: 'text-slate-600 dark:text-slate-300 text-base leading-relaxed whitespace-pre-line border-b border-slate-100 dark:border-slate-800/80 pb-6',

    // 📋 جدول المواصفات
    specsSection: 'grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pb-2',
    specCard: 'flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800/50 text-sm',
    specLabel: 'font-medium text-slate-400 dark:text-slate-500',
    specValue: 'font-semibold text-slate-900 dark:text-white',

    // ⚡ كتلة الأكشن والأزرار
    actions: 'flex flex-col sm:flex-row sm:items-end gap-4 pt-6',
    quantityLabel: 'text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 mb-1',
    quantityWrapper: 'flex items-center justify-between border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-xl p-1 h-12 w-32',
    quantityBtn: 'h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors disabled:opacity-40',
    quantityInput: 'font-extrabold text-lg text-slate-900 dark:text-white',
    
    // زر الإضافة للسلة البطل
    addToCartButton: cn(
      'flex-1 h-12 text-base font-extrabold rounded-xl transition-all duration-300 flex items-center justify-center shadow-md',
      isOutOfStock 
        ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed shadow-none' 
        : 'bg-[#11CAA0] hover:bg-[#0fa885] text-white hover:shadow-lg hover:shadow-teal-500/15 active:scale-[0.98]'
    ),

    // 🛡️ شارات الشحن والثقة
    meta: 'grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800/80',
    metaRow: 'flex items-start gap-3 py-2',
    metaIcon: 'h-5 w-5 text-teal-500 flex-shrink-0 mt-0.5',
    metaText: 'text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-snug',

    skeleton: {
      container: 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 animate-pulse',
      image: 'md:col-span-5 aspect-square w-full rounded-2xl bg-slate-200 dark:bg-slate-800',
      content: 'md:col-span-7 space-y-6',
      title: 'h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-3/4',
      price: 'h-14 bg-slate-200 dark:bg-slate-800 rounded-xl w-full',
      specs: 'grid grid-cols-2 gap-3',
      spec: 'h-12 bg-slate-200 dark:bg-slate-800 rounded-xl',
      description: 'h-4 bg-slate-200 dark:bg-slate-800 rounded-md',
      button: 'h-12 bg-slate-200 dark:bg-slate-800 rounded-xl w-full',
    }
  };
}