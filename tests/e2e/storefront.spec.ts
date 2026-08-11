// tests/e2e/storefront.spec.ts
import { test, expect } from '@playwright/test';

test.describe('E2E - Storefront Navigation', () => {

  test('يجب أن تفتح الصفحة الرئيسية بشكل صحيح', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

});