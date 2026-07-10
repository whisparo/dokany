// app/api/cron/process-errors/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { processErrorQueue } from '@/lib/errors/queue-processor';
import type { Env } from '@/lib/env'; // ✅ استيراد النوع الموحد من env.ts

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
/**
 * معالج الـ Cron Job الاقتصادي والمجمع (كل 10 دقائق)
 * يقرأ ملفات الأخطاء من B2، يحدّث العدادات في Redis، ويرسل التقارير لتليجرام.
 */
export async function GET(request: NextRequest) {
  try {
    // ✅ بناء كائن env من process.env (المتغيرات متوفرة في Pages Functions)
    const env: Env = {
      DB: process.env.DB as any, // D1 binding (يتم توفيره عبر OpenNext)
      B2_ENDPOINT: process.env.B2_ENDPOINT!,
      B2_BUCKET_NAME: process.env.B2_BUCKET_NAME!,
      B2_ACCESS_KEY_ID: process.env.B2_ACCESS_KEY_ID!,
      B2_SECRET_ACCESS_KEY: process.env.B2_SECRET_ACCESS_KEY!,
      TELEGRAM_ERROR_CHAT_ID: process.env.TELEGRAM_ERROR_CHAT_ID!,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
      REDIS_URL: process.env.REDIS_URL!,
      REDIS_TOKEN: process.env.REDIS_TOKEN!,
      QSTASH_TOKEN: process.env.QSTASH_TOKEN!,
    };

    // ✅ التحقق من وجود المتغيرات الأساسية
    const requiredVars = [
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

    const missing = requiredVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      console.error(`❌ [Cron Job] Missing environment variables: ${missing.join(', ')}`);
      return NextResponse.json(
        { success: false, error: `Missing env vars: ${missing.join(', ')}` },
        { status: 500 }
      );
    }

    // ✅ التحقق من مفتاح الـ Cron (اختياري)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

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