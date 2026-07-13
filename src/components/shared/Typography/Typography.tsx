// src/components/shared/Typography/Typography.tsx

import { 
  forwardRef, 
  type ElementType, 
  type ReactNode, 
  type HTMLAttributes,
  type ElementRef
} from 'react';
import { cn } from '@/lib/utils';

// ============================================================
// 📦 الأنواع (Types)
// ============================================================

export type TypographyVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body1'
  | 'body2'
  | 'caption'
  | 'overline'
  | 'gradient';

export type TypographyWeight = 
  | 'light' 
  | 'normal' 
  | 'medium' 
  | 'semibold' 
  | 'bold' 
  | 'extrabold';

export type TypographyAlign = 
  | 'start'    
  | 'center' 
  | 'end'    
  | 'justify';

export type TypographyColor =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'muted'
  | 'foreground'
  | 'background'
  | 'success'
  | 'warning'
  | 'danger'
  | 'inherit'
  | 'current';

export type TypographyDecoration = 
  | 'none' 
  | 'underline' 
  | 'overline' 
  | 'line-through';

export type TypographyTransform = 
  | 'uppercase' 
  | 'lowercase' 
  | 'capitalize' 
  | 'normal-case';

export type TypographyTracking = 
  | 'tighter' 
  | 'tight' 
  | 'normal' 
  | 'wide' 
  | 'wider' 
  | 'widest';

export type TypographyLeading = 
  | 'none' 
  | 'tight' 
  | 'snug' 
  | 'normal' 
  | 'relaxed' 
  | 'loose';

export type TypographyMaxLines = 1 | 2 | 3 | 4 | 5 | 6;

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  variant?: TypographyVariant;
  as?: ElementType;
  weight?: TypographyWeight;
  align?: TypographyAlign;
  color?: TypographyColor;
  customColor?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  small?: boolean;
  truncate?: boolean;
  noWrap?: boolean;
  srOnly?: boolean;
  decoration?: TypographyDecoration;
  transform?: TypographyTransform;
  tracking?: TypographyTracking;
  leading?: TypographyLeading;
  maxLines?: TypographyMaxLines;
  opacity?: number;
  anchorOffset?: boolean;
  children?: ReactNode;
}

// ============================================================
// 🎨 الـ Classes (متوافقة بالكامل مع الـ Tokens و Tailwind v4)
// ============================================================

const variantClasses: Record<TypographyVariant, string> = {
  h1: 'text-4xl font-extrabold tracking-tight lg:text-5xl first:mt-0',
  h2: 'text-3xl font-semibold tracking-tight first:mt-0',
  h3: 'text-2xl font-semibold tracking-tight first:mt-0',
  h4: 'text-xl font-semibold tracking-tight first:mt-0',
  h5: 'text-lg font-semibold first:mt-0',
  h6: 'text-base font-semibold first:mt-0',
  body1: 'text-base leading-7',
  body2: 'text-sm leading-6',
  caption: 'text-xs leading-5 text-muted-foreground',
  overline: 'text-xs uppercase tracking-wider',
  gradient: 'text-4xl font-extrabold bg-gradient-to-r from-primary-500 via-accent-500 to-secondary-500 bg-clip-text text-transparent dark:from-primary-400 dark:via-accent-400 dark:to-secondary-400',
};

const variantMapping: Record<TypographyVariant, ElementType> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
  overline: 'span',
  gradient: 'h1',
};

const weightClasses: Record<TypographyWeight, string> = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
};

const alignClasses: Record<TypographyAlign, string> = {
  start: 'text-start', 
  center: 'text-center',
  end: 'text-end',   
  justify: 'text-justify',
};

const colorClasses: Record<TypographyColor, string> = {
  primary: 'text-primary-600 dark:text-primary-400',
  secondary: 'text-gray-600 dark:text-gray-400',
  accent: 'text-accent-600 dark:text-accent-400',
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
  background: 'text-background',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  inherit: 'text-inherit',
  current: 'text-current',
};

const decorationClasses: Record<TypographyDecoration, string> = {
  none: 'no-underline',
  underline: 'underline',
  overline: 'overline',
  'line-through': 'line-through',
};

const transformClasses: Record<TypographyTransform, string> = {
  uppercase: 'uppercase',
  lowercase: 'lowercase',
  capitalize: 'capitalize',
  'normal-case': 'normal-case',
};

const maxLinesClasses: Record<TypographyMaxLines, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

// ============================================================
// 🧠 المكون الرئيسي (Polymorphic نقية خالية من any)
// ============================================================
const TypographyComponent = forwardRef<HTMLElement, TypographyProps>(
  (
    {
      variant = 'body1',
      as,
      weight,
      align,
      color,
      customColor,
      bold = false,
      italic = false,
      strike = false,
      small = false,
      truncate = false,
      noWrap = false,
      srOnly = false,
      decoration,
      transform,
      tracking,
      leading,
      maxLines,
      opacity,
      anchorOffset = false,
      children,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const Component = as || variantMapping[variant] || 'p';

    const classes = cn(
      variantClasses[variant],
      anchorOffset && 'scroll-m-20',
      weight && weightClasses[weight],
      align && alignClasses[align],
      color && colorClasses[color],
      bold && 'font-bold',
      italic && 'italic',
      strike && 'line-through',
      small && 'text-sm',
      truncate && 'truncate block',
      noWrap && 'whitespace-nowrap',
      srOnly && 'sr-only',
      decoration && decorationClasses[decoration],
      transform && transformClasses[transform],
      maxLines && maxLinesClasses[maxLines],
      className
    );

    // تجميع الـ Inline Styles الآمنة
    const combinedStyle = {
      ...style,
      ...(customColor ? { color: customColor } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
    };

    // التكنيك النظيف: إجبار الـ Element على التعامل كـ Tag صريح لحل عقدة الـ DOM Types
    const Tag = Component as 'p';

    return (
      <Tag
        ref={ref as React.Ref<HTMLParagraphElement>} // كاستينج دقيق ونقي متوافق مع الـ Tag الافتراضي
        className={classes}
        style={combinedStyle}
        {...props}
      >
        {children}
      </Tag>
    );
  }
);

TypographyComponent.displayName = 'Typography';

// التصدير السحري لتغيير نوع الـ Ref والـ Props ديناميكياً حسب الـ Tag المستخدم من برا
export const Typography = TypographyComponent as <E extends ElementType = 'p'>(
  props: TypographyProps & { as?: E } & { ref?: React.Ref<React.ComponentRef<E>> }
) => ReactNode;

export default Typography;