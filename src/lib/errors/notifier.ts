// src/lib/errors/notifier.ts

/**
 * ============================================================
 * 📤 المُبلغ المركزي لتليجرام (Telegram Error Notifier)
 * الإصدار: 10.1 (النسخة المتوافقة مع B2 و Edge)
 * ============================================================
 */

import { ensureContext } from '@/lib/context';
import { sanitizeContext } from './sanitizer';
import { classifyError } from './classifier';
import { SystemError, StoredErrorSchema } from './types';
import type { TelegramMessage, ErrorSeverity, ErrorContext } from './types';
import { Redis } from '@upstash/redis';
import { uploadToB2 } from '@/lib/storage'; // ✅ استيراد دالة B2
import type { Env as StorageEnv } from '@/lib/storage';
// ============================================================
// 📦 تعريف Env (Cloudflare Workers + B2)
// ============================================================

export interface Env extends StorageEnv {
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;

  
  // ✅ متغيرات B2 المطلوبة
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;
  
  REDIS_URL: string;
  REDIS_TOKEN: string;
  [key: string]: any; 
}

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

// كاش محلي على مستوى الـ Edge Isolation لإعادة استخدام الـ Connection ومنع خنق الـ CPU
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
  
  // 1. ✅ هل يجب الإرسال؟
  if (!error.shouldAlert) {
    if (env) await trackMetrics('skipped', env);
    return;
  }
  
  // حارس أمن الـ Edge
  if (!env) {
    console.warn(`⚠️ Telegram Alert Skipped [${error.code}]: Cloudflare Environment (env) was not provided.`);
    return;
  }
  
  // 2. ✅ التخزين الفوري في B2 (بدلاً من R2)
  await storeErrorImmediately(error, env);
  
  // 3. ✅ فحص الـ Deduplication
  if (await isDuplicateError(error, env, mergedConfig)) {
    await trackMetrics('deduplicated', env);
    return;
  }
    
  // 4. ✅ فحص الـ Circuit Breaker
  if (await isCircuitBreakerOpen(env, mergedConfig)) {
    await queueErrorForRetry(error, env);
    await trackMetrics('queued', env);
    return;
  }
  
  // 5. ✅ فحص الـ Rate Limiter
  if (!(await checkRateLimit(env, mergedConfig))) {
    await queueErrorForRetry(error, env);
    await trackMetrics('queued', env);
    return;
  }
  
  // 6. ✅ Incident Aggregation
  if (mergedConfig.enableIncidentAggregation) {
    const incidentId = await aggregateIncident(error, env, mergedConfig);
    if (incidentId) {
      await trackMetrics('aggregated', env);
      return;
    }
  }
  
  // 7. ✅ إرسال إلى تليجرام
  try {
    const message = formatTelegramMessage(error);
    await sendTelegramMessageWithRetry(
      message,
      env.TELEGRAM_ERROR_CHAT_ID,
      env.TELEGRAM_BOT_TOKEN,
      mergedConfig
    );
    
    await markErrorAsSent(error, env);
    await recordCircuitBreakerSuccess(env);
    await trackMetrics('sent', env);
    
  } catch (sendError) {
    await queueErrorForRetry(error, env);
    await recordCircuitBreakerFailure(env, mergedConfig);
    await trackMetrics('failed', env);
    
    console.error('❌ Failed to send to Telegram:', sendError);
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
  const key = `dedup:${error.code}:${storeId}:${error.userMessage.substring(0, 100)}`;
  
  const redis = await getRedis(env);
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
  await redis.del('circuit_breaker:telegram', 'circuit_breaker:failure_count');
}

async function recordCircuitBreakerFailure(
  env: Env,
  config: NotifierConfig
): Promise<void> {
  const redis = await getRedis(env);
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
  const storeId = error.context?.storeId || (error.metadata?.storeId as string) || 'global';
  const incidentKey = `incident:${error.code}:${storeId}`;
  
  const incidentId = await redis.get<string>(incidentKey);
  
  if (incidentId) {
    await redis.hincrby(incidentKey, 'count', 1);
    await redis.hset(incidentKey, { lastSeen: Date.now().toString() });
    await redis.expire(incidentKey, config.incidentWindowSeconds!);
    return incidentId;
  }
  
  const newIncidentId = `inc_${Date.now()}_${error.code}`;
  await redis.set(incidentKey, newIncidentId, {
    ex: config.incidentWindowSeconds!,
  });
  
  await redis.hset(incidentKey, {
    id: newIncidentId,
    code: error.code,
    severity: error.severity,
    storeId,
    count: '1',
    firstSeen: Date.now().toString(),
    lastSeen: Date.now().toString(),
    sample: JSON.stringify(error.toJSON()),
  });
  
  return null;
}

