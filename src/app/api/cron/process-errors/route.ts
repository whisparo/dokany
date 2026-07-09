// app/api/cron/process-errors/route.ts

import { NextRequest, NextResponse } from 'next/server';
// 🌟 استيراد الدالة والـ Env الرسمية من قلب الـ processor مباشرة لضمان التطابق 100%
import { processErrorQueue } from '@/lib/errors/queue-processor';
import type { Env } from '@/lib/errors/queue-processor';

export const dynamic = 'force-dynamic';

// دمج الـ Env الأصلية للمشروع مع الـ CRON_SECRET الخاص بالـ Endpoint لحمايتها
interface NextCloudflareCronRequest extends NextRequest {
  cloudflare?: {
    env: Env & {
      CRON_SECRET?: string;
    };
  };
}

/**
 * معالج الـ Cron Job الاقتصادي والمجمع (كل 10 دقائق)
 * يقرأ ملفات الأخطاء من R2، يحدّث العدادات في Redis، ويرسل التقارير لتليجرام.
 */
export async function GET(request: NextCloudflareCronRequest) {
  try {
    const env = request.cloudflare?.env;

    // 1. التحقق التام من وجود موارد البيئة والبنية التحتية لـ Cloudflare
    if (!env || !env.R2_BUCKET) {
      console.error('❌ [Cron Job] Critical: Cloudflare environment bindings or R2_BUCKET missing');
      return NextResponse.json(
        { success: false, error: 'Cloudflare infrastructure environment missing' },
        { status: 500 }
      );
    }

    // 2. التحقق الآمن من مفتاح الـ Cron لحظر العابثين بالقناة
    const authHeader = request.headers.get('authorization');
    const cronSecret = env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [Cron Job] Unauthorized attempt blocked');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. معالجة الـ Batch الحالي (20 خطأ في الدورة الواحدة اقتصاديًا وممتثل لـ QueueProcessorConfig)
    const result = await processErrorQueue(env, { batchSize: 20 });

    // 4. إرجاع النتيجة غنية بالإحصاءات الدقيقة للـ Logs والـ Dashboard
    return NextResponse.json({
      success: true,
      metrics: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
        durationMs: result.duration
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('⚠️ [Cron Job Exception]:', error);
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}