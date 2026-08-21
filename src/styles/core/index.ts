/* src/styles/shared/validators/theme.schema.ts */
// ============================================================
// 📄  المسار: src/styles/shared/validators/theme.schema.ts
// 🛡️  الوظيفة: مخططات Zod للتحقق من صحة الثيم
// 🔒  المبدأ: حماية النظام من البيانات غير الصالحة
// ============================================================

import { z } from 'zod';

// ============================================================
// 🎨  مخططات الألوان (Color Schemas)
// ============================================================

const colorSchema = z
  .string()
  .regex(
    /^(#([0-9a-f]{3}){1,2}|#([0-9a-f]{4}){1,2}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|oklch\([^)]+\)|transparent|currentColor|[a-z]+)$/i,
    'Invalid color format. Use Hex, RGB, RGBA, HSL, HSLA, OKLCH, or named color.'
  )
  .min(1)
  .max(50);

const colorPaletteSchema = z.object({
  main: colorSchema,
  light: colorSchema,
  dark: colorSchema,
  contrastText: colorSchema,
});

// ============================================================
// 🎨  مخطط نظام الألوان الكامل
// ============================================================

const colorSystemSchema = z.object({
  primary: colorPaletteSchema,
  secondary: colorPaletteSchema,
  success: colorPaletteSchema,
  warning: colorPaletteSchema,
  danger: colorPaletteSchema,
  info: colorPaletteSchema,
  background: z.object({
    default: colorSchema,
    paper: colorSchema,
    elevated: colorSchema,
  }),
  text: z.object({
    primary: colorSchema,
    secondary: colorSchema,
    disabled: colorSchema,
    hint: colorSchema,
  }),
  border: z.object({
    subtle: colorSchema,
    strong: colorSchema,
    glow: colorSchema,
  }),
});

// ============================================================
// 📝  مخططات الطباعة (Typography Schemas)
// ============================================================

const fontSizeSchema = z.object({
  xs: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  sm: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  md: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  lg: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  xl: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  '2xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  '3xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
  '4xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Font size must be in px, rem, or em'),
});

const fontWeightSchema = z.object({
  light: z.number().int().min(100).max(900),
  regular: z.number().int().min(100).max(900),
  medium: z.number().int().min(100).max(900),
  semibold: z.number().int().min(100).max(900),
  bold: z.number().int().min(100).max(900),
});

const lineHeightSchema = z.object({
  tight: z.number().positive().min(0.8).max(2),
  normal: z.number().positive().min(0.8).max(2),
  relaxed: z.number().positive().min(0.8).max(2),
});

const typographyScaleSchema = z.object({
  fontFamily: z.string().min(1).max(200),
  fontFamilyArabic: z.string().min(1).max(200),
  fontSize: fontSizeSchema,
  fontWeight: fontWeightSchema,
  lineHeight: lineHeightSchema,
});

// ============================================================
// 📐  مخططات الأبعاد والظلال والحركة
// ============================================================

const spacingSystemSchema = z.object({
  unit: z.number().int().positive().min(1).max(20),
  xs: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  sm: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  md: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  lg: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  xl: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  '2xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  '3xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
  '4xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Spacing must be in px, rem, or em'),
});

const radiusSystemSchema = z.object({
  none: z.string(),
  sm: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Radius must be in px, rem, em, or %'),
  md: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Radius must be in px, rem, em, or %'),
  lg: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Radius must be in px, rem, em, or %'),
  xl: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Radius must be in px, rem, em, or %'),
  '2xl': z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Radius must be in px, rem, em, or %'),
  full: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$|^9999px$/, 'Radius must be in px, rem, em, %, or 9999px'),
});

const shadowSystemSchema = z.object({
  xs: z.string(),
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  xl: z.string(),
  '2xl': z.string(),
  glow: z.string(),
});

const motionSystemSchema = z.object({
  fast: z.string(),
  base: z.string(),
  slow: z.string(),
  extraSlow: z.string(),
});

// ============================================================
// 🎨  مخطط الثيم الكامل
// ============================================================

export const themeSchema = z.object({
  // الهوية
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(20),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),

  // 🔄  التوريث (اختياري)
  extends: z.string().min(1).max(100).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),

  // الأنظمة البصرية
  colors: colorSystemSchema,
  typography: typographyScaleSchema,
  spacing: spacingSystemSchema,
  radius: radiusSystemSchema,
  shadows: shadowSystemSchema,
  motion: motionSystemSchema,

  // الأزرار
  button: z.object({
    borderRadius: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Border radius must be in px, rem, em, or %'),
    padding: z.object({
      small: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Padding must be in px, rem, or em'),
      medium: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Padding must be in px, rem, or em'),
      large: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Padding must be in px, rem, or em'),
    }),
  }),

  // البطاقات
  card: z.object({
    borderRadius: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%)$/, 'Border radius must be in px, rem, em, or %'),
    shadow: z.string().min(1).max(200),
    padding: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Padding must be in px, rem, or em'),
  }),

  // التخطيط العام
  layout: z.object({
    maxWidth: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%|vw|vh)$/, 'Max width must be in px, rem, em, %, vw, or vh'),
    containerPadding: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Container padding must be in px, rem, or em'),
    headerHeight: z.string().regex(/^\d+(\.\d+)?(px|rem|em|vh)$/, 'Header height must be in px, rem, em, or vh'),
    footerHeight: z.string().regex(/^\d+(\.\d+)?(px|rem|em|vh)$/, 'Footer height must be in px, rem, em, or vh'),
    sidebarWidth: z.string().regex(/^\d+(\.\d+)?(px|rem|em|%|vw)$/, 'Sidebar width must be in px, rem, em, %, or vw'),
  }),

  // ⏱️  بيانات التحكم (للكاش)
  updatedAt: z.number().int().positive(),

  // التخصيص المفتوح (اختياري)
  custom: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// 🧩  أنواع مساعدة للـ Zod
// ============================================================

export type ThemeSchema = z.infer<typeof themeSchema>;

// ============================================================
// 🛠️  دوال مساعدة للتحقق
// ============================================================

export function validateTheme(data: unknown) {
  return themeSchema.safeParse(data);
}

export function parseTheme(data: unknown) {
  return themeSchema.parse(data);
}

export function validateThemePartial(data: unknown) {
  return themeSchema.partial().safeParse(data);
}

export function isValidColor(color: string): boolean {
  return colorSchema.safeParse(color).success;
}

export function isValidSpacing(spacing: unknown): boolean {
  return spacingSystemSchema.safeParse(spacing).success;
}

// ============================================================
// 📦  تصدير عام
// ============================================================

const validatorsExport = {
  themeSchema,
  validateTheme,
  parseTheme,
  validateThemePartial,
  isValidColor,
  isValidSpacing,
};

export default validatorsExport;