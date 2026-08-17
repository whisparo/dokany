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
import { updateStock, reserveStockAtomic, compensateStock } from './inventory-service';
import {
  updateStoreStatsAfterOrder,
  updateCustomerStats,
  updateProductStatsBatch,
} from './store-stats';
import { AlertService } from './alert-service';
import { SystemError } from '@/lib/errors';

export type OrderInput = NewOrder & {
  rawItems: RawOrderItemInput[];
};

type PreparedItem = ReturnType<typeof prepareOrderItems>[number];

// نوع مساعد لتخزين نتائج الحجز لكل منتج
type ReservationResult = {
  productId: string;
  quantity: number;
  usedFallback: boolean;
  newStock: number;
};

/**
 * 🎯 معالج الطلب الرئيسي (Two-Phase Commit + Idempotency + Retry)
 * 
 * Flow:
 * 1️⃣ Phase 1: Atomic Stock Reservation (Redis with D1 Fallback)
 * 2️⃣ Phase 2: D1 Transaction (Order + Items + Stats)
 * 3️⃣ Compensation: لو فشل أي حاجة، نرد المخزون
 * 
 * 🛡️ حماية من Double Deduction:
 *   - المنتجات اللي استخدمت Redis Fallback → نخصمها في D1 داخل الـ transaction
 *   - المنتجات اللي استخدمت D1 Fallback → المخزون اتخصم فعلاً في Phase 1، فنتخطاها
 */
