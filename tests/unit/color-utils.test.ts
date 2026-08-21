// ============================================================
// 📄  المسار: __tests__/unit/color-utils.test.ts
// 🧪  الوظيفة: اختبارات الوحدة لدوال معالجة الألوان والتباين
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  getLuminance,
  getContrastRatio,
  isValidContrast,
  isLightEnough,
} from '@/styles/shared/validators/color.schema';

describe('Color Utils (Unit Tests)', () => {
  describe('hexToRgb', () => {
    it('should convert 3-digit hex correctly', () => {
      expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should convert 6-digit hex correctly', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should ignore alpha channel in 8-digit hex', () => {
      expect(hexToRgb('#ffffff80')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should return null for invalid hex strings', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#12')).toBeNull();
    });
  });

  describe('getLuminance', () => {
    it('should return 1 for pure white', () => {
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 4);
    });

    it('should return 0 for pure black', () => {
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    });
  });

  describe('Contrast & Luminance Checks', () => {
    it('should calculate correct contrast ratio between black and white', () => {
      const ratio = getContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 1);
    });

    it('should validate WCAG AA and AAA compliance', () => {
      // الأسود على الأبيض يحقق AA و AAA
      expect(isValidContrast('#000000', '#ffffff', 'AA')).toBe(true);
      expect(isValidContrast('#000000', '#ffffff', 'AAA')).toBe(true);

      // رمادي فاتح جداً على أبيض يفشل في التباين
      expect(isValidContrast('#eeeeee', '#ffffff', 'AA')).toBe(false);
    });

    it('should check if a color is light enough based on threshold', () => {
      expect(isLightEnough('#ffffff', 128)).toBe(true);
      expect(isLightEnough('#000000', 128)).toBe(false);
    });
  });
});