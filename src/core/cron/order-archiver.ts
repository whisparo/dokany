// src/core/cron/order-archiver.ts

/**
 * نقل الطلبات المعلقة من KV (Buffer) إلى D1 (أرشيف نهائي)
 * يتم تشغيل هذا الملف عن طريق الـ Cron Job كل 5 دقائق
 * 
 * المفاتيح في KV: pending_order:{storeId}:{idempotencyKey}
 * قيمة المفتاح: JSON string يحتوي على كامل بيانات الطلب
 * 
 * التدفق:
 *   1. قفل (flush_lock) لمنع التشغيل المتزامن
 *   2. جلب جميع المفاتيح التي تبدأ بـ pending_order: باستخدام cursor
 *   3. تقطيع إلى دفعات (200 طلب)
 *   4. لكل دفعة: Batch Insert في D1 (باستخدام INSERT OR IGNORE)
 *   5. إذا نجحت الدفعة: حذف المفاتيح المعالجة من KV
 *   6. إذا فشلت: تسجيل في DLQ وترك المفاتيح في KV
 */

import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/**
 * هيكل الطلب المخزن في KV (Buffer)
 * مطابق لـ OrderPayload المستخدم في checkout handler
 */
export interface OrderPayload {
  orderId: string;
  idempotencyKey: string;
  storeId: string;
  items: Array<{ id: string; qty: number; priceInt: number }>;
  totalAmountInt: number;
  timestamp: number;
}

// ============================================================
// 🔧 دوال مساعدة داخلية
// ============================================================

/** تأخير (ms) */
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** توليد مفتاح القفل */
const LOCK_KEY = 'flush_lock';

/** مدة صلاحية القفل (10 دقائق) */
const LOCK_TTL = 600;

/** حجم الدفعة الواحدة */
const BATCH_SIZE = 200;

/** عدد محاولات الـ list() */
const LIST_RETRY_ATTEMPTS = 3;

/** تأخير بين محاولات الـ list() (ثواني) */
const LIST_RETRY_DELAY_MS = 1000;

/** عدد محاولات الـ batch insert */
const BATCH_RETRY_ATTEMPTS = 3;

/** تأخيرات الـ batch insert (Exponential Backoff) */
const BATCH_RETRY_DELAYS = [500, 1000, 2000]; // ms

// ============================================================
// 📤 الدالة الرئيسية: archiveOrders
// ============================================================

/**
 * تنفيذ دورة تفريغ الطلبات المعلقة من KV إلى D1
 * @param env - بيئة Worker
 * @returns { success: boolean; message?: string; processedCount?: number; errors?: string[] }
 */
export async function archiveOrders(
  env: Env
): Promise<{
  success: boolean;
  message?: string;
  processedCount?: number;
  errors?: string[];
}> {
  const errors: string[] = [];
  let processedCount = 0;

  console.log('🔄 Starting order archiving cycle...');

  // ============================================================
  // 1️⃣ محاولة الحصول على القفل (لمنع التشغيل المتزامن)
  // ============================================================
  const lock = await env.BUFFER_KV.get(LOCK_KEY);
  if (lock) {
    console.log('⏳ Flush already in progress, skipping...');
    return {
      success: false,
      message: 'Flush already in progress',
    };
  }

  try {
    // تعيين القفل مع TTL
    await env.BUFFER_KV.put(LOCK_KEY, 'LOCKED', { expirationTtl: LOCK_TTL });
    console.log('🔒 Lock acquired for archiving.');

    // ============================================================
    // 2️⃣ جلب جميع مفاتيح الطلبات المعلقة (مع Retry)
    // ============================================================
    const keys: string[] = [];
    let cursor: string | undefined;

    let listAttempt = 0;
    let listSuccess = false;

    while (listAttempt < LIST_RETRY_ATTEMPTS && !listSuccess) {
      try {
        do {
          const listResult = await env.BUFFER_KV.list({
            prefix: 'pending_order:',
            cursor,
          });
          keys.push(...listResult.keys.map((k) => k.name));
          
          // حل مشكلة الـ TypeScript Cursor Type
          cursor = listResult.list_complete ? undefined : listResult.cursor;
        } while (cursor);

        listSuccess = true;
        console.log(`📦 Found ${keys.length} pending order keys.`);
      } catch (error) {
        listAttempt++;
        const message = error instanceof Error ? error.message : 'Unknown list error';
        console.warn(`⚠️ List attempt ${listAttempt} failed: ${message}`);
        if (listAttempt < LIST_RETRY_ATTEMPTS) {
          await delay(LIST_RETRY_DELAY_MS);
        } else {
          // فشل كامل في الـ list
          const errorMsg = `List failed after ${LIST_RETRY_ATTEMPTS} attempts: ${message}`;
          errors.push(errorMsg);
          await logToDLQ(env, [], errorMsg);
          
          console.error('❌ All list attempts failed. Aborting archiving cycle.');
          return {
            success: false,
            message: 'Failed to list pending orders',
            errors,
          };
        }
      }
    }

    if (keys.length === 0) {
      console.log('📭 No pending orders to archive.');
      await env.BUFFER_KV.delete(LOCK_KEY);
      return {
        success: true,
        message: 'No pending orders',
        processedCount: 0,
      };
    }

    // ============================================================
    // 3️⃣ معالجة الدفعات (Batches)
    // ============================================================
    const chunks = [];
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      chunks.push(keys.slice(i, i + BATCH_SIZE));
    }

    console.log(`🧩 Processing ${chunks.length} chunks (${BATCH_SIZE} orders max per chunk).`);

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunkKeys = chunks[chunkIdx];
      const chunkOrders: OrderPayload[] = [];

      // قراءة بيانات الطلبات من KV
      for (const key of chunkKeys) {
        const raw = await env.BUFFER_KV.get(key);
        if (raw) {
          try {
            const order = JSON.parse(raw) as OrderPayload;
            if (order.orderId && order.idempotencyKey && order.storeId) {
              chunkOrders.push(order);
            } else {
              console.warn(`⚠️ Invalid order data in key ${key}, skipping.`);
            }
          } catch (parseError) {
            const message = parseError instanceof Error ? parseError.message : 'Unknown parse error';
            console.warn(`⚠️ Failed to parse order from key ${key}: ${message}`);
            
            await logToDLQ(env, [key], `Parse error: ${message}`);
            await env.BUFFER_KV.delete(key);
          }
        }
      }

      if (chunkOrders.length === 0) {
        continue;
      }

      // معالجة الدفعة مع Retry
      let batchSuccess = false;
      let lastError: string | null = null;

      for (let attempt = 0; attempt < BATCH_RETRY_ATTEMPTS; attempt++) {
        try {
          const statements = chunkOrders.map((order) => {
            const payloadJson = JSON.stringify(order);
            return env.DB.prepare(
              `INSERT OR IGNORE INTO orders 
               (id, idempotency_key, store_id, total_amount_int, status, payload, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              order.orderId,
              order.idempotencyKey,
              order.storeId,
              order.totalAmountInt,
              'PROCESSED',
              payloadJson,
              order.timestamp
            );
          });

          await env.DB.batch(statements);

          batchSuccess = true;
          console.log(`✅ Chunk ${chunkIdx + 1}/${chunks.length} inserted successfully.`);

          for (const key of chunkKeys) {
            await env.BUFFER_KV.delete(key);
          }
          processedCount += chunkOrders.length;

          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown DB error';
          lastError = message;
          console.warn(
            `⚠️ Batch insert attempt ${attempt + 1} failed for chunk ${chunkIdx + 1}: ${message}`
          );
          if (attempt < BATCH_RETRY_ATTEMPTS - 1) {
            await delay(BATCH_RETRY_DELAYS[attempt]);
          }
        }
      }

      if (!batchSuccess) {
        const errorMsg = `Batch insert failed after ${BATCH_RETRY_ATTEMPTS} attempts: ${lastError || 'Unknown error'}`;
        errors.push(`Chunk ${chunkIdx + 1}: ${errorMsg}`);

        await logToDLQ(env, chunkKeys, errorMsg);
        console.error(`❌ Chunk ${chunkIdx + 1} failed. Keys kept in KV for retry next cycle.`);
      }
    }

    // ============================================================
    // 4️⃣ تحرير القفل
    // ============================================================
    await env.BUFFER_KV.delete(LOCK_KEY);
    console.log('🔓 Lock released.');

    console.log(`✅ Archiving cycle completed. Processed ${processedCount} orders.`);
    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} errors occurred during archiving.`);
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? 'All orders archived successfully' : 'Some orders failed',
      processedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error(`❌ Archiving cycle crashed: ${message}`);
    
    try {
      await env.BUFFER_KV.delete(LOCK_KEY);
    } catch {
      // تجاهل
    }
    
    return {
      success: false,
      message: `Archiving cycle crashed: ${message}`,
      errors: [message],
    };
  }
}

// ============================================================
// 📝 تسجيل الفشل في DLQ (دالة مساعدة مؤقتة لحين بناء dlq-handler)
// ============================================================

async function logToDLQ(
  env: Env,
  keys: string[],
  errorLog: string
): Promise<void> {
  if (keys.length === 0) return;

  try {
    const payload = JSON.stringify(keys);
    await env.DB.prepare(
      `INSERT INTO dead_letter_batches (id, orders_count, payload, error_log, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      `dlq_${Date.now()}_${keys.length}`,
      keys.length,
      payload,
      errorLog,
      Date.now()
    ).run();
    console.log(`📝 DLQ entry created for ${keys.length} keys.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DLQ error';
    console.error(`❌ Failed to log to DLQ: ${message}`);
  }
}