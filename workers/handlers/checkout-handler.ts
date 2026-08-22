// src/workers/handlers/checkout-handler.ts

/**
 * 💳 Checkout Handler – معالجة طلبات الشراء
 *
 * المسؤوليات:
 *   1. التحقق من صحة بيانات الطلب (Zod + Fraud Protection)
 *   2. خصم المخزون من KV (Atomic)
 *   3. تخزين الطلب في Buffer (KV) مع Idempotency Key
 *   4. Rollback فوري في حال فشل كتابة Buffer
 *   5. تحديث الإحصائيات وإرسال إشعار Telegram (Async)
 *   6. إرجاع استجابة مناسبة (200/409/500)
 */

import type { Env } from '../../src/lib/env';
import { validateCheckoutPayload, type CheckoutPayload } from '../../src/core/snapshot/validator';
import { deductStock, rollbackStock } from '../../src/core/live-state/stock';
import { incrementStats } from '../../src/core/live-state/stats';
import { sendAlert } from '../../src/core/cron/dlq-handler';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

export interface CheckoutResponse {
  success: boolean;
  orderId?: string;
  error?: string;
  message?: string;
}

// ============================================================
// 📤 الدالة الرئيسية
// ============================================================

/**
 * معالجة طلب الشراء
 *
 * @param request - طلب HTTP
 * @param env - بيئة Worker
 * @param ctx - سياق التنفيذ (لـ waitUntil)
 * @returns استجابة HTTP
 */
export async function handleCheckout(
  request: Request,
  env: Env & { DB: D1Database },
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 1️⃣ قراءة الـ Payload
    const rawPayload = await request.json().catch(() => null);
    if (!rawPayload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ التحقق من صحة البيانات (Zod + Fraud Protection)
    const validation = validateCheckoutPayload(rawPayload);
    if (!validation.success) {
      const errorMessages = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return new Response(
        JSON.stringify({ success: false, error: `Validation failed: ${errorMessages}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = validation.data as CheckoutPayload;
    const { storeId, idempotencyKey, items, totalAmountInt } = payload;

    // 3️⃣ استخراج storeSlug (للمفاتيح في KV)
    // نستخدم storeId مباشرة، لكن الـ stock keys تعتمد على storeSlug.
    // نمرر storeId كـ slug مؤقتاً (يمكن تحسينه لاحقاً)
    const storeSlug = storeId; // في الإنتاج، يجب استخراج slug من Hostname

    // 4️⃣ Atomic Rollback Block
    let deductedItems: Array<{ productId: string; quantity: number }> = [];
    let stockDeductionSuccess = true;

    try {
      // خصم المخزون لكل منتج
      for (const item of items) {
        const result = await deductStock(storeSlug, item.id, item.qty, env);
        if (!result.success) {
          // فشل الخصم → Rollback لكل ما تم خصمه سابقاً
          stockDeductionSuccess = false;
          // Rollback الكميات المخصومة سابقاً
          for (const deducted of deductedItems) {
            await rollbackStock(storeSlug, deducted.productId, deducted.quantity, env);
          }
          return new Response(
            JSON.stringify({
              success: false,
              error: result.error || 'Insufficient stock',
              message: result.error || 'Out of stock',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        deductedItems.push({ productId: item.id, quantity: item.qty });
      }
    } catch (error) {
      // خطأ غير متوقع أثناء الخصم → Rollback
      for (const deducted of deductedItems) {
        await rollbackStock(storeSlug, deducted.productId, deducted.quantity, env);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({ success: false, error: `Stock deduction failed: ${message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ كتابة الطلب في Buffer (KV) مع Idempotency Key
    const orderKey = `pending_order:${storeId}:${idempotencyKey}`;
    const orderPayload = {
      orderId: `ord_${Date.now()}_${idempotencyKey.slice(0, 8)}`,
      idempotencyKey,
      storeId,
      items,
      totalAmountInt,
      timestamp: Date.now(),
    };

    try {
      await env.BUFFER_KV.put(orderKey, JSON.stringify(orderPayload));
    } catch (error) {
      // فشل كتابة Buffer → Rollback المخزون
      for (const deducted of deductedItems) {
        await rollbackStock(storeSlug, deducted.productId, deducted.quantity, env);
      }
      const message = error instanceof Error ? error.message : 'Unknown KV error';
      return new Response(
        JSON.stringify({ success: false, error: `Failed to store order: ${message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ تحديث الإحصائيات وإرسال إشعار Telegram (Async)
    ctx.waitUntil(
      (async () => {
        try {
          // تحديث الإحصائيات (باستخدام incrementStats)
          await incrementStats(storeSlug, totalAmountInt, env);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to update stats for ${storeSlug}:`, message);
        }

        try {
          // إرسال إشعار Telegram
          const alertMessage =
            `🛒 <b>طلب جديد!</b>\n` +
            `🆔 المتجر: <code>${storeId}</code>\n` +
            `💰 المبلغ: ${(totalAmountInt / 100).toFixed(2)} EGP\n` +
            `📦 الطلب: <code>${orderPayload.orderId}</code>`;
          await sendAlert(env, {
            title: 'طلب جديد',
            message: alertMessage,
            level: 'info',
            metadata: { storeId, orderId: orderPayload.orderId, totalAmountInt },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to send Telegram alert for ${storeId}:`, message);
        }
      })()
    );

    // 7️⃣ رد 200 OK
    return new Response(
      JSON.stringify({
        success: true,
        orderId: orderPayload.orderId,
        message: 'Order placed successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // خطأ عام غير متوقع
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}