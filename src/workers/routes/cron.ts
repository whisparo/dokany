// src/workers/routes/cron.ts

import { Hono } from 'hono';
import type { Env } from '@/lib/env';
import { processErrorQueue } from '@/lib/errors/background-processor';

export const cronRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /api/cron/process-errors
 * 
 * يُستدعى من QStash (أو أي مجدول موثوق) بشكل دوري.
 * مسؤول عن معالجة الأخطاء المتراكمة في الخلفية بأمان.
 */
cronRouter.post('/cron/process-errors', async (c) => {
  // ✅ 1. التحقق الأمني الصارم مع خيارات Fallback
  const secret = c.req.header('X-Cron-Secret') || c.req.header('x-internal-secret');
  const expectedSecret = c.env.CRON_SECRET || c.env.QSTASH_TOKEN || c.env.INTERNAL_API_SECRET;

  if (!expectedSecret) {
    console.error('❌ Neither CRON_SECRET nor fallback secret is configured in environment');
    return c.json({ success: false, error: 'Server configuration error' }, 500);
  }

  if (secret !== expectedSecret) {
    console.warn('⚠️ Unauthorized cron attempt detected');
    return c.json({ success: false, error: 'Unauthorized: Invalid secret' }, 401);
  }

  // ✅ 2. المعالجة مع حماية من الـ Timeout
  try {
    const BATCH_LIMIT = 50; 
    
    // استدعاء الموزع بالـ env والـ config
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
    });
  } catch (error) {
    // ✅ 3. تسجيل الخطأ بوضوح لسهولة التتبع
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ [Cron Job] process-errors failed:', errorMessage);
    
    // إرجاع 500 يخبر QStash بإعادة المحاولة لاحقاً (Retry)
    return c.json({ success: false, error: 'Internal processing error' }, 500);
  }
});