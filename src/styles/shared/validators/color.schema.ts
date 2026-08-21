// ============================================================
// 📄  المسار: styles/shared/validators/color.schema.ts
// 🎨  الوظيفة: مخططات Zod للتحقق من صحة الألوان مع تصدير أنواع TypeScript
// 🔒  المبدأ: حماية النظام من الألوان غير الصالحة وتوفير العقود للبيئات
// ============================================================

import { z } from 'zod';

// ============================================================
// 🎨  مخططات الألوان الأساسية (Color Schemas)
// ============================================================

/**
 * Regex دقيق لفحص صيغ الألوان الضمان المباشر لنطاق RGB (0-255)
 */
const hexRegex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const rgbRegex = /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*[\s,]\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*[\s,]\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*[\/,]\s*(0|1|0?\.\d+|[0-9]+%))?\s*\)$/i;
const hslRegex = /^hsla?\(\s*(\d+|\d+\.\d+)(deg|rad|turn)?\s*[\s,]\s*(\d+|\d+\.\d+)%\s*[\s,]\s*(\d+|\d+\.\d+)%(?:\s*[\/,]\s*(0|1|0?\.\d+|[0-9]+%))?\s*\)$/i;
const modernColorRegex = /^(oklch|oklab)\([^)]+\)$/i;
const keywordsRegex = /^(transparent|currentColor|inherit|[a-z]+)$/i;

/**
 * التحقق من صيغة اللون (Hex, RGB, RGBA, HSL, HSLA, OKLCH, OKLAB, Named)
 */
export const colorSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (color) =>
      hexRegex.test(color) ||
      rgbRegex.test(color) ||
      hslRegex.test(color) ||
      modernColorRegex.test(color) ||
      keywordsRegex.test(color),
    {
      message:
        'Invalid color format. Use Hex, RGB, RGBA, HSL, HSLA, OKLCH, OKLAB, or named color.',
    }
  );

/**
 * مخطط لون اختياري
 */
export const optionalColorSchema = colorSchema.optional();

/**
 * مخطط لون قابل للكون Null
 */
export const nullableColorSchema = colorSchema.nullable();

/**
 * مخطط لون (مطلوب أو Null)
 */
export const colorOrNullSchema = colorSchema.or(z.null());

// ============================================================
// 🎨  مخططات لوحات الألوان (Color Palette Schemas)
// ============================================================

/**
 * مخطط لوحة ألوان كاملة (main, light, dark, contrastText)
 */
export const colorPaletteSchema = z.object({
  main: colorSchema,
  light: colorSchema,
  dark: colorSchema,
  contrastText: colorSchema,
});

export const optionalColorPaletteSchema = colorPaletteSchema.optional();
export const partialColorPaletteSchema = colorPaletteSchema.partial();

// ============================================================
// 🎨  مخططات مجموعات الألوان (Color Group Schemas)
// ============================================================

export const colorGroupSchema = colorPaletteSchema;
export const stateColorGroupSchema = colorPaletteSchema;

/**
 * مخطط ألوان الخلفية (Background)
 */
export const backgroundColorsSchema = z.object({
  default: colorSchema,
  paper: colorSchema,
  elevated: colorSchema,
});

/**
 * مخطط ألوان النصوص (Text)
 */
export const textColorsSchema = z.object({
  primary: colorSchema,
  secondary: colorSchema,
  disabled: colorSchema,
  hint: colorSchema,
});

/**
 * مخطط ألوان الحدود (Border)
 */
export const borderColorsSchema = z.object({
  subtle: colorSchema,
  strong: colorSchema,
  glow: colorSchema,
});

// ============================================================
// 📜  تصدير الأنواع (TypeScript Types Derived from Zod)
// ============================================================

export type Color = z.infer<typeof colorSchema>;
export type ColorPalette = z.infer<typeof colorPaletteSchema>;
export type BackgroundColors = z.infer<typeof backgroundColorsSchema>;
export type TextColors = z.infer<typeof textColorsSchema>;
export type BorderColors = z.infer<typeof borderColorsSchema>;

// ============================================================
// 🛠️  دوال مساعدة لتحليل الألوان والتباين (Color Utils)
// ============================================================

/**
 * تحويل اللون Hex إلى RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace(/^#/, '');

  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return { r, g, b };
  }

  if (cleanHex.length === 6 || cleanHex.length === 8) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/**
 * حساب السطوع النسبية (Luminance) من RGB وفقاً لـ WCAG
 */
export function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb;

  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;

  const rL = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gL = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bL = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
}

/**
 * حساب نسبة التباين بين لونين (WCAG 2.1)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 1;

  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * التحقق من أن اللون فاتح بما يكفي للتباين
 */
export function isLightEnough(color: string, threshold: number = 128): boolean {
  try {
    const rgb = hexToRgb(color);
    if (!rgb) return true;
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return brightness > threshold;
  } catch {
    return true;
  }
}

/**
 * التحقق من صحة التباين المعتمد لـ WCAG 2.1
 */
export function isValidContrast(
  color1: string,
  color2: string,
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  const ratio = getContrastRatio(color1, color2);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7.0;
}

// ============================================================
// 📦  تصدير عام
// ============================================================

const colorSchemaExport = {
  colorSchema,
  optionalColorSchema,
  nullableColorSchema,
  colorOrNullSchema,
  colorPaletteSchema,
  optionalColorPaletteSchema,
  partialColorPaletteSchema,
  colorGroupSchema,
  stateColorGroupSchema,
  backgroundColorsSchema,
  textColorsSchema,
  borderColorsSchema,
  isLightEnough,
  getContrastRatio,
  isValidContrast,
  hexToRgb,
  getLuminance,
};

export default colorSchemaExport;