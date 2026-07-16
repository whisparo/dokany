// src/lib/adapters/checkout-page.adapter.ts

import type { CheckoutRawData } from '@/lib/data/checkout-data-fetcher';
import { adaptCheckout as adaptCheckoutUI } from '@/components/storefront/Checkout/Checkout.adapter';
import type { CheckoutPayload } from '@/components/storefront/Checkout/Checkout.adapter';

/**
 * أدابتر صفحة الدفع (Checkout Page Adapter)
 *
 * هذه هي الطبقة العامة التي تتعامل معها الأوركسترا.
 * وظيفتها استقبال البيانات الخام من "Data Fetcher" وتنسيقها إلى Payload جاهز للـ UI.
 *
 * @param rawData - البيانات الخام من "checkout-data-fetcher.ts"
 * @param selectedShippingId - معرف خيار الشحن المختار
 * @param userCurrency - عملة المستخدم
 * @returns CheckoutPayload جاهز للاستخدام في مكون `Checkout`
 */
export function adaptCheckoutPage(
  rawData: CheckoutRawData,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): CheckoutPayload {
  // يتم تفويض المهمة للأدابتر الداخلي للمكون.
  // هذا يحافظ على أن منطق التحويل (الخصومات، الضرائب، التنسيق) يبقى في مكان واحد.
  return adaptCheckoutUI(rawData, selectedShippingId, userCurrency);
}

// إعادة تصدير الأنواع لتكون متاحة للأوركسترا وصفحة الدفع.
export type { CheckoutPayload } from '@/components/storefront/Checkout/Checkout.adapter';