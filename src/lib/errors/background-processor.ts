// src/lib/errors/background-processor.ts

// في أعلى src/lib/errors/background-processor.ts

import { 
  S3Client, 
  ListObjectsV2Command, 
  ListObjectsV2CommandOutput,
  CopyObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { type StoredError } from './types';
import { Redis } from '@upstash/redis/cloudflare';
import { type Env } from '@/lib/env';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit'; // ✅ جديد
// ============================================
// 📦 الأنواع والـ Interfaces
// ============================================


export interface ProcessorConfig {
  maxFilesPerRun?: number;
  maxBatchSize?: number;
  rawPath?: string;
  processedPath?: string;
  dlqPath?: string;
  maxRetries?: number;
  aggregationWindowMinutes?: number;
  maxTelegramMessagesPerHour?: number;
  b2TimeoutMs?: number;
  maxCorrelationIds?: number;
}

const DEFAULT_CONFIG: Required<ProcessorConfig> = {
  maxFilesPerRun: 100,
  maxBatchSize: 50,
  rawPath: 'errors/raw/',
  processedPath: 'errors/processed/',
  dlqPath: 'errors/failed/',
  maxRetries: 3,
  aggregationWindowMinutes: 10,
  maxTelegramMessagesPerHour: 10,
  b2TimeoutMs: 30000,
  maxCorrelationIds: 100,
};

export interface AggregatedIncident {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  storeId: string;
  count: number;
  actualCount?: number; // ✅ العدد الفعلي (بعد الـ capping)
  firstSeen: number;
  lastSeen: number;
  sampleError: StoredError;
  correlationIds: string[];
}

export interface ProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  aggregated: number;
  sentToTelegram: number;
  duration: number;
}
// ============================================
// 3️⃣ دوال التحقق (Type Guards) ← هنا 🔥
// ============================================

/**
 * Type Guard للتحقق من أن الاستجابة هي من نوع ListObjectsV2CommandOutput
 */
function isListObjectsV2Response(
  response: unknown
): response is ListObjectsV2CommandOutput {
  if (!response || typeof response !== 'object') return false;
  const obj = response as Record<string, unknown>;
  return (
    'Contents' in obj &&
    'IsTruncated' in obj &&
    'NextContinuationToken' in obj
  );
}


// ============================================
// 🔧 B2 Client (WeakMap Pattern)
// ============================================

const b2Clients = new WeakMap<Env, S3Client>();

function getB2Client(env: Env): S3Client {
  let client = b2Clients.get(env);
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.B2_ENDPOINT,
      credentials: {
        accessKeyId: env.B2_ACCESS_KEY_ID,
        secretAccessKey: env.B2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    b2Clients.set(env, client);
  }
  return client;
}

// ============================================
// 🔧 Redis Client (Lazy Initialization)
// ============================================

