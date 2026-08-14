// src/workers/routes/cron.ts

import { Hono } from 'hono';
import type { Env } from '@/lib/env';
import { processErrorQueue } from '@/lib/errors/background-processor';

export const cronRouter = new Hono<{ Bindings: Env }>();

/**
 * دالة مساعدة للمقارنة الآمنة زمنياً لمنع هجمات الـ Timing Attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * POST /api/cron/process-errors
 * 
 * يُستدعى من QStash (أو أي مجدول موثوق) بشكل دوري.
 * مسؤول عن معالجة الأخطاء المتراكمة في الخلفية بأمان.
 */
cronRouter.post('/cron/process-errors', async (c) => {
  // ✅ 1. استخراج الـ Secrets المستلمة من الـ Headers
  const clientSecret = c.req.header('X-Cron-Secret') || c.req.header('x-internal-secret') || '';

  // ✅ 2. استخراج الأسرار المقبولة من بيئة التشغيل
  const validSecrets = [
    c.env.CRON_SECRET,
    c.env.QSTASH_TOKEN,
    c.env.INTERNAL_API_SECRET,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (validSecrets.length === 0) {
    console.error('❌ [Cron Error]: No valid cron secret configured in environment variables.');
    return c.json({ success: false, error: 'Server configuration error' }, 500);
  }

  if (!clientSecret) {
    console.warn('⚠️ [Cron Warning]: Unauthorized cron attempt with missing secret header.');
    return c.json({ success: false, error: 'Unauthorized: Missing secret header' }, 401);
  }

  // ✅ 3. التحقق الأمني الآمن زمنياً (Timing-Safe Check)
  const isAuthorized = validSecrets.some((secret) => timingSafeEqual(clientSecret, secret));

  if (!isAuthorized) {
    console.warn('⚠️ [Cron Warning]: Unauthorized cron attempt with invalid secret.');
    return c.json({ success: false, error: 'Unauthorized: Invalid secret' }, 401);
  }

  // ✅ 4. المعالجة مع حماية من الـ Timeout
  try {
    const BATCH_LIMIT = 50; 
    
    // استدعاء المعالج للدفعة
    const result = await processErrorQueue(c.env, { 
      maxBatchSize: BATCH_LIMIT,
      maxFilesPerRun: 100 
    });

    return c.json({ 
      success: true, 
      message: `Successfully processed ${result.processed} files (${result.succeeded} succeeded, ${result.failed} failed).`,
      data: {
        processedCount: result.processed,
        succeededCount: result.succeeded,
        failedCount: result.failed,
        skippedCount: result.skipped,
        aggregatedIncidents: result.aggregated,
        telegramMessagesSent: result.sentToTelegram,
        durationMs: result.duration,
      }
    }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ [Cron Job] process-errors failed:', errorMessage);
    
    // إرجاع HTTP 500 لإعلام المجدول بإعادة المحاولة
    return c.json({ success: false, error: 'Internal processing error' }, 500);
  }
});