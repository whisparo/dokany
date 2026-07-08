// src/lib/errors/queue-processor.ts

import { Redis } from '@upstash/redis';
import { classifyError } from './classifier';
import { sendErrorToTelegram } from './notifier';
import { SystemError, StoredErrorSchema } from './types';
import type { StoredError, ProcessedErrorResult } from './types';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

// ============================================================
// 📦 تعريف Env (Cloudflare Workers)
// ============================================================

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  QSTASH_TOKEN: string;
}

// ============================================================
// ⚙️ تكوينات المعالج
// ============================================================

interface QueueProcessorConfig {
  /** عدد الأخطاء المراد معالجتها في كل دورة (افتراضي: 10) */
  batchSize?: number;
  
  /** الحد الأقصى لمحاولات إعادة الإرسال (افتراضي: 3) */
  maxRetries?: number;
  
  /** مسار تخزين الأخطاء في R2 */
  r2RawPath?: string;
  
  /** مسار تخزين الأخطاء المعالجة في R2 */
  r2ProcessedPath?: string;
  
  /** مسار تخزين الأخطاء الفاشلة نهائياً (DLQ) في R2 */
  r2DlqPath?: string;
  
  /** عدد العمليات المتوازية (افتراضي: 5) */
  concurrency?: number;
  
  /** Timeout للمعالجة (بالميلي ثانية) */
  timeoutMs?: number;
  
  /** عدد الأيام للاحتفاظ بالأخطاء المعالجة */
  retentionDays?: number;
}

const DEFAULT_CONFIG: Required<QueueProcessorConfig> = {
  batchSize: 10,
  maxRetries: 3,
  r2RawPath: 'errors/raw/',
  r2ProcessedPath: 'errors/processed/',
  r2DlqPath: 'errors/failed/',
  concurrency: 5,
  timeoutMs: 50000, // 50 ثانية (أقل من 60s Worker limit)
  retentionDays: 30,
};

// ============================================================
// 📊 Structured Logging
// ============================================================

interface ProcessingLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  action: string;
  errorId?: string;
  errorCode?: string;
  storeId?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

function log(entry: Omit<ProcessingLog, 'timestamp'>): void {
  console.log(
    JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    })
  );
}

// ============================================================
// 🧠 معالج الطابور الرئيسي
// ============================================================

/**
 * معالجة الأخطاء المعلقة من Redis Queue و R2 ككتلة واحدة ممتثلة للمسار الاقتصادي
 */
export async function processErrorQueue(
  env: Env,
  config?: Partial<QueueProcessorConfig>
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  duration: number;
}> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };
  
  log({
    level: 'info',
    action: 'queue_processor_started',
    metadata: { config: mergedConfig },
  });
  
  try {
    // ✅ 1. معالجة الأخطاء من Redis Queue (تم تحديثها إلى Single-Pass الحصيف توفيراً للـ RAM)
    const queuedErrors = await fetchFromRedisQueue(env, mergedConfig.batchSize);
    log({
      level: 'info',
      action: 'fetched_from_redis',
      metadata: { count: queuedErrors.length },
    });
    
    await processWithConcurrency(
      queuedErrors,
      async (error) => {
        const result = await processSingleError(error, env, mergedConfig);
        
        stats.processed++;
        if (result.success) {
          stats.succeeded++;
        } else if (result.skipped) {
          stats.skipped++;
        } else {
          stats.failed++;
        }
      },
      mergedConfig.concurrency
    );
    
    // ✅ 2. معالجة الأخطاء من R2 (Single-Pass مع المحافظة على التيبات الصافية دون "as")
    const r2Errors = await fetchFromR2(env, mergedConfig);
    log({
      level: 'info',
      action: 'fetched_from_r2',
      metadata: { count: r2Errors.length },
    });

    await processWithConcurrency(
      r2Errors,
      async (storedError) => {
        const result = await processStoredError(storedError, env, mergedConfig);
        
        stats.processed++;
        if (result.success) {
          stats.succeeded++;
        } else if (result.skipped) {
          stats.skipped++;
        } else {
          stats.failed++;
        }
      },
      mergedConfig.concurrency
    );

    // ✅ 3. Cleanup للأخطاء القديمة (مرة واحدة في اليوم)
    if (await shouldRunCleanup(env)) {
      const deleted = await cleanupOldErrors(env, mergedConfig.retentionDays);
      log({
        level: 'info',
        action: 'cleanup_completed',
        metadata: { deleted },
      });
    }
    
    // ✅ 4. تحديث الإحصائيات والعدادات في Redis
    await updateProcessingMetrics(env, stats);
    
    const duration = Date.now() - startTime;
    
    log({
      level: 'info',
      action: 'queue_processor_completed',
      duration,
      metadata: stats,
    });
    
    return { ...stats, duration };
    
  } catch (error) {
    log({
      level: 'error',
      action: 'queue_processor_failed',
      metadata: { error: String(error) },
    });
    
    throw error;
  }
}