async function getRedis(env: Env): Promise<Redis> {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ============================================
// 🛡️ Retry Logic
// ============================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`[BackgroundProcessor] ${operationName} failed (attempt ${i + 1}/${maxRetries}):`, error);
      
      if (i < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ============================================
// 🛡️ Validation
// ============================================

function validateStoredError(data: unknown): data is StoredError {
  // 1. التحقق من أن البيانات كائن غير فارغ
  if (!data || typeof data !== 'object') return false;

  // 2. تحويل آمن إلى Record للوصول إلى الخصائص
  const obj = data as Record<string, unknown>;

  // 3. التحقق من وجود الخصائص الأساسية
  if (!('id' in obj) || typeof obj.id !== 'string') return false;
  if (!('error' in obj) || typeof obj.error !== 'object' || obj.error === null) return false;
  if (!('context' in obj) || typeof obj.context !== 'object' || obj.context === null) return false;
  if (!('timestamp' in obj) || typeof obj.timestamp !== 'number') return false;

  // 4. التحقق من خصائص nested
  const errorObj = obj.error as Record<string, unknown>;
  if (!('code' in errorObj) || typeof errorObj.code !== 'string') return false;
  if (!('severity' in errorObj) || typeof errorObj.severity !== 'string') return false;

  const contextObj = obj.context as Record<string, unknown>;
  if (!('storeId' in contextObj) || typeof contextObj.storeId !== 'string') return false;

  // 5. جميع التحققات اجتازت → البيانات صالحة
  return true;
}

// ============================================
// 🧠 المعالج الرئيسي
// ============================================

export async function processErrorQueue(
  env: Env,
  config: Partial<ProcessorConfig> = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const result: ProcessingResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    aggregated: 0,
    sentToTelegram: 0,
    duration: 0,
  };
  
  try {
    console.log('[BackgroundProcessor] Starting error queue processing...');
    
    // 1. جلب الملفات
    const rawFiles = await withRetry(
      () => fetchRawFilesFromB2(env, mergedConfig),
      3,
      'fetchRawFilesFromB2'
    );
    
    console.log(`[BackgroundProcessor] Found ${rawFiles.length} raw files`);
    
    if (rawFiles.length === 0) {
      result.duration = Date.now() - startTime;
      return result;
    }
    
    // 2. تقسيم إلى Batches
    const batches = chunkArray(rawFiles, mergedConfig.maxBatchSize);
    const incidents: AggregatedIncident[] = [];
    
    for (const batch of batches) {
      const batchResult = await processBatch(batch, env, mergedConfig, incidents);
      result.processed += batchResult.processed;
      result.succeeded += batchResult.succeeded;
      result.failed += batchResult.failed;
      result.skipped += batchResult.skipped;
    }
    
    // 3. Aggregation
    const aggregatedIncidents = aggregateIncidents(incidents, mergedConfig);
    result.aggregated = aggregatedIncidents.length;
    
    // 4. تحديث Redis
    if (aggregatedIncidents.length > 0) {
      await updateRedisCounters(env, aggregatedIncidents);
    }
    
    // 5. إرسال التقارير
    result.sentToTelegram = await sendAggregatedReports(env, aggregatedIncidents, mergedConfig);
    
    // 6. نقل الملفات
    await moveToProcessed(rawFiles, env, mergedConfig);
    
    result.duration = Date.now() - startTime;
    console.log('[BackgroundProcessor] Processing completed:', result);
    
    return result;
    
  } catch (error) {
    console.error('[BackgroundProcessor] Fatal error:', error);
    await sendFatalErrorAlert(env, error);
    result.duration = Date.now() - startTime;
    result.failed++;
    return result;
  }
}

// ============================================
// 🛡️ Type Guards & Helpers
// ============================================

/**
 * Type Guard للتحقق من أن الخطأ هو NoSuchKey من AWS SDK
 */
function isNoSuchKeyError(error: unknown): error is Error & { name: 'NoSuchKey' } {
  return (
    error instanceof Error &&
    error.name === 'NoSuchKey'
  );
}

// ============================================
// 📂 B2 Operations
// ============================================

/**
 * جلب قائمة الملفات الخام من B2
 */
async function fetchRawFilesFromB2(
  env: Env,
  config: Required<ProcessorConfig>
): Promise<string[]> {
  const client = getB2Client(env);
  const files: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const remaining = Math.max(0, config.maxFilesPerRun - files.length);
    if (remaining === 0) break;

    const command: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: env.B2_BUCKET_NAME,
      Prefix: config.rawPath,
      MaxKeys: Math.min(1000, remaining),
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    if (!isListObjectsV2Response(response)) {
      console.warn('[BackgroundProcessor] Unexpected response type from S3');
      break;
    }

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Key.endsWith('.json')) {
          files.push(obj.Key);
          if (files.length >= config.maxFilesPerRun) break;
        }
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && files.length < config.maxFilesPerRun);

  return files;
}

/**
 * معالجة دفعة من الملفات
 */
