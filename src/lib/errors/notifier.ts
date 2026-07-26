/**
 * ============================================================
 * 📤 المُبلغ المركزي لتليجرام (Telegram Error Notifier)
 * الإصدار: 11.3 (النسخة المستقرة - HTML Mode & Clean Redis Keys)
 * ============================================================
 */

import { ensureContext } from '@/lib/context';
import { sanitizeContext } from './sanitizer';
import { classifyError } from './classifier';
import { SystemError, StoredErrorSchema } from './types';
import type { TelegramMessage, ErrorSeverity, ErrorContext } from './types';
import { Redis } from '@upstash/redis/cloudflare';
import { uploadToB2 } from '@/lib/storage';
import type { Env } from '@/lib/env';

// ============================================================
// 🔧 تكوينات الحماية
// ============================================================

interface NotifierConfig {
  /** مدة منع التكرار (بالثواني) – افتراضي: 300 (5 دقائق) */
  dedupWindowSeconds?: number;
  
  /** عدد المحاولات الفاشلة لفتح الدائرة – افتراضي: 5 */
  circuitBreakerThreshold?: number;
  
  /** مدة فتح الدائرة (بالثواني) – افتراضي: 60 */
  circuitBreakerTimeoutSeconds?: number;
  
  /** الحد الأقصى للرسائل في الثانية – افتراضي: 1 */
  rateLimitPerSecond?: number;
  
  /** هل نفعّل Incident Aggregation؟ – افتراضي: true */
  enableIncidentAggregation?: boolean;
  
  /** نافذة تجميع الحوادث (بالثواني) – افتراضي: 300 (5 دقائق) */
  incidentWindowSeconds?: number;
  
  /** Timeout للإرسال (بالميلي ثانية) – افتراضي: 5000 */
  sendTimeoutMs?: number;
  
  /** عدد محاولات إعادة الإرسال – افتراضي: 3 */
  sendRetryCount?: number;
}

const DEFAULT_CONFIG: NotifierConfig = {
  dedupWindowSeconds: 300,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeoutSeconds: 60,
  rateLimitPerSecond: 1,
  enableIncidentAggregation: true,
  incidentWindowSeconds: 300,
  sendTimeoutMs: 5000,
  sendRetryCount: 3,
};

let globalRedisInstance: Redis | null = null;

// ============================================================
// 📤 المُبلغ الرئيسي (Notifier)
// ============================================================

export async function sendErrorToTelegram(
  error: SystemError,
  env?: Env,
  config?: Partial<NotifierConfig>
): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // حارس أمن الـ Edge
  if (!env) {
    console.warn(`⚠️ Telegram Alert Skipped [${error.code}]: Cloudflare Environment (env) was not provided.`);
    return;
  }

  // 🎯 استخراج Chat ID و Bot Token مباشرة بدون استخدام (as any)
  const chatId = env.TELEGRAM_ERROR_CHAT_ID || env.ERROR_CHANNEL_ID;
  const botToken = env.ERROR_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;

  if (!chatId || !botToken) {
    console.error(`❌ Telegram Alert Failed: Missing Credentials. ChatID: ${!!chatId}, BotToken: ${!!botToken}`);
    return;
  }

  // 1. 💾 حفظ اللوج التفصيلي الكامل في B2 للداشبورد (دائماً وأولاً)
  try {
    await storeErrorImmediately(error, env);
  } catch (storageErr) {
    console.error('❌ Failed to store error log in B2:', storageErr);
  }

  // 2. 🛡️ فحص هل الخطأ يتطلب إرسال تنبيه أصلاً؟
  if (!error.shouldAlert) {
    await trackMetrics('skipped', env);
    return;
  }

  // 3. 📦 تجميع الحوادث (Incident Aggregation)
  if (mergedConfig.enableIncidentAggregation) {
    try {
      await aggregateIncident(error, env, mergedConfig);
    } catch (aggErr) {
      console.warn('⚠️ Incident aggregation failed:', aggErr);
    }
  }

  // 4. 🔄 فحص التكرار عبر Redis
  try {
    if (await isDuplicateError(error, env, mergedConfig)) {
      await trackMetrics('deduplicated', env);
      return;
    }
  } catch (redisErr) {
    console.warn('⚠️ Redis Dedup bypass due to error:', redisErr);
  }

  // 5. ⚡ فحص الـ Circuit Breaker
  try {
    if (await isCircuitBreakerOpen(env, mergedConfig)) {
      await queueErrorForRetry(error, env);
      await trackMetrics('queued', env);
      return;
    }
  } catch (cbErr) {
    console.warn('⚠️ Circuit breaker bypass due to error:', cbErr);
  }

  // 6. 🚦 فحص الـ Rate Limiter
  try {
    if (!(await checkRateLimit(env, mergedConfig))) {
      await queueErrorForRetry(error, env);
      await trackMetrics('queued', env);
      return;
    }
  } catch (rlErr) {
    console.warn('⚠️ Rate limiter bypass due to error:', rlErr);
  }

  // 7. 🚀 إرسال كارت التنبيه المختصر لتليجرام
  try {
    const message = formatTelegramAlertCard(error);
    await sendTelegramMessageWithRetry(
      message,
      chatId,
      botToken,
      mergedConfig
    );

    await markErrorAsSent(error, env);
    await recordCircuitBreakerSuccess(env);
    await trackMetrics('sent', env);

  } catch (sendError) {
    await queueErrorForRetry(error, env);
    await recordCircuitBreakerFailure(env, mergedConfig);
    await trackMetrics('failed', env);

    console.error('❌ Failed to send Telegram Alert Card:', sendError);
  }
}