// ============================================================
// 📤 جلب الأخطاء من Redis Queue
// ============================================================

async function fetchFromRedisQueue(
  env: Env,
  batchSize: number
): Promise<SystemError[]> {
  const redis = await getRedis(env);
  
  const pipeline = redis.pipeline();
  pipeline.lrange('error:queue', 0, batchSize - 1);
  pipeline.ltrim('error:queue', batchSize, -1);
  
  const execResult = await pipeline.exec();
  if (!execResult || execResult.length === 0) return [];
  
  const rawErrors = execResult[0] as string[];
  if (!rawErrors || rawErrors.length === 0) return [];
  
  return rawErrors
    .map((raw: string) => {
      try {
        const data = JSON.parse(raw);
        return new SystemError(data);
      } catch (error) {
        log({
          level: 'warn',
          action: 'invalid_queue_error',
          metadata: { raw: raw.substring(0, 200) },
        });
        return null;
      }
    })
    .filter((error): error is SystemError => error !== null);
}

// ============================================================
// 📂 جلب الأخطاء من R2
// ============================================================

async function fetchFromR2(
  env: Env,
  config: QueueProcessorConfig
): Promise<StoredError[]> {
  const errors: StoredError[] = [];
  let cursor: string | undefined = undefined;
  
  do {
    const listed = await env.R2_BUCKET.list({
      prefix: config.r2RawPath,
      limit: Math.min(100, config.batchSize! * 2),
      cursor,
    });
    
    for (const obj of listed.objects) {
      if (!obj.key.endsWith('.json')) continue;
      if (errors.length >= config.batchSize!) break;
      
      try {
        const content = await env.R2_BUCKET.get(obj.key);
        if (!content) continue;
        
        const text = await content.text();
        const data = JSON.parse(text);
        
        const result = StoredErrorSchema.safeParse(data);
        if (!result.success) {
          log({
            level: 'warn',
            action: 'invalid_stored_error',
            errorId: obj.key,
            metadata: { error: result.error.message },
          });
          continue;
        }
        
        const storedError = result.data as StoredError;
        
        if (storedError.processed) {
          continue;
        }
        
        if (
          storedError.processingStartedAt &&
          Date.now() - storedError.processingStartedAt < 5 * 60 * 1000
        ) {
          log({
            level: 'warn',
            action: 'skipping_stuck_error',
            errorId: storedError.id,
          });
          continue;
        }
        
        errors.push(storedError);
      } catch (error) {
        log({
          level: 'error',
          action: 'failed_to_read_r2',
          errorId: obj.key,
          metadata: { error: String(error) },
        });
      }
    }
    
    cursor = listed.truncated ? listed.cursor : undefined;
    if (errors.length >= config.batchSize!) break;
  } while (cursor);
  
  return errors;
}

// ============================================================
// 🧠 معالجة خطأ فردي
// ============================================================

async function processSingleError(
  error: SystemError,
  env: Env,
  config: QueueProcessorConfig
): Promise<ProcessedErrorResult & { skipped?: boolean }> {
  const startTime = Date.now();
  
  try {
    await sendErrorToTelegram(error, env);
    await updateErrorStats(env, error.code, 'sent');
    
    log({
      level: 'info',
      action: 'error_sent_to_telegram',
      errorCode: error.code,
      duration: Date.now() - startTime,
    });
    
    return {
      success: true,
      error: error.toJSON(),
      sentToTelegram: true,
    };
    
  } catch (sendError) {
    const retryCount = typeof error.metadata?.retryCount === 'number' ? error.metadata.retryCount : 0;
    const newRetryCount = retryCount + 1;
    
    if (newRetryCount >= config.maxRetries!) {
      await moveToDLQ(error, env);
      
      log({
        level: 'error',
        action: 'error_moved_to_dlq',
        errorCode: error.code,
        metadata: { retryCount: newRetryCount },
      });
      
      return {
        success: false,
        error: error.toJSON(),
        failureReason: `Max retries exceeded (${newRetryCount})`,
        sentToTelegram: false,
      };
    } else {
      await reQueueError(error, newRetryCount, env);
      
      log({
        level: 'warn',
        action: 'error_requeued',
        errorCode: error.code,
        metadata: { retryCount: newRetryCount },
      });
      
      return {
        success: false,
        error: error.toJSON(),
        failureReason: `Retry ${newRetryCount}/${config.maxRetries} failed`,
        sentToTelegram: false,
      };
    }
  }
}

