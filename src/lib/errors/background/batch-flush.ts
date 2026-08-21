// src/lib/errors/background/batch-flush.ts

import type { KVNamespace, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '@/lib/env';

export interface ProcessedOrderPayload {
  idempotencyKey: string;
  storeId: string;
  totalAmountInt: number;
  totalQty: number;
  items: Array<{
    productId: string;
    qty: number;
    unitPriceInt: number;
  }>;
  customerInfo: {
    name: string;
    phone: string;
    address?: string;
  };
  [key: string]: unknown;
}

export interface BatchFlushResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  dlqRecorded: boolean;
  durationMs: number;
  error?: string;
}

/**
 * 🔄 المعالج الخلفي لتفريغ الطلبات المعلقة من الـ KV إلى D1
 */
export async function processBatchFlush(
  env: Env,
  batchSize: number = 200
): Promise<BatchFlushResult> {
  const startTime = performance.now();
  let totalProcessed = 0;
  let successCount = 0;
  let failureCount = 0;
  let dlqRecorded = false;

  const kvInstance: KVNamespace | undefined = env.CUSTOM_DOMAINS_KV;

  if (!kvInstance) {
    return {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      dlqRecorded: false,
      durationMs: performance.now() - startTime,
      error: 'CUSTOM_DOMAINS_KV is missing from environment bindings',
    };
  }

  try {
    let cursor: string | undefined = undefined;

    type ListResult = Awaited<ReturnType<KVNamespace['list']>>;
    type KeyItem = ListResult['keys'][number];

    const allKeys: KeyItem[] = [];

    // 1️⃣ جلب المفاتيح مع تحديد نوع listRes صراحة
    let listAttempts = 0;
    while (listAttempts < 3) {
      try {
        const listRes: ListResult = await kvInstance.list({
          prefix: 'pending_order:',
          limit: 1000,
          cursor,
        });

        allKeys.push(...listRes.keys);

        if (listRes.list_complete) {
          break;
        }
        cursor = listRes.cursor;
      } catch (err) {
        listAttempts++;
        if (listAttempts >= 3) {
          throw new Error(
            `Failed to list KV keys after 3 attempts: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (allKeys.length === 0) {
      return {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
        dlqRecorded: false,
        durationMs: performance.now() - startTime,
      };
    }

    // 2️⃣ التقطيع والترحيل بـ Batches
    for (let i = 0; i < allKeys.length; i += batchSize) {
      const chunkKeys = allKeys.slice(i, i + batchSize);
      const stmts: D1PreparedStatement[] = [];
      const keysToDelete: string[] = [];

      for (const keyObj of chunkKeys) {
        const rawData = await kvInstance.get(keyObj.name);
        if (!rawData) continue;

        try {
          const data: ProcessedOrderPayload = JSON.parse(rawData);

          stmts.push(
            env.DB.prepare(
              `INSERT INTO buffered_orders (id, store_id, idempotency_key, total_amount_int, payload, status)
               VALUES (?, ?, ?, ?, ?, 'FLUSHED')
               ON CONFLICT(idempotency_key) DO NOTHING;`
            ).bind(
              crypto.randomUUID(),
              data.storeId || 'default',
              data.idempotencyKey,
              data.totalAmountInt,
              rawData
            )
          );
          keysToDelete.push(keyObj.name);
        } catch (e) {
          console.error(`[BatchFlush] Failed to parse payload for key: ${keyObj.name}`, e);
        }
      }

      if (stmts.length === 0) continue;

      totalProcessed += stmts.length;

      // 3️⃣ Retry Loop بـ Exponential Backoff
      let dbSuccess = false;
      let retryDelay = 500;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await env.DB.batch(stmts);
          dbSuccess = true;
          break;
        } catch (dbErr) {
          console.warn(`[BatchFlush] D1 batch write attempt ${attempt} failed:`, dbErr);
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
          }
        }
      }

      // 4️⃣ المسح الشرطي والتسجيل بـ DLQ
      if (dbSuccess) {
        successCount += stmts.length;

        // مسح المفاتيح على مجموعات صغيرة تجنباً لـ Subrequest Rate Limits
        const DELETE_CHUNK_SIZE = 10;
        for (let k = 0; k < keysToDelete.length; k += DELETE_CHUNK_SIZE) {
          const chunk = keysToDelete.slice(k, k + DELETE_CHUNK_SIZE);
          await Promise.all(chunk.map((key) => kvInstance.delete(key)));
        }
      } else {
        failureCount += stmts.length;
        try {
          await env.DB.prepare(
            `INSERT INTO dead_letter_batches (id, batch_prefix, failed_keys_count, error_message)
             VALUES (?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            'pending_order:',
            keysToDelete.length,
            'D1 batch insertion failed after 3 retries'
          ).run();
          dlqRecorded = true;
        } catch (dlqErr) {
          console.error('[BatchFlush] Critical: Failed to write to DLQ table:', dlqErr);
        }
      }
    }

    return {
      totalProcessed,
      successCount,
      failureCount,
      dlqRecorded,
      durationMs: performance.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      totalProcessed: 0,
      successCount,
      failureCount,
      dlqRecorded,
      durationMs: performance.now() - startTime,
      error: errorMsg,
    };
  }
}