// ============================================================
// 💾 التخزين الفوري في Backblaze B2 (بدلاً من R2)
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
    error: error.toJSON(),
    context: sanitizedContext,
    timestamp: Date.now(),
    processed: false,
    retryCount: 0,
    processingStartedAt: undefined, // حقن الحقول الاختيارية الجديدة لضمان سلامة الـ Parsing 
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
  
  // ✅ استخدام B2 بدلاً من R2
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
  await redis.lpush('error:queue', JSON.stringify(error.toJSON()));
  await redis.ltrim('error:queue', 0, 999);
}

async function markErrorAsSent(
  error: SystemError,
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  await redis.set(
    `error:sent:${error.code}:${Date.now()}`,
    '1',
    { ex: 86400 }
  );
}

// ============================================================
// 📝 تنسيق الرسالة لتليجرام
// ============================================================

function formatTelegramMessage(error: SystemError): TelegramMessage {
  const ctx = ensureContext();
  const severityEmoji = getSeverityEmoji(error.severity);
  const severityLabel = getSeverityLabel(error.severity);
  
  const title = `${severityEmoji} *${severityLabel}* - \`${error.code}\``;
  const stackTrace = error.stack ? `\n\`\`\`\n${error.stack.slice(0, 2000)}\n\`\`\`` : '';
  const metadataStr = error.metadata ? `\n📊 *بيانات إضافية:*\n\`\`\`json\n${JSON.stringify(error.metadata, null, 2).slice(0, 500)}\n\`\`\`` : '';
  
  // 🚀 تصليح فولاذي: حارس الـ UUID الصريح لمنع تفجير الـ TelegramMessageSchema
  const safeCorrelationId: string = ctx.correlationId || error.context?.correlationId || crypto.randomUUID();
  const safeStoreId: string = ctx.storeId || error.context?.storeId || 'global-store';
  const safePath: string = ctx.path || error.context?.path || '/unknown';

  const details = `
📌 *الرسالة:* ${escapeMarkdownV2(error.userMessage)}
📂 *التصنيف:* ${escapeMarkdownV2(error.category)}
🕒 *التوقيت:* ${escapeMarkdownV2(new Date().toISOString())}
🔗 *Correlation ID:* \`${safeCorrelationId}\`
🏪 *المتجر:* \`${safeStoreId}\`
📁 *المسار:* ${escapeMarkdownV2(safePath)}
${stackTrace}
${metadataStr}
`.trim();
  
  return {
    title,
    details,
    code: error.code,
    severity: error.severity,
    correlationId: safeCorrelationId, 
    storeId: safeStoreId,
    merchantId: ctx.merchantId || error.context?.merchantId,
    path: safePath,
  };
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
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
          parse_mode: 'MarkdownV2',
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
// 🧰 دوال مساعدة
// ============================================================

function getSeverityEmoji(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '🔵';
  }
}

function getSeverityLabel(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical': return 'خطأ خطير - تدخل مطلوب فوراً!';
    case 'warning': return 'خطأ تحذيري';
    case 'info': return 'معلومة';
    default: return 'خطأ غير معروف';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ✅ الحصول على Redis client متوافق ومكاش كلياً للـ Edge
 */
async function getRedis(env: Env): Promise<Redis> {
  if (globalRedisInstance) return globalRedisInstance;

  if (env.REDIS_TOKEN) {
    globalRedisInstance = new Redis({ url: env.REDIS_URL, token: env.REDIS_TOKEN });
  } else {
    globalRedisInstance = new Redis({ url: env.REDIS_URL, token: '' });
  }

  return globalRedisInstance;
}

async function trackMetrics(
  action: 'sent' | 'failed' | 'queued' | 'deduplicated' | 'aggregated' | 'skipped',
  env: Env
): Promise<void> {
  const redis = await getRedis(env);
  const key = `metrics:telegram:${action}:${new Date().toISOString().split('T')[0]}`;
  await redis.incr(key);
  await redis.expire(key, 86400);
}

// ============================================================
// 🧪 دوال مساعدة للاختبار
// ============================================================

export function createTestErrorForNotifier(): SystemError {
  return classifyError(new Error('Test error'), {
    storeId: 'test-store',
    path: '/test',
  });
}