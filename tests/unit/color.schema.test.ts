// ============================================================
// 📄  المسار: __tests__/contract/color.schema.test.ts
// 🧪  الوظيفة: اختبارات العقود لـ color.schema باستخدام Vitest
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  colorSchema,
  colorPaletteSchema,
  backgroundColorsSchema,
  textColorsSchema,
} from '@/styles/shared/validators/color.schema';

describe('Color Schemas (Contract Tests)', () => {
  describe('colorSchema', () => {
    it('should validate valid Hex colors', () => {
      const validHexes = ['#fff', '#ffffff', '#f0f0f0', '#f0f0f0ff'];
      validHexes.forEach((hex) => {
        expect(colorSchema.safeParse(hex).success).toBe(true);
      });
    });

    it('should validate valid RGB and RGBA colors', () => {
      const validRgb = [
        'rgb(255, 255, 255)',
        'rgb(255 255 255)',
        'rgba(255, 255, 255, 0.5)',
        'rgba(255 255 255 / 0.5)',
      ];
      validRgb.forEach((rgb) => {
        expect(colorSchema.safeParse(rgb).success).toBe(true);
      });
    });

    it('should validate modern color formats (OKLCH, OKLAB, HSL)', () => {
      const modernColors = [
        'hsl(240, 100%, 50%)',
        'hsla(240, 100%, 50%, 0.5)',
        'oklch(0.95 0.01 260)',
        'oklab(0.95 0.01 -0.02)',
      ];
      modernColors.forEach((color) => {
        expect(colorSchema.safeParse(color).success).toBe(true);
      });
    });

    it('should validate named and special CSS colors', () => {
      const specialColors = ['red', 'transparent', 'currentColor', 'inherit'];
      specialColors.forEach((color) => {
        expect(colorSchema.safeParse(color).success).toBe(true);
      });
    });

    it('should reject invalid color strings', () => {
      const invalidColors = ['not-a-color', '#zzzzzz', 'rgb(9999, 0, 0)', ''];
      invalidColors.forEach((color) => {
        const result = colorSchema.safeParse(color);
        expect(result.success, `Color should fail: "${color}"`).toBe(false);
      });
    });
  });

  describe('Complex Group Schemas', () => {
    it('should validate a complete colorPaletteSchema', () => {
      const palette = {
        main: '#0070f3',
        light: '#3291ff',
        dark: '#003366',
        contrastText: '#ffffff',
      };
      expect(colorPaletteSchema.safeParse(palette).success).toBe(true);
    });

    it('should fail colorPaletteSchema if any property is missing or invalid', () => {
      const invalidPalette = {
        main: '#0070f3',
        light: 'invalid-color',
        dark: '#003366',
      };
      expect(colorPaletteSchema.safeParse(invalidPalette).success).toBe(false);
    });

    it('should validate backgroundColorsSchema and textColorsSchema', () => {
      const bg = { default: '#ffffff', paper: '#f4f4f4', elevated: '#ffffff' };
      const text = {
        primary: '#000000',
        secondary: '#666666',
        disabled: '#999999',
        hint: '#cccccc',
      };

      expect(backgroundColorsSchema.safeParse(bg).success).toBe(true);
      expect(textColorsSchema.safeParse(text).success).toBe(true);
    });
  });
});