// ============================================================
// 🛡️ الحراس الأمنيون (Guards)
// ============================================================

async function isDuplicateError(
  error: SystemError,
  env: Env,
  config: NotifierConfig
): Promise<boolean> {
  const storeId = error.context?.storeId || (error.metadata?.storeId as string) || 'global';
  const key = `dedup:${error.code}:${storeId}:${(error.userMessage || '').substring(0, 100)}`;

  const redis = await getRedis(env);
  if (!redis) return false;

  const exists = await redis.exists(key);
  if (exists) return true;

  await redis.set(key, '1', { ex: config.dedupWindowSeconds! });
  return false;
}

async function isCircuitBreakerOpen(
  env: Env,
  config: NotifierConfig
): Promise<boolean> {
  const redis = await getRedis(env);
  if (!redis) return false;

  const state = await redis.get<string>('circuit_breaker:telegram');

  if (state === 'open') {
    const remaining = await redis.ttl('circuit_breaker:telegram');
    if (remaining > 0) return true;

    await redis.set('circuit_breaker:telegram', 'half-open', { ex: 30 });
    return false;
  }

  if (state === 'half-open') {
    const testResult = await redis.set('circuit_breaker:test', '1', {
      nx: true,
      ex: 5,
    });
    return !testResult;
  }

  return false;
}

async function recordCircuitBreakerSuccess(env: Env): Promise<void> {
  const redis = await getRedis(env);
  if (!redis) return;
  await redis.del('circuit_breaker:telegram', 'circuit_breaker:failure_count');
}

async function recordCircuitBreakerFailure(
  env: Env,
  config: NotifierConfig
): Promise<void> {
  const redis = await getRedis(env);
  if (!redis) return;
  const count = await redis.incr('circuit_breaker:failure_count');

  if (count >= config.circuitBreakerThreshold!) {
    await redis.set('circuit_breaker:telegram', 'open', {
      ex: config.circuitBreakerTimeoutSeconds!,
    });
  }
}

