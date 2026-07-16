// src/components/shared/Input.tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, required, id, ...props }, ref) => {
    // توليد ID فريد لكل إنبوت في حال عدم تمريره لدعم Accessibility (ربط الليبل بالإنبوت)
    const inputId = id || React.useId();

    return (
      <div className="w-full space-y-2 text-start">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-foreground select-none"
          >
            {label}
            {required && <span className="text-destructive mr-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          <input
            type={type}
            id={inputId}
            ref={ref}
            className={cn(
              // الستايليست الأساسي المتوافق مع الـ Dark Mode والـ Focus
              "flex h-11 w-full rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground",
              "placeholder:text-muted-foreground/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-all duration-200 focus:scale-[1.005]",
              // ستايل خاص في حالة وجود خطأ (Error State)
              error && "border-destructive focus-visible:ring-destructive",
              className
            )}
            {...props}
          />
        </div>

        {error && (
          <p className="text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };