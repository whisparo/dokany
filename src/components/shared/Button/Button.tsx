// src/components/shared/Button/Button.tsx

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot'; // ✅ المكون السحري لتحويل الزرار لأي Tag تاني (مثل Link)

// ============================================================
// 🎨 تعريف الأنماط باستخدام CVA (متوافق مع Tailwind v4 وعضوي مع الـ Tokens)
// ============================================================
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none',
    'transition-all duration-200 ease-out active:scale-[0.98]',
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background',
    'disabled:opacity-50 disabled:pointer-events-none cursor-pointer disabled:cursor-not-allowed',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:ring-primary-500 dark:bg-primary-500 dark:hover:bg-primary-600',
        secondary:
          'bg-gray-200 text-gray-900 shadow-sm hover:bg-gray-300 focus-visible:ring-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-muted focus-visible:ring-ring',
        ghost:
          'bg-transparent text-foreground hover:bg-muted focus-visible:ring-ring',
        danger:
          'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600',
      },
      size: {
        sm: 'h-8 px-3 text-xs', 
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11 p-0', // 44x44px (WCAG 2.1 AA compliant)
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

// ============================================================
// 📦 تعريف أنواع Props المقفلة والسليمة بالكامل
// ============================================================
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  disableAutoFocus?: boolean;
  asChild?: boolean; // ✅ إضافة الـ Prop ده رسمياً للـ Types
}

// ============================================================
// 🧠 مكون الزر الرئيسي المحسن
// ============================================================
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      disabled,
      children,
      type = 'button',
      onClick,
      disableAutoFocus = false,
      asChild = false, // ✅ القيمة الافتراضية
      ...props
    },
    ref
  ) => {
    // تحديد المكون المستخدم: لو true يقلب Slot وينقل الصفات للي جواه، لو false يفضل button عادي
    const Comp = asChild ? Slot : 'button';

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (loading) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disableAutoFocus) {
        e.preventDefault();
      }
    };

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type} // الـ Slot مياخدش type="button" لو هو Link
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={asChild ? undefined : (disabled || loading)} // الـ Slot مياخدش disabled لو هو Link
        aria-busy={loading}
        aria-disabled={disabled || loading}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        {...props}
      >
        {loading && (
          <>
            {/* ✅ طردنا Lucide واستخدمنا SVG نقي طلقة خفيف للمحترفين */}
            <svg className="h-4 w-4 shrink-0 animate-spin text-current" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="sr-only">جاري التحميل...</span>
          </>
        )}
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

export default Button;
export { buttonVariants };