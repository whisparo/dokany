// src/components/storefront/Checkout/Checkout.theme.ts

import { cn } from '@/lib/utils';

export interface CheckoutTheme {
  container: string;
  grid: string;
  formColumn: string;
  summaryColumn: string;
  sectionTitle: string;
  subTitle: string;
  formGrid: string;
  input: string;
  shippingSection: string;
  paymentSection: string;
  optionsGrid: string;
  optionCard: (isSelected: boolean) => string;
  summaryCard: string;
  cartItems: string;
  cartItem: string;
  summaryDetails: string;
  summaryRow: string;
  totalRow: string;
  submitButton: string;
  codNote: string;
}

export interface CheckoutThemeProps {
  theme?: Partial<CheckoutTheme>;
}

export function getCheckoutTheme(): CheckoutTheme {
  return {
    // ✅ الحاوية الأساسية: تسبح فوق تدرج خلفية دائري ناعم جداً (Radial Gradient Backdrops)
    container: 'mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 tracking-tight relative min-h-screen before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(var(--primary-rgb),0.03),transparent_45%)] before:pointer-events-none',

    // ✅ تقسيم الشاشة بنسبة ذهبية (٧ أعمدة للفورم مقابل ٥ للملخص)
    grid: 'grid grid-cols-1 gap-10 lg:grid-cols-12 items-start relative z-10',

    formColumn: 'lg:col-span-7 space-y-8',

    summaryColumn: 'lg:col-span-5 lg:sticky lg:top-24',

    // ✅ العناوين: تخلصنا من الخط الأسود الحاد العتيق، واستبدلناه بحد ناعم وتأثير باهت أنيق
    sectionTitle: 'mb-8 text-xl sm:text-2xl font-black text-foreground border-b border-border/10 pb-4 tracking-tight flex items-center gap-3',
    subTitle: 'mb-4 text-base sm:text-lg font-bold text-foreground/90 flex items-center gap-2',

    formGrid: 'grid grid-cols-1 gap-5 sm:grid-cols-2 bg-card/30 dark:bg-card/10 border border-border/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-sm',
    
    // ✅ حقول الإدخال: ناعمة ومرنة وتتحرك بسلاسة عند التركيز عليها
    input: 'w-full focus-within:scale-[1.005] transition-transform duration-200',

    shippingSection: 'space-y-4 bg-card/30 dark:bg-card/10 border border-border/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-sm',
    paymentSection: 'space-y-4 bg-card/30 dark:bg-card/10 border border-border/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-sm',
    optionsGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2',

    // ✅ بطاقات الخيارات: تصميم تفاعلي مذهل بحدود ملونة مشعة عند التحديد
    optionCard: (isSelected: boolean) =>
      cn(
        'relative flex flex-col justify-between rounded-2xl border p-5 cursor-pointer text-start w-full select-none gap-3',
        'transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isSelected
          ? 'border-primary bg-primary/[0.04] dark:bg-primary/5 ring-1 ring-primary shadow-[0_10px_25px_-5px_rgba(var(--primary-rgb),0.1)] scale-[1.01]'
          : 'border-border/60 bg-card/50 hover:bg-muted/30 hover:border-border hover:scale-[1.002] shadow-sm'
      ),

    // ✅ ملخص الطلب الزجاجي الفاخر جداً (Ultra Glassmorphism Card)
    summaryCard: 'rounded-3xl border border-border/40 bg-card/60 dark:bg-card/20 backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden before:absolute before:top-0 before:left-0 before:w-full before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-primary/30 before:to-transparent',

    cartItems: 'divide-y divide-border/20 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent',
    cartItem: 'flex items-center justify-between py-5 first:pt-0 last:pb-0 gap-4',

    summaryDetails: 'mt-6 space-y-4 border-t border-border/30 pt-6',
    summaryRow: 'flex justify-between text-sm text-muted-foreground/80 font-medium',
    totalRow: 'border-t border-border/60 pt-5 text-xl font-black text-foreground flex items-center justify-between tracking-tight',

    // ✅ زر التأكيد الحركي المشع (Glow & Pulse Effect)
    submitButton: 'mt-8 w-full rounded-2xl py-4.5 text-base font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_10px_30px_rgba(var(--primary-rgb),0.3)] active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center justify-center gap-2',

    codNote: 'mt-5 flex items-start gap-3 rounded-2xl bg-amber-500/[0.03] dark:bg-amber-500/5 border border-amber-500/10 p-4 text-xs sm:text-sm text-amber-700 dark:text-amber-400 leading-relaxed shadow-inner',
  };
}