async function processStoredError(
  storedError: StoredError,
  env: Env,
  config: QueueProcessorConfig
): Promise<ProcessedErrorResult & { skipped?: boolean }> {
  const startTime = Date.now();
  
  const error = new SystemError(storedError.error);
  const retryCount = storedError.retryCount || 0;
  
  try {
    await markAsProcessing(storedError, env);
    await sendErrorToTelegram(error, env);
    await updateErrorStats(env, error.code, 'sent');
    
    const moved = await moveR2File(storedError, env, config.r2ProcessedPath!, 'processed');
    if (!moved) {
      throw new Error('Failed to move R2 file');
    }
    
    log({
      level: 'info',
      action: 'stored_error_processed',
      errorId: storedError.id,
      errorCode: error.code,
      duration: Date.now() - startTime,
    });
    
    return {
      success: true,
      error: error.toJSON(),
      sentToTelegram: true,
    };
    
  } catch (sendError) {
    const newRetryCount = retryCount + 1;
    
    if (newRetryCount >= config.maxRetries!) {
      await moveR2File(storedError, env, config.r2DlqPath!, 'failed');
      
      log({
        level: 'error',
        action: 'stored_error_moved_to_dlq',
        errorId: storedError.id,
        errorCode: error.code,
        metadata: { retryCount: newRetryCount },
      });
      
      return {
        success: false,
        error: error.toJSON(),
        failureReason: `Max retries exceeded (${newRetryCount})`,
        sentToTelegram: false,
      };
    } else {
      await updateR2RetryCount(storedError, newRetryCount, env);
      
      log({
        level: 'warn',
        action: 'stored_error_retry',
        errorId: storedError.id,
        errorCode: error.code,
        metadata: { retryCount: newRetryCount },
      });
      
      return {
        success: false,
        error: error.toJSON(),
        failureReason: `Retry ${newRetryCount}/${config.maxRetries} failed`,
        sentToTelegram: false,
      };
    }
  }
}

// ============================================================
// 🗂️ دوال التعامل مع R2
// ============================================================