async function processBatch(
  files: string[],
  env: Env,
  config: Required<ProcessorConfig>,
  incidents: AggregatedIncident[]
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  const client = getB2Client(env);

  for (const fileKey of files) {
    try {
      result.processed++;

      const response = await withRetry(
        () => client.send(
          new GetObjectCommand({
            Bucket: env.B2_BUCKET_NAME,
            Key: fileKey,
          })
        ),
        2,
        `GetObject ${fileKey}`
      );

      if (!response.Body) {
        result.skipped++;
        continue;
      }

      const content = await response.Body.transformToString();
      const parsed = JSON.parse(content);

      if (!validateStoredError(parsed)) {
        console.error(`[BackgroundProcessor] Invalid stored error: ${fileKey}`);
        result.skipped++;
        continue;
      }

      // بعد التحقق، نعرف أن `parsed` هو من النوع `StoredError`
      const storedError = parsed;

      if (storedError.processed) {
        result.skipped++;
        continue;
      }

      if ((storedError.retryCount || 0) >= config.maxRetries) {
        await moveToDLQ(fileKey, storedError, env, config);
        result.failed++;
        continue;
      }

      // تجميع الحادثة
      incidents.push({
        code: storedError.error.code || 'UNKNOWN_CODE',
        severity: storedError.error.severity || 'info',
        storeId: storedError.context?.storeId || 'global',
        count: 1,
        actualCount: 1,
        firstSeen: storedError.timestamp,
        lastSeen: storedError.timestamp,
        sampleError: storedError,
        correlationIds: [storedError.context?.correlationId || 'unknown'],
      });

      result.succeeded++;
    } catch (error) {
      // ✅ استخدام Type Guard بدلاً من as any
      if (isNoSuchKeyError(error)) {
        result.skipped++;
      } else {
        console.error(`[BackgroundProcessor] Failed to process ${fileKey}:`, error);
        result.failed++;
      }
    }
  }

  return result;
}

// ============================================
// 🎯 Aggregation
// ============================================

function aggregateIncidents(
  incidents: AggregatedIncident[],
  config: Required<ProcessorConfig>
): AggregatedIncident[] {
  const aggregated = new Map<string, AggregatedIncident>();
  const windowMs = config.aggregationWindowMinutes * 60 * 1000;
  
  for (const incident of incidents) {
    const timeWindow = Math.floor(incident.firstSeen / windowMs);
    const key = `${incident.code}:${incident.storeId}:${timeWindow}`;
    
    if (aggregated.has(key)) {
      const existing = aggregated.get(key)!;
      existing.count++;
      existing.actualCount = (existing.actualCount || existing.count) + incident.count;
      existing.lastSeen = Math.max(existing.lastSeen, incident.lastSeen);
      
      // ✅ حد أقصى للـ correlationIds
      if (existing.correlationIds.length < config.maxCorrelationIds) {
        existing.correlationIds.push(...incident.correlationIds);
      }
      
      if (incident.lastSeen > existing.lastSeen) {
        existing.sampleError = incident.sampleError;
      }
    } else {
      aggregated.set(key, { 
        ...incident, 
        correlationIds: [...incident.correlationIds],
        actualCount: incident.count,
      });
    }
  }
  
  return Array.from(aggregated.values());
}

// ============================================
// 📊 Redis Updates
// ============================================

async function updateRedisCounters(
  env: Env,
  incidents: AggregatedIncident[]
): Promise<void> {
  const redis = await getRedis(env);
  const date = new Date().toISOString().split('T')[0];
  
  // ✅ تقسيم إلى Batches
  const PIPELINE_BATCH_SIZE = 50;
  
  for (let i = 0; i < incidents.length; i += PIPELINE_BATCH_SIZE) {
    const batch = incidents.slice(i, i + PIPELINE_BATCH_SIZE);
    const pipeline = redis.pipeline();
    
    for (const incident of batch) {
      pipeline.hincrby(`errors:daily:${date}`, incident.code, incident.count);
      pipeline.hincrby(`errors:store:${incident.storeId}:${date}`, incident.code, incident.count);
      pipeline.hincrby(`errors:severity:${date}`, incident.severity, incident.count);
      pipeline.set(`errors:last_update`, Date.now().toString());
    }
    
    pipeline.expire(`errors:daily:${date}`, 7 * 24 * 60 * 60);
    pipeline.expire(`errors:severity:${date}`, 7 * 24 * 60 * 60);
    
    await pipeline.exec();
  }
}

// ============================================
// 📤 Telegram Reports (مع Rate Limit محسّن)
// ============================================

async function sendAggregatedReports(
  env: Env,
  incidents: AggregatedIncident[],
  config: Required<ProcessorConfig>
): Promise<number> {
  // ✅ لو مفيش حوادث، ما نحتاجش نتحقق من الـ rate limit
  if (incidents.length === 0) {
    return 0;
  }
  
  const redis = await getRedis(env);
  
  // ✅ استخدام buildRateLimitKey للـ namespacing المنظم
  const rateLimitKey = buildRateLimitKey(
    'telegram',
    env.TELEGRAM_ERROR_CHAT_ID,
    'messages'
  );
  
  // ✅ استخدام checkRateLimit المحسّن (Bounded Counter + Reset Time)
  const rateLimitResult = await checkRateLimit(
    redis,
    rateLimitKey,
    config.maxTelegramMessagesPerHour,
    3600 // ساعة واحدة
  );
  
  // ✅ Logging مفصّل للـ monitoring
  console.log('[BackgroundProcessor] Telegram rate limit status:', {
    allowed: rateLimitResult.allowed,
    remaining: rateLimitResult.remaining,
    current: rateLimitResult.current,
    limit: rateLimitResult.limit,
    resetAt: new Date(rateLimitResult.resetAt).toISOString(),
  });
  
  if (!rateLimitResult.allowed) {
    console.warn(
      '[BackgroundProcessor] Telegram rate limit exceeded. ' +
      `Remaining: ${rateLimitResult.remaining}, ` +
      `Reset at: ${new Date(rateLimitResult.resetAt).toISOString()}`
    );
    return 0;
  }
  
  // ✅ الفلترة والترتيب بناءً على الخطورة
  const sortedIncidents = incidents.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count;
  });
  
  if (sortedIncidents.length > 0) {
    const report = buildAggregatedReport(sortedIncidents);
    await sendTelegramMessage(env, report);
    return 1;
  }
  
  return 0;
}

/**
 * ✅ Escape special characters for Telegram Markdown
 * يمنع كسر الـ parsing لو فيه رموز خاصة
 */
function escapeMarkdown(text: string): string {
  if (!text) return '';
  // الرموز الخاصة في Markdown: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function buildAggregatedReport(incidents: AggregatedIncident[]): string {
  const lines: string[] = [
    '📊 *\\[Dokany\\] Aggregated Error Report*',
    `🕒 *Time:* ${escapeMarkdown(new Date().toISOString())}`,
    '─────────────────────────────',
    '',
  ];
  
  // ✅ عرض أول 10 حوادث (الأهم)
  for (const incident of incidents.slice(0, 10)) {
    const emoji = incident.severity === 'critical' ? '🚨' : 
                  incident.severity === 'warning' ? '⚠️' : 'ℹ️';
    
    const count = incident.actualCount || incident.count;
    const lastSeenTime = new Date(incident.lastSeen).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    lines.push(
      `${emoji} *Code:* \`${escapeMarkdown(incident.code)}\` *(${count}x)*`,
      `   🏪 *Store:* \`${escapeMarkdown(incident.storeId)}\``,
      `   🕐 *Last Seen:* ${lastSeenTime}`,
      ''
    );
  }
  
  // ✅ لو في حوادث إضافية، اعرض العدد
  if (incidents.length > 10) {
    lines.push('─────────────────────────────');
    lines.push(`_... and ${incidents.length - 10} more incidents._`);
  }
  
  // ✅ Footer مع معلومات إضافية
  lines.push('');
  lines.push('─────────────────────────────');
  lines.push(`_Total incidents: ${incidents.length}_`);
  lines.push(`_Generated by Dokany Error System_`);
  
  return lines.join('\n');
}

