// app/api/cron/process-errors/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { processErrorQueue } from '@/lib/errors/queue-processor';
import type { Env } from '@/lib/env';
import type { D1Database } from '@cloudflare/workers-types';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

// 🛡️ توسيع الواجهة لاستقبال الـ Bindings بنظافة في الـ Cron Request
interface NextCloudflareCronRequest extends NextRequest {
  cloudflare?: {
    env: {
      DB: D1Database;
      B2_ENDPOINT?: string;
      B2_BUCKET_NAME?: string;
      B2_ACCESS_KEY_ID?: string;
      B2_SECRET_ACCESS_KEY?: string;
      TELEGRAM_ERROR_CHAT_ID?: string;
      TELEGRAM_BOT_TOKEN?: string;
      REDIS_URL?: string;
      REDIS_TOKEN?: string;
      QSTASH_TOKEN?: string;
      CRON_SECRET?: string;
    };
  };
}

/**
 * معالج الـ Cron Job الاقتصادي والمجمع (كل 10 دقائق)
 * يقرأ ملفات الأخطاء من B2، يحدّث العدادات في Redis، ويرسل التقارير لتليجرام.
 */
export async function GET(request: NextCloudflareCronRequest) {
  try {
    const cloudflareEnv = request.cloudflare?.env;

    // ✅ بناء كائن env آمن وصريح 100% بدون أي هروب بـ as any
    const env: Env = {
      DB: cloudflareEnv?.DB || (process.env.DB as unknown as D1Database),
      B2_ENDPOINT: cloudflareEnv?.B2_ENDPOINT || process.env.B2_ENDPOINT || '',
      B2_BUCKET_NAME: cloudflareEnv?.B2_BUCKET_NAME || process.env.B2_BUCKET_NAME || '',
      B2_ACCESS_KEY_ID: cloudflareEnv?.B2_ACCESS_KEY_ID || process.env.B2_ACCESS_KEY_ID || '',
      B2_SECRET_ACCESS_KEY: cloudflareEnv?.B2_SECRET_ACCESS_KEY || process.env.B2_SECRET_ACCESS_KEY || '',
      TELEGRAM_ERROR_CHAT_ID: cloudflareEnv?.TELEGRAM_ERROR_CHAT_ID || process.env.TELEGRAM_ERROR_CHAT_ID || '',
      TELEGRAM_BOT_TOKEN: cloudflareEnv?.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
      REDIS_URL: cloudflareEnv?.REDIS_URL || process.env.REDIS_URL || '',
      REDIS_TOKEN: cloudflareEnv?.REDIS_TOKEN || process.env.REDIS_TOKEN || '',
      QSTASH_TOKEN: cloudflareEnv?.QSTASH_TOKEN || process.env.QSTASH_TOKEN || '',
    };

    // ✅ التحقق من وجود المتغيرات الأساسية من الكائن المدمج نفسه لضمان الدقة
    const requiredVars: (keyof Env)[] = [
      'DB',
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

    const missing = requiredVars.filter((key) => !env[key]);
    if (missing.length > 0) {
      console.error(`❌ [Cron Job] Missing environment variables: ${missing.join(', ')}`);
      return NextResponse.json(
        { success: false, error: `Missing env vars: ${missing.join(', ')}` },
        { status: 500 }
      );
    }

    // ✅ التحقق من مفتاح الـ Cron التلقائي والأمن
    const authHeader = request.headers.get('authorization');
    const cronSecret = cloudflareEnv?.CRON_SECRET || process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [Cron Job] Unauthorized attempt blocked');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ معالجة الأخطاء (بـ batchSize 20)
    const result = await processErrorQueue(env, { batchSize: 20 });

    // ✅ إرجاع النتيجة
    return NextResponse.json({
      success: true,
      metrics: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
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