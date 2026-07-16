// src/components/shared/Container/Container.tsx

import { 
  forwardRef, 
  type HTMLAttributes, 
  type ReactNode,
  type ElementRef,
} from 'react';
import { Slot } from '@radix-ui/react-slot'; // 👈 نستخدم الـ Slot الرسمي لتفادي كوارث الـ cloneElement
import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع (Types)
// ============================================================

export type ContainerElement = 
  | 'div' 
  | 'section' 
  | 'main' 
  | 'article' 
  | 'header' 
  | 'footer' 
  | 'nav' 
  | 'aside';

export type ContainerMaxWidth = 
  | 'sm'    
  | 'md'    
  | 'lg'    
  | 'xl'    
  | '2xl'   
  | 'full'  
  | 'none';

export type ContainerRole =
  | 'main'
  | 'navigation'
  | 'banner'
  | 'contentinfo'
  | 'region'
  | 'complementary'
  | 'form';

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ContainerElement;
  maxWidth?: ContainerMaxWidth;
  noPadding?: boolean;
  fluid?: boolean;
  center?: boolean;
  asChild?: boolean;
  role?: ContainerRole;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  debug?: boolean;
  children?: ReactNode;
}

const maxWidthClasses: Record<ContainerMaxWidth, string> = {
  sm: 'max-w-container-sm',   
  md: 'max-w-container-md',
  lg: 'max-w-container-lg',
  xl: 'max-w-container-xl',
  '2xl': 'max-w-container-2xl',
  full: 'max-w-full',
  none: 'max-w-none',
};

// ============================================================
// 🧠 المكون الرئيسي (بنية Polymorphic نقية ومحصنة بالكامل)
// ============================================================
const ContainerComponent = forwardRef<HTMLElement, ContainerProps>(
  (
    {
      as: Component = 'div',
      maxWidth = 'lg',
      noPadding = false,
      fluid = false,
      center = false,
      asChild = false,
      role,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      debug = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    
    const containerClasses = cn(
      'mx-auto w-full',
      !noPadding && 'px-4 sm:px-6 lg:px-8',
      fluid ? 'max-w-full' : maxWidthClasses[maxWidth],
      center && 'text-center',
      debug && 'border-2 border-dashed border-red-500 bg-red-500/5',
      className
    );
    
    // ✅ الحل الاحترافي: لو asChild مفعلة، بنرمي الحمل على الـ Slot الجاهز من Radix
    // وده بيهم بدمج الـ classes والـ props بأمان حتى لو الـ child جواه نصوص أو تفاصيل معقدة
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={containerClasses}
          role={role}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          {...props}
        >
          {/* ✅ حماية إضافية: بنضمن دايماً إن فيه عنصر واحد فرعي مغلف حتى لو اتبعث غلط */}
          {typeof children === 'string' ? <span>{children}</span> : children}
        </Slot>
      );
    }
    
    const Tag = Component as 'div';
    
    return (
      <Tag
        ref={ref as React.Ref<HTMLDivElement>} 
        className={containerClasses}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        {...props}
      >
        {children}
      </Tag>
    );
  }
);

ContainerComponent.displayName = 'Container';

export const Container = ContainerComponent as <E extends ContainerElement = 'div'>(
  props: ContainerProps & { as?: E } & { ref?: React.Ref<ElementRef<E>> }
) => ReactNode;

export default Container;