async function sendTelegramMessage(env: Env, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  // ✅ إضافة timeout للـ fetch (5 ثواني)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Dokany-Error-System/1.0',
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ERROR_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2', // ✅ محسّن من Markdown إلى MarkdownV2
        disable_web_page_preview: true, // ✅ منع تحميل الروابط تلقائياً
      }),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[BackgroundProcessor] Telegram API error: ${response.status}`,
        errorText
      );
      
      // ✅ معالجة أخطاء Telegram الشائعة
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        console.warn(
          `[BackgroundProcessor] Telegram rate limit hit. Retry after: ${retryAfter}s`
        );
      } else if (response.status === 400 && errorText.includes('can\'t parse')) {
        console.error('[BackgroundProcessor] Markdown parsing error. Sending plain text fallback.');
        // ✅ Fallback: إرسال بدون Markdown
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_ERROR_CHAT_ID,
            text: text.replace(/[*_`\[\]()~>#+=|{}.!\\-]/g, ''), // إزالة رموز Markdown
          }),
        });
      }
    } else {
      console.log('[BackgroundProcessor] Telegram message sent successfully');
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error('[BackgroundProcessor] Telegram request timeout (5s)');
    } else {
      console.error('[BackgroundProcessor] Failed to send Telegram message:', error);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
// ============================================
// 🗂️ File Operations
// ============================================

async function moveToProcessed(
  files: string[],
  env: Env,
  config: Required<ProcessorConfig>
): Promise<void> {
  const client = getB2Client(env);
  
  for (const fileKey of files) {
    try {
      const destKey = fileKey.replace(config.rawPath, config.processedPath);
      
      // ✅ Copy مع URL encoding
      const copyResult = await withRetry(
        () => client.send(new CopyObjectCommand({
          Bucket: env.B2_BUCKET_NAME,
          CopySource: `/${env.B2_BUCKET_NAME}/${encodeURIComponent(fileKey)}`,
          Key: destKey,
        })),
        2,
        `CopyObject ${fileKey}`
      );
      
      // ✅ التحقق من نجاح الـ Copy قبل الـ Delete
      if (copyResult.CopyObjectResult?.ETag) {
        await withRetry(
          () => client.send(new DeleteObjectCommand({
            Bucket: env.B2_BUCKET_NAME,
            Key: fileKey,
          })),
          2,
          `DeleteObject ${fileKey}`
        );
      } else {
        console.error(`[BackgroundProcessor] Copy failed for ${fileKey}: No ETag`);
      }
    } catch (error) {
      console.error(`[BackgroundProcessor] Failed to move ${fileKey}:`, error);
      // ❌ لا تحذف الملف الأصلي!
    }
  }
}

async function moveToDLQ(
  fileKey: string,
  storedError: StoredError,
  env: Env,
  config: Required<ProcessorConfig>
): Promise<void> {
  const client = getB2Client(env);
  const dlqKey = fileKey.replace(config.rawPath, config.dlqPath);
  
  const dlqData = {
    ...storedError,
    failedAt: Date.now(),
    reason: 'Max retries exceeded inside Background Processor',
  };
  
  await withRetry(
    () => client.send(new PutObjectCommand({
      Bucket: env.B2_BUCKET_NAME,
      Key: dlqKey,
      Body: JSON.stringify(dlqData, null, 2),
      ContentType: 'application/json',
    })),
    2,
    `PutObject DLQ ${fileKey}`
  );
  
  await withRetry(
    () => client.send(new DeleteObjectCommand({
      Bucket: env.B2_BUCKET_NAME,
      Key: fileKey,
    })),
    2,
    `DeleteObject DLQ ${fileKey}`
  );
  
  await sendTelegramMessage(
    env,
    `💀 *[DLQ ALERT]*\nCode: \`${storedError.error.code}\`\nStore: \`${storedError.context?.storeId || 'global'}\`\nStatus: Shifted to Emergency DLQ Storage.`
  );
}

// ============================================
// 🔧 Helpers
// ============================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function sendFatalErrorAlert(env: Env, error: unknown): Promise<void> {
  try {
    await sendTelegramMessage(
      env,
      `🚨 *Fatal Error in Background Processor*\n\n\`\`\`\n${String(error)}\n\`\`\``
    );
  } catch (alertError) {
    console.error('[BackgroundProcessor] Failed to send fatal error alert:', alertError);
  }
}

// ============================================
// 🚀 HTTP Endpoint
// ============================================

export async function handleBackgroundProcessorRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const result = await processErrorQueue(env);
    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result, 
        timestamp: new Date().toISOString() 
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: String(error), 
        timestamp: new Date().toISOString() 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}