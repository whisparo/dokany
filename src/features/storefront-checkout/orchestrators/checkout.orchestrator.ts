//src/features/storefront-checkout/orchestrators/checkout.orchestrator.ts

import { getCheckoutRawData } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { adaptCheckoutPage } from '@/features/storefront-checkout/adapters/checkout-page.adapter';
import type { CheckoutPayload } from '@/features/storefront-checkout/adapters/checkout-page.adapter';

// 🔗 استيراد الـ Guards والجداول والأنواع من الـ Schema مباشرة
import { idempotency } from '@/lib/idempotency';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/db/schema/orders';
import type { ShippingAddress } from '@/lib/db/schema/orders';
import { orderItems } from '@/lib/db/schema/order-items';
import type { ProductOptions, OrderItemMetadata } from '@/lib/db/schema/order-items';

// 🚀 الإضافات الحرجة: خصم المخزون + تحديث الإحصائيات
import { updateStock } from '@/lib/services/inventory-service';
import {
  updateStoreStatsAfterOrder,
  updateCustomerStats,
  updateProductStatsBatch,
} from '@/lib/services/store-stats';

import type { Env } from '@/lib/env';

/**
 * 1. جلب بيانات صفحة الدفع (Query - Safe)
 */
export async function getCheckoutData(
  storeId: string,
  env: Env,
  customerId?: string,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): Promise<CheckoutPayload | null> {
  const rawData = await getCheckoutRawData(storeId, env, customerId);
  if (!rawData) return null;

  return adaptCheckoutPage(rawData, selectedShippingId, userCurrency);
}

/**
 * 2. تنفيذ عملية الشراء الفعلية (Mutation - Critical)
 * ✅ الآن: طلب + عناصر + خصم مخزون + إحصائيات في ACID Transaction واحد
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
    taxAmount: string;
    discount: string;
    total: string;
    paymentMethod?: string;
    shippingMethod?: string;
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
      // 🛑 الخطوة أ: إنشاء الطلب الرئيسي
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
          taxAmount: orderInput.taxAmount,
          discount: orderInput.discount,
          total: orderInput.total,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: orderInput.paymentMethod || null,
          shippingMethod: orderInput.shippingMethod || 'standard',
        })
        .returning();

      // 🛑 الخطوة ب: إدراج عناصر الطلب (Bulk Insert)
      await tx.insert(orderItems).values(
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

      // 🚀 الخطوة ج: خصم المخزون داخل نفس الـ Transaction (ACID)
      // لو منتج نفد، الـ transaction كلها هتتراجع والطلب مش هيتعمل
      await updateStock(
        itemsInput.map((item) => ({
          productId: item.productId,
          quantity: item.orderedQty,
        })),
        tx
      );

      // 🚀 الخطوة د: تحديث إحصائيات المتجر (الإيرادات + عدد الطلبات)
      await updateStoreStatsAfterOrder(
        env,
        orderInput.storeId,
        orderInput.total,
        tx
      );

      // 🚀 الخطوة هـ: تحديث إحصائيات العميل (إجمالي المشتريات + عدد الطلبات)
      if (orderInput.customerId) {
        await updateCustomerStats(
          env,
          orderInput.customerId,
          orderInput.total,
          tx
        );
      }

      // 🚀 الخطوة و: تحديث عدادات مبيعات المنتجات
      await updateProductStatsBatch(
        env,
        itemsInput.map((item) => ({
          productId: item.productId,
          quantity: item.orderedQty,
        })),
        tx
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