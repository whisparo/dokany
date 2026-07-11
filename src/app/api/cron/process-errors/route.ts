// app/api/cron/process-errors/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { processErrorQueue } from '@/lib/errors/background-processor';
import type { Env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * بناء كائن البيئة من process.env.
 * ملاحظة: `DB` ليس مطلوباً في `processErrorQueue`، لذا لا نحتاج لقراءته هنا.
 */
function buildEnv(): Omit<Env, 'DB'> {
  const env = process.env;

  return {
    B2_ENDPOINT: env.B2_ENDPOINT || '',
    B2_BUCKET_NAME: env.B2_BUCKET_NAME || '',
    B2_ACCESS_KEY_ID: env.B2_ACCESS_KEY_ID || '',
    B2_SECRET_ACCESS_KEY: env.B2_SECRET_ACCESS_KEY || '',
    TELEGRAM_ERROR_CHAT_ID: env.TELEGRAM_ERROR_CHAT_ID || '',
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || '',
    REDIS_URL: env.REDIS_URL || '',
    REDIS_TOKEN: env.REDIS_TOKEN || '',
    QSTASH_TOKEN: env.QSTASH_TOKEN || '',
    QSTASH_URL: env.QSTASH_URL || '',
    CRON_SECRET: env.CRON_SECRET,
  };
}

/**
 * معالج الـ Cron Job الاقتصادي والمجمع (كل 10 دقائق)
 */
export async function GET(request: NextRequest) {
  try {
    const envPartial = buildEnv();

    // التحقق من وجود المتغيرات الأساسية
    const requiredVars: (keyof Omit<Env, 'DB'>)[] = [
      'B2_ENDPOINT',
      'B2_BUCKET_NAME',
      'B2_ACCESS_KEY_ID',
      'B2_SECRET_ACCESS_KEY',
      'TELEGRAM_ERROR_CHAT_ID',
      'TELEGRAM_BOT_TOKEN',
      'REDIS_URL',
      'REDIS_TOKEN',
      'QSTASH_TOKEN',
    ];

    const missing = requiredVars.filter((key) => !envPartial[key]);
    if (missing.length > 0) {
      console.error(`❌ [Cron Job] Missing environment variables: ${missing.join(', ')}`);
      return NextResponse.json(
        { success: false, error: `Missing env vars: ${missing.join(', ')}` },
        { status: 500 }
      );
    }

    // التحقق من مفتاح الـ Cron (اختياري)
    const authHeader = request.headers.get('authorization');
    const cronSecret = envPartial.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [Cron Job] Unauthorized attempt blocked');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ تمرير envPartial إلى processErrorQueue (لا يحتاج إلى DB)
    const result = await processErrorQueue(envPartial as Env, { maxBatchSize: 20 });

    return NextResponse.json({
      success: true,
      metrics: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
        aggregated: result.aggregated,
        sentToTelegram: result.sentToTelegram,
        durationMs: result.duration,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('⚠️ [Cron Job Exception]:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}