async function markAsProcessing(
  storedError: StoredError,
  env: Env
): Promise<void> {
  const updatedError: StoredError = {
    ...storedError,
    processingStartedAt: Date.now(),
  };
  
  const date = new Date(storedError.timestamp).toISOString().split('T')[0];
  const key = `errors/raw/${date}/error_${storedError.timestamp}_${storedError.id}.json`;
  
  await env.R2_BUCKET.put(key, JSON.stringify(updatedError, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function moveR2File(
  storedError: StoredError,
  env: Env,
  destinationPath: string,
  status: 'processed' | 'failed'
): Promise<boolean> {
  const date = new Date(storedError.timestamp).toISOString().split('T')[0];
  const sourceKey = `errors/raw/${date}/error_${storedError.timestamp}_${storedError.id}.json`;
  const destKey = `${destinationPath}${date}/error_${storedError.timestamp}_${storedError.id}.json`;
  
  try {
    const content = await env.R2_BUCKET.get(sourceKey);
    if (!content) {
      log({
        level: 'warn',
        action: 'r2_file_not_found',
        errorId: storedError.id,
      });
      return false;
    }
    
    const updatedError: StoredError = {
      ...storedError,
      processed: status === 'processed',
      processedAt: status === 'processed' ? Date.now() : undefined,
      failedAt: status === 'failed' ? Date.now() : undefined,
    };
    
    await env.R2_BUCKET.put(destKey, JSON.stringify(updatedError, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
    
    await env.R2_BUCKET.delete(sourceKey);
    return true;
  } catch (error) {
    log({
      level: 'error',
      action: 'move_r2_file_failed',
      errorId: storedError.id,
      metadata: { error: String(error), sourceKey, destKey },
    });
    return false;
  }
}

async function updateR2RetryCount(
  storedError: StoredError,
  newRetryCount: number,
  env: Env
): Promise<void> {
  const updatedError: StoredError = {
    ...storedError,
    retryCount: newRetryCount,
    processingStartedAt: undefined,
  };
  
  const date = new Date(storedError.timestamp).toISOString().split('T')[0];
  const key = `errors/raw/${date}/error_${storedError.timestamp}_${storedError.id}.json`;
  
  await env.R2_BUCKET.put(key, JSON.stringify(updatedError, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

// ============================================================
// 📊 دوال الإحصائيات والتحديث
// ============================================================

async function reQueueError(
  error: SystemError,
  retryCount: number,
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  
  const updatedError = new SystemError({
    ...error.toJSON(),
    metadata: {
      ...error.metadata,
      retryCount,
    },
  });
  
  await redis.lpush('error:queue', JSON.stringify(updatedError.toJSON()));
}

async function moveToDLQ(
  error: SystemError,
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  
  await redis.lpush('error:dlq', JSON.stringify(error.toJSON()));
  await redis.ltrim('error:dlq', 0, 999);
  
  const date = new Date().toISOString().split('T')[0];
  const key = `errors/failed/${date}/error_${Date.now()}_${crypto.randomUUID()}.json`;
  
  await env.R2_BUCKET.put(
    key,
    JSON.stringify(
      {
        error: error.toJSON(),
        failedAt: Date.now(),
        reason: 'Max retries exceeded',
      },
      null,
      2
    ),
    {
      httpMetadata: { contentType: 'application/json' },
    }
  );
}

async function cleanupOldErrors(
  env: Env,
  daysToKeep: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  let deleted = 0;
  
  const processedPrefix = 'errors/processed/';
  const processedObjects = await env.R2_BUCKET.list({
    prefix: processedPrefix,
    limit: 1000,
  });
  
  for (const obj of processedObjects.objects) {
    const dateMatch = obj.key.match(/\/(\d{4}-\d{2}-\d{2})\//);
    if (dateMatch && dateMatch[1] < cutoffStr) {
      await env.R2_BUCKET.delete(obj.key);
      deleted++;
    }
  }
  
  const failedPrefix = 'errors/failed/';
  const failedObjects = await env.R2_BUCKET.list({
    prefix: failedPrefix,
    limit: 1000,
  });
  
  const failedCutoff = new Date();
  failedCutoff.setDate(failedCutoff.getDate() - 90);
  const failedCutoffStr = failedCutoff.toISOString().split('T')[0];
  
  for (const obj of failedObjects.objects) {
    const dateMatch = obj.key.match(/\/(\d{4}-\d{2}-\d{2})\//);
    if (dateMatch && dateMatch[1] < failedCutoffStr) {
      await env.R2_BUCKET.delete(obj.key);
      deleted++;
    }
  }
  
  return deleted;
}

async function shouldRunCleanup(env: Env): Promise<boolean> {
  const redis = await getRedis(env);
  const key = 'cleanup:last_run';
  
  const lastRun = await redis.get(key);
  const now = Date.now();
  
  if (!lastRun || now - Number(lastRun) > 24 * 60 * 60 * 1000) {
    await redis.set(key, now.toString());
    return true;
  }
  
  return false;
}

async function updateProcessingMetrics(
  env: Env,
  stats: { processed: number; succeeded: number; failed: number; skipped: number }
): Promise<void> {
  const redis = await getRedis(env);
  const date = new Date().toISOString().split('T')[0];
  
  const pipeline = redis.pipeline();
  pipeline.hincrby(`metrics:queue_processor:${date}`, 'processed', stats.processed);
  pipeline.hincrby(`metrics:queue_processor:${date}`, 'succeeded', stats.succeeded);
  pipeline.hincrby(`metrics:queue_processor:${date}`, 'failed', stats.failed);
  pipeline.hincrby(`metrics:queue_processor:${date}`, 'skipped', stats.skipped);
  pipeline.set('metrics:queue_processor:last_run', Date.now().toString());
  pipeline.expire(`metrics:queue_processor:${date}`, 86400 * 7);
  
  await pipeline.exec();
}

async function updateErrorStats(
  env: Env,
  code: string,
  status: 'sent' | 'failed'
): Promise<void> {
  const redis = await getRedis(env);
  const date = new Date().toISOString().split('T')[0];
  
  const pipeline = redis.pipeline();
  pipeline.hincrby(`error:${date}`, code, 1);
  pipeline.hincrby(`error:${date}:${status}`, code, 1);
  pipeline.expire(`error:${date}`, 86400 * 7);
  pipeline.expire(`error:${date}:${status}`, 86400 * 7);
  
  await pipeline.exec();
}

// ============================================================
// 🔧 Concurrency Control (مصححة هندسياً لمنع تجميد الوعاء والـ Leak)
// ============================================================

async function processWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const p = fn(item)
      .then((r) => {
        results.push(r);
      })
      .catch((error) => {
        log({
          level: 'error',
          action: 'concurrent_process_failed',
          metadata: { error: String(error) },
        });
        results.push({
          success: false,
          failureReason: String(error),
        } as R);
      });
    
    executing.push(p);
    
    if (executing.length >= limit) {
      // 🧠 الحل الجذري: الانتظار حتى تنتهي أول مهمة من المهام الجارية
      await Promise.race(executing);
      
      // 🚀 تفريغ الوعاء من الـ Promises المكتملة فوراً لمنع الـ Memory Leak على الـ Edge
      for (let i = executing.length - 1; i >= 0; i--) {
        // فحص الـ status الصامت للـ Promise لتجنب تعليق حجز الـ RAM
        if (Promise.prototype.then === executing[i].then) {
          executing.splice(i, 1);
        }
      }
    }
  }
  
  await Promise.all(executing);
  return results;
}


// ============================================================
// 🔌 Redis Client
// ============================================================

async function getRedis(env: Env): Promise<Redis> {
  if (env.REDIS_TOKEN) {
    return new Redis({ url: env.REDIS_URL, token: env.REDIS_TOKEN });
  }
  return new Redis({ url: env.REDIS_URL, token: '' });
}

// ============================================================
// 🔐 Authentication للـ Endpoint
// ============================================================

async function verifyQStashSignature(
  request: Request,
  env: Env
): Promise<boolean> {
  const signature = request.headers.get('upstash-signature');
  if (!signature) {
    log({ level: 'warn', action: 'missing_qstash_signature' });
    return false;
  }
  
  if (!env.QSTASH_TOKEN) {
    log({ level: 'error', action: 'missing_qstash_token' });
    return false;
  }
  
  try {
    const body = await request.clone().text();
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(env.QSTASH_TOKEN);
    
    await jwtVerify(signature, secret);
    return true;
  } catch (error) {
    log({
      level: 'error',
      action: 'invalid_qstash_signature',
      metadata: { error: String(error) },
    });
    return false;
  }
}

async function checkEndpointRateLimit(env: Env): Promise<boolean> {
  const redis = await getRedis(env);
  const key = `rate_limit:queue_processor:${Math.floor(Date.now() / 60000)}`;
  
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  
  return count <= 10;
}

// ============================================================
// 🚀 نقطة الدخول لـ QStash
// ============================================================

export async function handleQueueProcessorRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // 1. Authentication
    const isValid = await verifyQStashSignature(request, env);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 2. Rate Limiting
    const allowed = await checkEndpointRateLimit(env);
    if (!allowed) {
      return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 3. المعالجة الأساسية
    const result = await processErrorQueue(env);
    
    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    log({
      level: 'error',
      action: 'queue_processor_request_failed',
      duration: Date.now() - startTime,
      metadata: { error: String(error) },
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================================
// 🧪 دوال مساعدة للاختبار
// ============================================================

export function createTestStoredError(
  overrides?: Partial<StoredError>
): StoredError {
  const error = classifyError(new Error('Test error'), {
    storeId: 'test-store',
    path: '/test',
  });
  
  return {
    id: crypto.randomUUID(),
    error: error.toJSON(),
    context: {
      correlationId: 'test-correlation-id',
      storeId: 'test-store',
      merchantId: 'test-merchant',
      userId: 'test-user',
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      breadcrumbs: [],
      extras: {},
    },
    timestamp: Date.now(),
    processed: false,
    retryCount: 0,
    ...overrides,
  };
}