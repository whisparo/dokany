// src/lib/orchestrators/checkout.orchestrator.ts

import { getCheckoutRawData } from '@/lib/data/checkout-data-fetcher';
import { adaptCheckoutPage } from '@/lib/adapters/checkout-page.adapter';
import type { CheckoutPayload } from '@/lib/adapters/checkout-page.adapter';

// 🔗 استيراد الـ Guards والجداول والأنواع من الـ Schema مباشرة
import { idempotency } from '@/lib/idempotency';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/db/schema/orders'; 
import type { ShippingAddress } from '@/lib/db/schema/orders'; // ✅ المصدر الأصلي والوحيد للنوع
import { orderItems } from '@/lib/db/schema/order-items';
import type { ProductOptions, OrderItemMetadata } from '@/lib/db/schema/order-items';

import type { Env } from '@/lib/env';

/**
 * 1. جلب بيانات صفحة الدفع (Query - Safe)
 */
export async function getCheckoutData(
  storeId: string,
  customerId?: string,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): Promise<CheckoutPayload | null> {
  const rawData = await getCheckoutRawData(storeId, customerId);
  if (!rawData) return null;

  return adaptCheckoutPage(rawData, selectedShippingId, userCurrency);
}

/**
 * 2. تنفيذ عملية الشراء الفعلية (Mutation - Critical)
 * متوافقة بالكامل مع الـ Check Constraints لجدول الـ orders
 */
export async function processCheckout(
  env: Env & Record<string, unknown>,
  idempotencyKey: string,
  orderInput: {
    id: string;
    orderNumber: string;
    storeId: string;
    customerId: string;
    shippingAddress: ShippingAddress;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    currency?: string;
    subtotal: string;
    shippingCost: string;
    taxAmount: string;  // ✅ أضفنا هذا الحقل لتلبية قيد chk_order_total_calculation
    discount: string;   // ✅ أضفنا هذا الحقل لتلبية قيد chk_order_total_calculation
    total: string;
    paymentMethod?: string; // ✅ اختياري لتلبية قيد chk_payment_method_required
    shippingMethod?: string; // ✅ اختياري لتلبية قيد chk_shipping_method
  },
  itemsInput: {
    productId: string;
    variantSku: string;
    productName: string;
    productSku: string;
    productSlug?: string;
    productImage?: string;
    productOptions?: ProductOptions;
    orderedQty: number;
    price: string;
    lineTotal: string;
    originalPrice: string;
    discount?: string;
    netAmount: string;
    metadata?: OrderItemMetadata;
  }[]
) {
  return await idempotency.execute(env, idempotencyKey, async () => {
    const db = getDb(env);

    return await db.transaction(async (tx) => {
      
      // 🛑 الخطوة أ: إنشاء الطلب الرئيسي (Parent Order)
      const [newOrder] = await tx
        .insert(orders)
        .values({
          id: orderInput.id,
          orderNumber: orderInput.orderNumber,
          storeId: orderInput.storeId,
          customerId: orderInput.customerId,
          shippingAddress: JSON.stringify(orderInput.shippingAddress) as any,
          customerName: orderInput.customerName,
          customerPhone: orderInput.customerPhone,
          customerEmail: orderInput.customerEmail || null,
          currency: orderInput.currency || 'EGP',
          subtotal: orderInput.subtotal,
          shippingCost: orderInput.shippingCost,
          taxAmount: orderInput.taxAmount,   // ✅ تمريرها للـ DB
          discount: orderInput.discount,     // ✅ تمريرها للـ DB
          total: orderInput.total,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: orderInput.paymentMethod || null,
          shippingMethod: orderInput.shippingMethod || 'standard',
        })
        .returning();

      // 🛑 الخطوة ب: إدراج عناصر الطلب دفعة واحدة (Bulk Insert Items)
      await tx
        .insert(orderItems)
        .values(
          itemsInput.map((item) => ({
            orderId: newOrder.id,
            productId: item.productId,
            storeId: orderInput.storeId,
            variantSku: item.variantSku,
            productName: item.productName,
            productSku: item.productSku,
            productSlug: item.productSlug || null,
            productImage: item.productImage || null,
            productOptions: item.productOptions || {},
            orderedQty: item.orderedQty,
            price: item.price,
            lineTotal: item.lineTotal,
            originalPrice: item.originalPrice,
            discount: item.discount || '0',
            netAmount: item.netAmount,
            status: 'pending',
            fulfillmentStatus: 'unfulfilled',
            metadata: item.metadata || {},
          }))
        );

      return {
        success: true,
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        message: 'Order and items created successfully within an isolated ACID transaction.',
      };
    });
  });
}