// tests/unit/order-calculation.test.ts
import { describe, it, expect } from 'vitest';
import { OrderService } from '@/lib/services/order-service';

describe('OrderService - Order Totals & Calculations', () => {

  it('حساب الإجمالي الشامل بصورة صحيحة (Subtotal + Shipping + Tax - Discount)', () => {
    const input = {
      subtotal: 500,
      shippingCost: 50,
      taxAmount: 70, // 14% ضريبة مثلاً
      discount: 20,
    };

    const result = OrderService.calculateOrderTotals(input);

    expect(result).toEqual({
      subtotal: '500.00',
      shippingCost: '50.00',
      taxAmount: '70.00',
      discount: '20.00',
      total: '600.00', // (500 + 50 + 70) - 20 = 600
    });
  });

  it('التعامل الصحيح مع القيم الاختيارية والغائبة (Undefined Values)', () => {
    const input = {
      subtotal: 250,
      shippingCost: 30,
    };

    const result = OrderService.calculateOrderTotals(input);

    expect(result.taxAmount).toBe('0.00');
    expect(result.discount).toBe('0.00');
    expect(result.total).toBe('280.00'); // 250 + 30
  });

  it('توليد رقم طلب (Order Number) بصيغة صحيحة وغير متكررة', () => {
    const orderNum1 = OrderService.generateOrderNumber();
    const orderNum2 = OrderService.generateOrderNumber();

    expect(orderNum1).toBeDefined();
    expect(typeof orderNum1).toBe('string');
    expect(orderNum1).not.toBe(orderNum2);
  });

  it('تحضير عناصر الطلب مع حساب lineTotal بدقة ومنع المبالغ السالبة', () => {
    const rawItems = [
      {
        productId: 'prod-1',
        variantSku: 'SKU-RED-M',
        productName: 'قميص قطني',
        productSku: 'SKU-RED-M',
        orderedQty: 2,
        price: 150,
        originalPrice: 150,
      },
      {
        productId: 'prod-2',
        variantSku: 'SKU-BLUE-L',
        productName: 'بنطال جينز',
        productSku: 'SKU-BLUE-L',
        orderedQty: 1,
        price: 300,
        originalPrice: 350,
        discount: 50,
      },
    ];

    const prepared = OrderService.prepareOrderItems(rawItems as any, 'store-123');

    expect(prepared).toHaveLength(2);

    // عنصر 1: 2 * 150 = 300
    expect(prepared[0].lineTotal).toBe('300.00');
    expect(prepared[0].netAmount).toBe('300.00');

    // عنصر 2: 1 * 300 - الخصم 50 = 250
    expect(prepared[1].lineTotal).toBe('300.00');
    expect(prepared[1].netAmount).toBe('250.00');
  });

});