// tests/unit/checkout-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { adaptCheckoutPage } from '@/features/storefront-checkout/adapters/checkout-page.adapter';

describe('Checkout Page Adapter - adaptCheckoutPage', () => {
  const mockRawData = {
    storeId: 'store-101',
    store: {
      id: 'store-101',
      name: 'متجر التجربة',
      currency: 'EGP',
      settings: {},
    },
    customer: {
      id: 'cust-202',
      name: 'أحمد محمود',
      email: 'ahmed@example.com',
      phone: '01012345678',
      addresses: [
        {
          id: 'addr-1',
          addressLine1: 'شارع التحرير 12',
          city: 'القاهرة',
          state: 'القاهرة',
          postalCode: '11511',
          country: 'EG',
          isDefault: true,
        },
      ],
    },
    shippingOptions: [
      {
        id: 'ship-1',
        title: 'شحن قياسي',
        price: 50,
        estimatedDays: '2-3 أيام',
      },
    ],
    paymentMethods: [
      {
        id: 'cod',
        name: 'الدفع عند الاستلام',
        enabled: true,
      },
    ],
    cartItems: [
      {
        id: 'item-1',
        productId: 'prod-1',
        variantSku: 'SKU-RED-M',
        productName: 'قميص قطني',
        productSku: 'SKU-RED-M',
        quantity: 2,
        price: 150,
        originalPrice: 150,
      },
    ],
  };

  it('تحويل البيانات الخام إلى CheckoutPayload بصيغة صحيحة للـ UI', () => {
    const result = adaptCheckoutPage(mockRawData as any, 'ship-1', 'EGP');

    expect(result).toBeDefined();
    expect(result.storeId).toBe('store-101');
  });

  it('التعامل مع زائر غير مسجل (Guest Checkout) بدون بيانات عميل', () => {
    const guestRawData = {
      ...mockRawData,
      customer: null,
    };

    const result = adaptCheckoutPage(guestRawData as any, undefined, 'USD');

    expect(result).toBeDefined();
    expect(result.storeId).toBe('store-101');
  });

  it('اختيار أسلوب الشحن المباشر/الافتراضي عند عدم تحديد selectedShippingId', () => {
    const result = adaptCheckoutPage(mockRawData as any, undefined, 'EGP');

    expect(result).toBeDefined();
    expect(result.shippingOptions).toBeDefined();
    expect(result.shippingOptions.length).toBeGreaterThan(0);
  });
});