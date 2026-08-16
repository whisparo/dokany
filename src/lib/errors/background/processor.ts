// lib/errors/background/processor.ts
// الإصدار: 1.0.2
// الدور: المعالج الخلفي - يُستدعى كل 10 دقائق عبر QStash
// المبدأ: سحب الملفات من B2 → تجميع → إرسال → أرشفة

import { SystemError } from '../core/types';
import { addBreadcrumb } from '../core/context';

// ═══════════════════════════════════════════════════════════════
// 📦  استيراد المكونات الأخرى
// ═══════════════════════════════════════════════════════════════

import { B2Store, createB2StoreFromEnv } from '../storage/b2-store';
import { createQueueManager, type QueueManager } from '../storage/queue-manager';
import { getDeduplicator, type Deduplicator, formatIncidentSummary } from '../guards/deduplicator';
import { getTelegramClient, type TelegramClient, formatErrorForTelegram } from '../clients/telegram';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * متغيرات البيئة المتوقعة للمعالج
 */
export interface ProcessorEnv {
  B2_ENDPOINT?: string;
  B2_APPLICATION_KEY_ID?: string;
  B2_APPLICATION_KEY?: string;
  B2_BUCKET_ID?: string;
  B2_BUCKET_NAME?: string;
  B2_ACCESS_KEY_ID?: string;
  B2_SECRET_ACCESS_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  [key: string]: unknown;
}

/**
 * نتيجة معالجة ملف خطأ واحد
 */
export interface ProcessedErrorResult {
  /** مفتاح الملف في B2 */
  key: string;
  /** هل تمت المعالجة بنجاح؟ */
  success: boolean;
  /** سبب الفشل (إن وجد) */
  error?: string;
  /** معرف الحادثة (إن تم تجميعها) */
  incidentId?: string;
  /** هل تم إرسال تنبيه؟ */
  alerted: boolean;
}

/**
 * نتيجة معالجة الدفعة الكاملة
 */
export interface BatchProcessResult {
  /** عدد الملفات التي تمت معالجتها */
  totalProcessed: number;
  /** عدد الملفات الناجحة */
  successCount: number;
  /** عدد الملفات الفاشلة */
  failureCount: number;
  /** عدد التنبيهات المرسلة */
  alertsSent: number;
  /** تفاصيل النتائج */
  details: ProcessedErrorResult[];
  /** المدة الزمنية بالمللي ثانية */
  durationMs: number;
  /** هل حدث خطأ في المعالج نفسه؟ */
  processorError?: string;
}

/**
 * خيارات تشغيل المعالج
 */
export interface ProcessorOptions {
  /** عدد الملفات القصوى للمعالجة في الدفعة الواحدة (افتراضي: 100) */
  batchSize?: number;
  /** هل يجب إرسال التنبيهات؟ (افتراضي: true) */
  sendAlerts?: boolean;
  /** هل يجب حذف الملفات بعد المعالجة؟ (افتراضي: true) */
  deleteAfterProcessing?: boolean;
  /** اسم الخدمة (للتتبع) */
  serviceName?: string;
}

// ═══════════════════════════════════════════════════════════════
// 🧠  المعالج الخلفي الرئيسي
// ═══════════════════════════════════════════════════════════════

/**
 * معالجة قائمة انتظار الأخطاء
 * 
 * @param env - بيئة Workers
 * @param options - خيارات المعالجة
 * @returns نتيجة المعالجة
 */