async function checkRateLimit(
  env: Env,
  config: NotifierConfig
): Promise<boolean> {
  const redis = await getRedis(env);
  if (!redis) return true;

  const key = `rate_limiter:telegram:${Math.floor(Date.now() / 1000)}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 1);
  }

  return current <= config.rateLimitPerSecond!;
}

// ============================================================
// 📦 Incident Aggregation
// ============================================================

async function aggregateIncident(
  error: SystemError,
  env: Env,
  config: NotifierConfig
): Promise<string | null> {
  const redis = await getRedis(env);
  if (!redis) return null;

  const storeId = error.context?.storeId || (error.metadata?.storeId as string) || 'global';
  // 💡 تم تغيير المفتاح لمنع التعارض مع القيم القديمة المخزنة كـ String
  const incidentKey = `inc_hash:${error.code}:${storeId}`;

  const incidentId = await redis.hget<string>(incidentKey, 'id');

  if (incidentId) {
    await redis.hincrby(incidentKey, 'count', 1);
    await redis.hset(incidentKey, { lastSeen: Date.now().toString() });
    await redis.expire(incidentKey, config.incidentWindowSeconds!);
    return incidentId;
  }

  const newIncidentId = `inc_${Date.now()}_${error.code}`;

  await redis.hset(incidentKey, {
    id: newIncidentId,
    code: error.code,
    severity: error.severity,
    storeId,
    count: '1',
    firstSeen: Date.now().toString(),
    lastSeen: Date.now().toString(),
    sample: JSON.stringify(error.toJSON ? error.toJSON() : error),
  });

  await redis.expire(incidentKey, config.incidentWindowSeconds!);

  return newIncidentId;
}

// ============================================================
// 💾 التخزين الفوري في Backblaze B2 (Full Error Log)
// ============================================================

async function storeErrorImmediately(
  error: SystemError,
  env: Env
): Promise<void> {
  const ctx = ensureContext();

  const rawContext: ErrorContext = {
    correlationId: ctx.correlationId || crypto.randomUUID(),
    storeId: ctx.storeId || 'global-store',
    merchantId: ctx.merchantId,
    userId: ctx.userId,
    path: ctx.path || '/unknown',
    method: ctx.method,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    breadcrumbs: ctx.breadcrumbs ? [...ctx.breadcrumbs] : [],
    extras: ctx.extras ? { ...ctx.extras } : undefined,
  };

  const sanitizedContext = sanitizeContext(rawContext);

  const storedError = {
    id: crypto.randomUUID(),
    error: typeof error.toJSON === 'function' ? error.toJSON() : error,
    context: sanitizedContext,
    timestamp: Date.now(),
    processed: false,
    retryCount: 0,
    processingStartedAt: undefined,
    processedAt: undefined,
    failedAt: undefined,
  };

  const result = StoredErrorSchema.safeParse(storedError);
  if (!result.success) {
    console.error('❌ StoredError validation failed:', result.error);
  }

  const validated = result.success ? result.data : storedError;
  const date = new Date().toISOString().split('T')[0];
  const key = `errors/raw/${date}/error_${Date.now()}_${storedError.id}.json`;

  await uploadToB2(key, JSON.stringify(validated, null, 2), env);
}

// ============================================================
// 📤 قائمة الانتظار (Queue)
// ============================================================

async function queueErrorForRetry(
  error: SystemError,
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  if (!redis) return;
  const payload = typeof error.toJSON === 'function' ? error.toJSON() : error;
  await redis.lpush('error:queue', JSON.stringify(payload));
  await redis.ltrim('error:queue', 0, 999);
}

async function markErrorAsSent(
  error: SystemError,
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  if (!redis) return;
  await redis.set(
    `error:sent:${error.code}:${Date.now()}`,
    '1',
    { ex: 86400 }
  );
}

// ============================================================
// 📝 تنسيق كارت التنبيه المختصر لتليجرام (HTML Mode)
// ============================================================

function formatTelegramAlertCard(error: SystemError): TelegramMessage {
  const ctx = ensureContext();
  const severityEmoji = getSeverityEmoji(error.severity);

  const safeCorrelationId: string = ctx.correlationId || error.context?.correlationId || crypto.randomUUID();
  const safeStoreId: string = ctx.storeId || error.context?.storeId || 'global-store';
  const safePath: string = ctx.path || error.context?.path || '/unknown';
  const safeMessage: string = error.userMessage || error.message || 'Unknown Error';

  const details = `
<b>${severityEmoji} تنبيه خطأ في النظام</b>

🆔 <b>الكود:</b> <code>${escapeHtml(error.code || 'UNKNOWN')}</code>
📁 <b>المسار:</b> <code>${escapeHtml(safePath)}</code>
🏪 <b>المتجر:</b> <code>${escapeHtml(safeStoreId)}</code>
📌 <b>الوصف:</b> ${escapeHtml(safeMessage.substring(0, 120))}
🔗 <b>التتبع:</b> <code>${escapeHtml(safeCorrelationId)}</code>

📊 <i>التفاصيل الكاملة والـ Stack Trace متوفرة في الداشبورد.</i>
`.trim();

  return {
    title: `${severityEmoji} Alert: ${error.code || 'UNKNOWN'}`,
    details,
    code: error.code || 'UNKNOWN',
    severity: error.severity || 'error',
    correlationId: safeCorrelationId,
    storeId: safeStoreId,
    merchantId: ctx.merchantId || error.context?.merchantId,
    path: safePath,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessageWithRetry(
  message: TelegramMessage,
  chatId: string,
  botToken: string,
  config: NotifierConfig
): Promise<void> {
  let attempts = 0;
  const maxAttempts = config.sendRetryCount!;

  while (attempts < maxAttempts) {
    try {
      await sendTelegramMessage(message, chatId, botToken, config.sendTimeoutMs!);
      return;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) throw err;
      await sleep(1000 * attempts);
    }
  }
}

async function sendTelegramMessage(
  message: TelegramMessage,
  chatId: string,
  botToken: string,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message.details,
          parse_mode: 'HTML', // 👈 استخدام HTML لتفادي مشاكل الـ Reserved Characters
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 🧰 دوال مساعدة والاتصال بـ Redis
// ============================================================

function getSeverityEmoji(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '🔵';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRedis(env: Env): Promise<Redis | null> {
  if (globalRedisInstance) return globalRedisInstance;

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  globalRedisInstance = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return globalRedisInstance;
}

async function trackMetrics(
  action: 'sent' | 'failed' | 'queued' | 'deduplicated' | 'aggregated' | 'skipped',
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  if (!redis) return;
  const key = `metrics:telegram:${action}:${new Date().toISOString().split('T')[0]}`;
  await redis.incr(key);
  await redis.expire(key, 86400);
}

// ============================================================
// 🧪 دوال مساعدة للاختبار
// ============================================================

export function createTestErrorForNotifier(): SystemError {
  return classifyError(new Error('Test error for Telegram Alert Card'), {
    storeId: 'test-store',
    path: '/api/v1/checkout',
  });
}