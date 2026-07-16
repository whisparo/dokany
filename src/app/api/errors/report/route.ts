// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { type ErrorContext } from '@/lib/errors/types';
import type { Env } from '@/lib/env';

// 🚀 تشغيل المسار على الـ Cloudflare Edge لسرعة استجابة مذهلة وتكلفة صفرية
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  // جلب الـ ExecutionContext الخاص بـ Cloudflare لإطلاق المهام الخلفية
  const ctx = (req as any).context;

  try {
    const body = await req.json();

    const { rawError, context } = body as {
      rawError: unknown;
      context: Partial<ErrorContext>;
    };

    // 1. التحقق الفوري من الـ storeId الإلزامي لعزل البيانات في الـ Edge
    if (!context?.storeId) {
      return NextResponse.json(
        { success: false, error: 'MISSING_STORE_ID', message: 'Mandatory "storeId" is required in error context.' },
        { status: 400 }
      );
    }

    // 2. تصنيف وتحويل الخطأ الخام لـ SystemError موحد وصارم
    const systemError = classifyError(rawError, context);

    // 3. بناء الـ Env بالقيم الحقيقية المطلوبة للـ Notifier والـ Redis والـ B2
    const env: Env = {
      TELEGRAM_ERROR_CHAT_ID: process.env.TELEGRAM_ERROR_CHAT_ID || '',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
      // أضف أي متغيرات بيئة أخرى يتطلبها نظام الـ B2 لديك هنا
      B2_APPLICATION_KEY_ID: process.env.B2_APPLICATION_KEY_ID || '',
      B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY || '',
      B2_BUCKET_NAME: process.env.B2_BUCKET_NAME || '',
      B2_ENDPOINT: process.env.B2_ENDPOINT || '',
    } as unknown as Env;

    // 4. استدعاء الـ Notifier الذكي الخاص بك
    // دالتك sendErrorToTelegram ستقوم تلقائياً بـ:
    // - الحفظ الفوري في B2 (لجميع الأخطاء)
    // - تصفية الـ Deduplication والـ Rate Limiting والـ Circuit Breaker (عبر Redis)
    // - الإرسال السريع لـ Telegram إذا كان الخطأ 'critical' والـ shouldAlert = true
    const notifierPromise = sendErrorToTelegram(systemError, env);

    if (ctx?.waitUntil) {
      // إرسال صامت في الخلفية حتى لا ينتظر المتصفح رد الـ API
      ctx.waitUntil(notifierPromise);
    } else {
      await notifierPromise; // Fallback إذا لم تدعم البيئة الحالية waitUntil
    }

    // 5. الرد بنجاح على العميل بأكواد مفهومة وآمنة
    return NextResponse.json({
      success: true,
      code: systemError.code,
      userMessage: systemError.userMessage,
    });

  } catch (routeError: any) {
    console.error('🚨 فشل معالجة الخطأ داخل الـ API Route:', routeError);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ROUTER_ERROR',
        message: routeError?.message || 'Failed to process and log the submitted error.',
      },
      { status: 500 }
    );
  }
}