export async function processErrorQueue(
  env: ProcessorEnv,
  options: ProcessorOptions = {}
): Promise<BatchProcessResult> {
  const startTime = performance.now();
  const {
    batchSize = 100,
    sendAlerts = true,
    deleteAfterProcessing = true,
    serviceName = 'error-processor',
  } = options;

  // 1️⃣ تهيئة المكونات
  let b2Store: B2Store;
  let queueManager: QueueManager;
  let deduplicator: Deduplicator;
  let telegramClient: TelegramClient;

  try {
    b2Store = createB2StoreFromEnv(env as Record<string, string | undefined>);
    queueManager = createQueueManager(env);
    deduplicator = getDeduplicator(serviceName, {
      windowSeconds: 300, // 5 دقائق
      allowOnRedisFailure: true,
    });
    telegramClient = getTelegramClient(env);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    addBreadcrumb('❌ Processor initialization failed', { error: errorMsg });

    return {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      alertsSent: 0,
      details: [],
      durationMs: performance.now() - startTime,
      processorError: `Initialization failed: ${errorMsg}`,
    };
  }

  // 2️⃣ سحب المفاتيح من قائمة الانتظار
  let keys: string[];
  try {
    keys = await queueManager.popBatch(batchSize);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    addBreadcrumb('❌ Failed to pop from queue', { error: errorMsg });

    return {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      alertsSent: 0,
      details: [],
      durationMs: performance.now() - startTime,
      processorError: `Queue pop failed: ${errorMsg}`,
    };
  }

  if (!keys || keys.length === 0) {
    addBreadcrumb('📭 Queue is empty, nothing to process', { service: serviceName });
    return {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      alertsSent: 0,
      details: [],
      durationMs: performance.now() - startTime,
    };
  }

  addBreadcrumb(`📥 Processing ${keys.length} errors from queue`, {
    service: serviceName,
    count: keys.length,
  });

  // 3️⃣ معالجة كل ملف
  const results: ProcessedErrorResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let alertsSent = 0;

  for (const key of keys) {
    try {
      const result = await processSingleError(
        key,
        b2Store,
        deduplicator,
        telegramClient,
        env,
        {
          sendAlerts,
          deleteAfterProcessing,
          serviceName,
        }
      );

      results.push(result);
      if (result.success) {
        successCount++;
        if (result.alerted) {
          alertsSent++;
        }
      } else {
        failureCount++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        key,
        success: false,
        error: `Unexpected error: ${errorMsg}`,
        alerted: false,
      });
      failureCount++;
    }
  }

  // 4️⃣ إرسال ملخص الدفعة (إن وجدت أخطاء)
  if (failureCount > 0 && sendAlerts) {
    try {
      const summary = formatBatchSummary({
        total: keys.length,
        success: successCount,
        failure: failureCount,
        alerts: alertsSent,
        duration: performance.now() - startTime,
      });

      await telegramClient.sendDigest(summary);
    } catch (error) {
      console.warn('[Processor] Failed to send batch summary:', error);
    }
  }

  const durationMs = performance.now() - startTime;

  addBreadcrumb('✅ Processor completed', {
    service: serviceName,
    total: keys.length,
    success: successCount,
    failure: failureCount,
    alerts: alertsSent,
    duration: Math.round(durationMs),
  });

  return {
    totalProcessed: keys.length,
    successCount,
    failureCount,
    alertsSent,
    details: results,
    durationMs,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🔧  معالجة ملف خطأ واحد
// ═══════════════════════════════════════════════════════════════

interface ProcessSingleOptions {
  sendAlerts: boolean;
  deleteAfterProcessing: boolean;
  serviceName: string;
}

/**
 * معالجة ملف خطأ واحد من B2
 */
async function processSingleError(
  key: string,
  b2Store: B2Store,
  deduplicator: Deduplicator,
  telegramClient: TelegramClient,
  env: ProcessorEnv,
  options: ProcessSingleOptions
): Promise<ProcessedErrorResult> {
  const { sendAlerts, deleteAfterProcessing } = options;

  try {
    // 1️⃣ قراءة الملف من B2
    const readResult = await b2Store.read<SystemError>({
      key,
      compressed: true,
    });

    const error = readResult.content;

    // التحقق من صحة البيانات
    if (!error || typeof error !== 'object' || !('code' in error)) {
      await b2Store.delete(key);
      return {
        key,
        success: false,
        error: 'Invalid error data (missing code)',
        alerted: false,
      };
    }

    // 2️⃣ تسجيل الحادثة في Deduplicator
    let incidentId: string | undefined;
    let alerted = false;

    if (sendAlerts) {
      try {
        const userId = typeof error.metadata?.userId === 'string' ? error.metadata.userId : undefined;

        const dedupResult = await deduplicator.record(error, env, {
          storeId: error.storeId,
          userId,
          metadata: {
            sourceFile: key,
            processedAt: new Date().toISOString(),
          },
        });

        incidentId = dedupResult.incidentId;

        // 3️⃣ إرسال تنبيه (أول حدث فقط)
        if (dedupResult.shouldAlert) {
          const formattedMessage = formatErrorForTelegram(error, true);
          const sendResult = await telegramClient.sendCritical(formattedMessage, {
            buttons: [
              {
                text: '🔍 View Details',
                url: `https://dokany.workers.dev/admin/errors/${incidentId}`,
              },
            ],
          });

          if (sendResult.success) {
            alerted = true;
          } else {
            console.warn(`[Processor] Failed to send alert for ${key}:`, sendResult.errorMessage);
          }
        }

        // 4️⃣ إرسال ملخص الحادثة (إذا تجاوزت الحد)
        if (dedupResult.shouldSummarize) {
          const incidentData = await deduplicator.getIncidentData(incidentId, env);
          if (incidentData) {
            const summary = formatIncidentSummary(incidentData);
            await telegramClient.sendDigest(summary);
          }
        }
      } catch (dedupError) {
        console.warn(`[Processor] Deduplication failed for ${key}:`, dedupError);
        try {
          const formattedMessage = formatErrorForTelegram(error, true);
          await telegramClient.sendCritical(formattedMessage);
          alerted = true;
        } catch (telegramError) {
          console.warn(`[Processor] Fallback telegram send failed for ${key}:`, telegramError);
        }
      }
    }

    // 5️⃣ نقل الملف أو حذفه
    if (deleteAfterProcessing) {
      const processedKey = B2Store.createProcessedKey(key);
      try {
        await b2Store.write({
          content: error,
          key: processedKey,
          compress: true,
          enqueue: false, // لا نريد إعادة إدخاله في الـ Queue
          metadata: {
            processedAt: new Date().toISOString(),
            originalKey: key,
            incidentId: incidentId || 'unknown',
          },
        });

        await b2Store.delete(key);
      } catch (moveError) {
        console.warn(`[Processor] Failed to move ${key} to processed, deleting:`, moveError);
        await b2Store.delete(key);
      }
    }

    return {
      key,
      success: true,
      incidentId,
      alerted,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // نقل الملف إلى failed/
    try {
      const failedKey = B2Store.createFailedKey(key);
      try {
        await b2Store.write({
          content: { error: 'Failed to process file', rawError: errorMsg },
          key: failedKey,
          compress: true,
          enqueue: false,
          metadata: {
            failedAt: new Date().toISOString(),
            error: errorMsg,
            originalKey: key,
          },
        });
      } catch {
        // حماية في حالة تعذر الكتابة
      }

      await b2Store.delete(key);
    } catch (cleanupError) {
      console.warn(`[Processor] Failed to move ${key} to failed:`, cleanupError);
      try {
        await b2Store.delete(key);
      } catch {
        // فشل التنظيف النهائى
      }
    }

    return {
      key,
      success: false,
      error: errorMsg,
      alerted: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 📊  مساعدات التنسيق
// ═══════════════════════════════════════════════════════════════

/**
 * تنسيق ملخص الدفعة لتليجرام
 */
function formatBatchSummary(data: {
  total: number;
  success: number;
  failure: number;
  alerts: number;
  duration: number;
}): string {
  const emoji = data.failure > 0 ? '⚠️' : '✅';
  const lines: string[] = [];

  lines.push(`${emoji} <b>Error Processor Report</b>`);
  lines.push(`📦 Total: ${data.total}`);
  lines.push(`✅ Success: ${data.success}`);
  lines.push(`❌ Failed: ${data.failure}`);
  lines.push(`🔔 Alerts: ${data.alerts}`);
  lines.push(`⏱️ Duration: ${Math.round(data.duration)}ms`);

  if (data.failure > 0) {
    lines.push('');
    lines.push(`⚠️ ${data.failure} errors failed processing. Check logs for details.`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام في Workers
// ═══════════════════════════════════════════════════════════════

/**
 * نقطة النهاية (Endpoint) لـ QStash Cron
 */
export async function processErrorQueueHandler(env: ProcessorEnv): Promise<BatchProcessResult> {
  try {
    return await processErrorQueue(env, {
      batchSize: 100,
      sendAlerts: true,
      deleteAfterProcessing: true,
      serviceName: 'error-processor',
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      alertsSent: 0,
      details: [],
      durationMs: 0,
      processorError: `Handler error: ${errorMsg}`,
    };
  }
}

/**
 * دالة لإعادة معالجة الملفات الفاشلة (من مجلد failed/)
 */
export async function reprocessFailedErrors(
  _env: ProcessorEnv,
  _limit: number = 50
): Promise<BatchProcessResult> {
  throw new Error('Not implemented yet');
}

/**
 * دالة للتنظيف الدوري (حذف الملفات القديمة)
 */
export async function cleanupOldErrors(
  _env: ProcessorEnv,
  _daysToKeep: number = 30
): Promise<{
  deleted: number;
  failed: number;
}> {
  throw new Error('Not implemented yet');
}