export async function processOrder(
  env: Env,
  orderData: OrderInput,
  idempotencyKey: string,
  waitUntil?: (promise: Promise<unknown>) => void
) {
  return await idempotency.execute(env, idempotencyKey, async () => {
    let attempts = 0;
    const maxAttempts = 3;
    let reservations: ReservationResult[] = [];

    while (attempts < maxAttempts) {
      try {
        const db = getDb(env);

        // تحويل المبلغ المالي إلى رقم صحيح (Cents)
        const totalAmountCents = typeof orderData.total === 'string'
          ? parseInt(orderData.total, 10)
          : Number(orderData.total);

        // ═══════════════════════════════════════════════════════════
        // 1️⃣ Phase 1: حجز المخزون باستخدام العداد الذري (خارج الترانساكشن)
        // ═══════════════════════════════════════════════════════════
        const preparedItems = prepareOrderItems(orderData.rawItems, orderData.storeId);
        reservations = [];

        for (const item of preparedItems) {
          const result = await reserveStockAtomic(
            item.productId,
            item.orderedQty,
            orderData.storeId,
            env
          );

          if (!result.success) {
            // فشل الحجز → تعويض كل الحجوزات السابقة
            for (const prev of reservations) {
              await compensateStock(
                prev.productId,
                prev.quantity,
                prev.usedFallback,
                orderData.storeId,
                env
              );
            }
            reservations = [];

            if (result.reason === 'out_of_stock') {
              throw new SystemError({
                code: 'ORD_410',
                userMessage: 'الكمية المطلوبة للمنتج غير متوفرة حالياً في المخزن.',
                category: 'business',
                severity: 'warning',
                retryable: false,
                shouldAlert: false,
                technicalMessage: `Product ${item.productId} out of stock`,
                metadata: { productId: item.productId, requestedQty: item.orderedQty },
              });
            }

            if (result.reason === 'server_busy') {
              throw new SystemError({
                code: 'ORD_503',
                userMessage: 'الخدمة مشغولة حالياً، يرجى المحاولة مرة أخرى.',
                category: 'system',
                severity: 'warning',
                retryable: true,
                shouldAlert: true,
                technicalMessage: `Server busy during stock reservation for ${item.productId}`,
              });
            }

            throw new SystemError({
              code: 'ORD_500',
              userMessage: 'حدث خطأ أثناء حجز المخزون، يرجى المحاولة لاحقاً.',
              category: 'system',
              severity: 'critical',
              retryable: true,
              shouldAlert: true,
              technicalMessage: `Unknown reservation failure for ${item.productId}`,
            });
          }

          reservations.push({
            productId: item.productId,
            quantity: item.orderedQty,
            usedFallback: result.usedFallback || false,
            newStock: result.newStock || 0,
          });
        }

        // ═══════════════════════════════════════════════════════════
        // 2️⃣ Phase 2: تنفيذ الترانساكشن في D1
        // ═══════════════════════════════════════════════════════════
        const newOrder = await db.transaction(async (tx) => {
          // 2.1 إنشاء رأس الطلب
          const createdOrder = await createOrder(orderData, tx);

          // 2.2 حفظ عناصر الطلب دفعة واحدة
          await createOrderItems(createdOrder.id, preparedItems, tx);

          // 2.3 ✅ إصلاح Double Deduction:
          //     نحدث D1 فقط للمنتجات اللي استخدمت Redis (مش D1 Fallback)
          //     لأن D1 Fallback خصم المخزون بالفعل في Phase 1
          const redisReservedItems = preparedItems.filter((item: PreparedItem) => {
            const reservation = reservations.find(r => r.productId === item.productId);
            return reservation && !reservation.usedFallback;
          });

          if (redisReservedItems.length > 0) {
            const stockItems = redisReservedItems.map((item: PreparedItem) => ({
              productId: item.productId,
              variantSku: item.variantSku,
              quantity: item.orderedQty,
            }));
            await updateStock(stockItems, tx);
          }

          // 2.4 تحديث إحصائيات المتجر
          await updateStoreStatsAfterOrder(env, orderData.storeId, totalAmountCents, tx);

          // 2.5 تحديث إحصائيات العميل إن وجد
          if (orderData.customerId) {
            await updateCustomerStats(env, orderData.customerId, totalAmountCents, tx);
          }

          // 2.6 تحديث إحصائيات مبيعات المنتجات
          const productStatsItems = preparedItems.map((item: PreparedItem) => ({
            productId: item.productId,
            quantity: item.orderedQty,
          }));
          await updateProductStatsBatch(env, productStatsItems, tx);

          return createdOrder;
        });

        // ═══════════════════════════════════════════════════════════
        // 3️⃣ نجاح العملية: إرسال تنبيه Low Stock لو لزم
        // ═══════════════════════════════════════════════════════════
        for (const res of reservations) {
          if (res.newStock > 0 && res.newStock <= 5) {
            const alertPromise = AlertService.notifyLowStock(
              env,
              {
                storeId: orderData.storeId,
                productId: res.productId,
                currentStock: res.newStock,
              },
              waitUntil
            );
            
            // لو مفيش waitUntil، نستهلك الـ promise عشان ما يطلعش unhandled rejection
            if (!waitUntil) {
              alertPromise.catch((e) =>
                console.error(`[OrderProcessor] Failed to send low-stock alert for ${res.productId}:`, e)
              );
            }
          }
        }

        // تفريغ الحجوزات عشان ما تتعوضش بعد كده
        reservations = [];
        return newOrder;

      } catch (error) {
        // ═══════════════════════════════════════════════════════════
        // ❌ فشل: تعويض أي مخزون تم حجزه
        // ═══════════════════════════════════════════════════════════
        if (reservations.length > 0) {
          console.warn(`[OrderProcessor] Compensating ${reservations.length} reservations after failure...`);
          for (const res of reservations) {
            try {
              await compensateStock(
                res.productId,
                res.quantity,
                res.usedFallback,
                orderData.storeId,
                env
              );
            } catch (compError) {
              console.error(`[OrderProcessor] Failed to compensate ${res.productId}:`, compError);
            }
          }
          reservations = [];
        }

        // لو SystemError غير قابل للإعادة، ارميه مباشرة
        if (error instanceof SystemError && !error.retryable) {
          throw error;
        }

        // خلاف كده، نعيد المحاولة (Exponential Backoff + Jitter)
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

        const backoffMs = Math.pow(2, attempts) * 200 + Math.random() * 100;
        await sleep(backoffMs);
      }
    }

    // حماية (غير ممكن الوصول إليها)
    throw new SystemError({
      code: 'ORD_500',
      userMessage: 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.',
      category: 'system',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
      technicalMessage: 'processOrder exhausted all attempts without returning',
    });
  });
}