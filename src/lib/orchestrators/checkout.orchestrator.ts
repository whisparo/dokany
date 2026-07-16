// src/lib/orchestrators/checkout.orchestrator.ts

import { getCheckoutRawData } from '@/lib/data/checkout-data-fetcher';
// ✅ استيراد الأدابتر الصحيح والأنواع من مسارها الفعلي الجديد
import { adaptCheckoutPage } from '@/lib/adapters/checkout-page.adapter';
import type { CheckoutPayload } from '@/lib/adapters/checkout-page.adapter';

/**
 * أوركسترا صفحة الدفع
 * تجمع بين جلب البيانات من الـ Fetcher وتحويلها عبر الـ Page Adapter لتقديمها للـ Server Component
 */
export async function getCheckoutData(
  storeId: string,
  customerId?: string,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): Promise<CheckoutPayload | null> {
  // 1. جلب البيانات الخام من الخادم
  const rawData = await getCheckoutRawData(storeId, customerId);
  if (!rawData) return null;

  // 2. تحويل البيانات باستخدام الـ Page Adapter الوسيط
  return adaptCheckoutPage(rawData, selectedShippingId, userCurrency);
}