// src/components/shared/Button/Button.tsx
"use client";

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';

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
        icon: 'h-11 w-11 p-0',
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

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  disableAutoFocus?: boolean;
  asChild?: boolean;
}

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
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    // ✅ الحل العبقري: مش هنمرر الـ Handlers دي للـ Slot لو مفيش onClick أو تفاعل خارجي مبعوت
    // بكده الـ Link السيرفر هيشتغل طلقة بدون ما نبعت له أي Event Handlers تضايق الـ Next.js Compiler
    const handleClick = onClick 
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          if (loading) {
            e.preventDefault();
            return;
          }
          onClick(e);
        }
      : undefined;

    const handleMouseDown = disableAutoFocus
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
        }
      : undefined;

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, fullWidth }), className)}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        {...props}
      >
        {loading && (
          <>
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