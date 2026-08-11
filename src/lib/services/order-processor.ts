// src/lib/services/order-processor.ts

import { getDb } from '@/lib/db';
import type { Env } from '@/lib/env';
import type { NewOrder } from '@/lib/db/schema/orders';
import { idempotency } from '@/lib/idempotency';
import { sleep } from '@/lib/utils/sleep';
import {
  createOrder,
  createOrderItems,
  prepareOrderItems,
  type RawOrderItemInput,
} from './order-service';
import { updateStock } from './inventory-service';
import {
  updateStoreStatsAfterOrder,
  updateCustomerStats,
  updateProductStatsBatch,
} from './store-stats';
import { SystemError } from '@/lib/errors/types';

export type OrderInput = NewOrder & {
  rawItems: RawOrderItemInput[];
};

type PreparedItem = ReturnType<typeof prepareOrderItems>[number];

export async function processOrder(
  env: Env,
  orderData: OrderInput,
  idempotencyKey: string
) {
  return await idempotency.execute(env, idempotencyKey, async () => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const db = getDb(env);

        return await db.transaction(async (tx) => {
          // 1️⃣ تحضير وحساب عناصر الطلب
          // 1️⃣ تحضير وحساب عناصر الطلب
          const preparedItems = prepareOrderItems(orderData.rawItems, orderData.storeId);

          // 2️⃣ إنشاء رأس الطلب (Order Header)
          const newOrder = await createOrder(orderData, tx);

          // 3️⃣ حفظ عناصر الطلب دفعة واحدة (Order Items Batch)
          await createOrderItems(newOrder.id, preparedItems, tx);

          // 4️⃣ خصم وتحديث المخزون
          const stockItems = preparedItems.map((item: PreparedItem) => ({
            productId: item.productId,
            variantSku: item.variantSku,
            quantity: item.orderedQty,
          }));
          await updateStock(stockItems, tx);

          // 5️⃣ تحديث إحصائيات المتجر والـ Redis Cache
          await updateStoreStatsAfterOrder(env, orderData.storeId, orderData.total, tx);

          // 6️⃣ تحديث إحصائيات العميل إن وجد
          if (orderData.customerId) {
            await updateCustomerStats(env, orderData.customerId, orderData.total, tx);
          }

          // 7️⃣ تحديث إحصائيات مبيعات المنتجات المشتراة
          const productStatsItems = preparedItems.map((item: PreparedItem) => ({
            productId: item.productId,
            quantity: item.orderedQty,
          }));
          await updateProductStatsBatch(env, productStatsItems, tx);

          return newOrder;
        });
      } catch (error) {
        // إذا كان الخطأ غير قابل للإعادة (مثل خطأ Validation أو عدم كفاية مخزون)، ارمِ الخطأ مباشرة
        if (error instanceof SystemError && !error.retryable) {
          throw error;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          throw new SystemError({
            code: 'ORD_500',
            userMessage: 'عذراً، فشلنا في معالجة طلبك بسبب ضغط على النظام. يرجى المحاولة مرة أخرى.',
            category: 'system',
            severity: 'critical',
            retryable: false,
            shouldAlert: true,
            technicalMessage:
              error instanceof Error
                ? error.message
                : 'Order processing exhausted all retry attempts',
            cause: error,
            metadata: {
              storeId: orderData.storeId,
              customerId: orderData.customerId,
              totalAmount: orderData.total,
              attempts,
            },
          });
        }

        // Tapered backoff delay مع Jitter لمنع الضغط الكثيف المتزامن
        const backoffMs = Math.pow(2, attempts) * 200 + Math.random() * 100;
        await sleep(backoffMs);
      }
    }
  });
}