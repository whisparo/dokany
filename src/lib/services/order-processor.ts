// src/lib/services/order-processor.ts

import { getDb } from '@/lib/db';
import type { Env } from '@/lib/env'; // ✅ استيراد النوع الموحد من env.ts
import type { NewOrder } from '@/lib/db/schema/orders';
import { idempotency } from '@/lib/idempotency';
import { sleep } from '@/lib/utils/sleep';
import { createOrder } from './order-service';
import { updateStock } from './inventory-service';
import { updateStoreStatsAfterOrder, updateCustomerStats, updateProductStatsBatch } from './store-stats';
import { SystemError } from '@/lib/errors/types';

type OrderInput = NewOrder & {
  items: { productId: string; quantity: number }[];
};

export async function processOrder(
  env: Env & Record<string, unknown>, // ✅ الآن النوع صحيح
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
          const newOrder = await createOrder(orderData, tx);
          await updateStock(orderData.items, tx);
          await updateStoreStatsAfterOrder(env, orderData.storeId, orderData.total, tx);
          if (orderData.customerId) {
            await updateCustomerStats(env, orderData.customerId, orderData.total, tx);
          }
          await updateProductStatsBatch(
            env,
            orderData.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            tx
          );
          return newOrder;
        });
      } catch (error) {
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
            technicalMessage: error instanceof Error ? error.message : 'Order processing exhausted all retry attempts',
            cause: error,
            metadata: {
              storeId: orderData.storeId,
              customerId: orderData.customerId,
              totalAmount: orderData.total,
              attempts,
            },
          });
        }

        await sleep(1000 * attempts);
      }
    }
  });
}