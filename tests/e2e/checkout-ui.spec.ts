// tests/e2e/checkout-ui.spec.ts
import { test, expect } from '@playwright/test';

test.describe('E2E - رحلة العميل وشاشة الشراء', () => {

  test('يجب أن يتمكن الزائر من استعراض الصفحة الرئيسية', async ({ page }) => {
    // 1. الانتقال للصفحة الرئيسية
    await page.goto('/');

    // 2. التحقق من تحميل الصفحة (يمكن التعديل لـ "Create Next App" أو فحص عنصر معين)
    await expect(page).toHaveTitle(/Create Next App/i);
  });

});