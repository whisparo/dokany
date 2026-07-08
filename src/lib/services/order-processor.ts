// src/lib/services/order-orchestrator.ts

import { getDb } from '@/lib/db';
import type { Env } from '@/workers';
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
  env: Env & Record<string, unknown>, // ✅ التصحيح: دمج الـ Index Signature لحل مشكلة الـ env فوراً
  orderData: OrderInput,
  idempotencyKey: string
) {
  // تغليف الفلو بالكامل داخل درع الـ Idempotency لمنع تكرار السحب أو تكرار تحديث الـ Triggers الإحصائية
  return await idempotency.execute(env, idempotencyKey, async () => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const db = getDb(env);

        // 🚀 الـ Transaction الذري: البديل المعماري الخرساني للـ Database Triggers
        return await db.transaction(async (tx) => {
          // 1. إنشاء الطلب الأساسي
          const newOrder = await createOrder(orderData, tx);
          
          // 2. تحديث المخزون (لو المخزن غير كافي هيرمي SystemError ويعمل Rollback فوري)
          await updateStock(orderData.items, tx);
          
          // 3. [Trigger ضمني 1] تحديث إحصائيات المتجر بعد الطلب
          await updateStoreStatsAfterOrder(env, orderData.storeId, orderData.total, tx);
          
          // 4. [Trigger ضمني 2] تحديث إحصائيات العميل إن وُجد
          if (orderData.customerId) {
            await updateCustomerStats(env, orderData.customerId, orderData.total, tx);
          }
          
          // 5. [Trigger ضمني 3] تحديث مبيعات المنتجات دفعة واحدة (Batch) كفاءة على الـ Edge
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
        // لو الخطأ القادم هو خطأ بزنس صريح (زي نفاد المخزون INV_400)، ارميه فوراً وماتعملش Retry!
        if (error instanceof SystemError && !error.retryable) {
          throw error;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          // 🛑 دمج الأخطاء الحرج: استنفاد محاولات المعالجة (فشل الفلو بالكامل)
          throw new SystemError({
            code: 'ORD_500',
            userMessage: 'عذراً، فشلنا في معالجة طلبك بسبب ضغط على النظام. يرجى المحاولة مرة أخرى.',
            category: 'system',
            severity: 'critical',
            retryable: false,
            shouldAlert: true, // شحن إشعار فوري لتليجرام لأن النظام استنفد 3 محاولات كاملة!
            technicalMessage: error instanceof Error ? error.message : 'Order processing exhausted all retry attempts',
            cause: error,
            metadata: { 
              storeId: orderData.storeId,
              customerId: orderData.customerId,
              totalAmount: orderData.total,
              attempts
            }
          });
        }
        
        // Backoff ذكي: الانتظار لوقت متزايد قبل إعادة المحاولة (1s ثم 2s)
        await sleep(1000 * attempts);
      }
    }
  });
}