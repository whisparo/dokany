// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis/cloudflare';
import { checkRateLimit } from '@/lib/rate-limit';
import { getEnv } from '@/lib/env';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { SystemError } from '@/lib/errors/types';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  // ✅ استخدم new URL بدلاً من request.nextUrl (أكثر توافقاً مع Edge)
  const url = new URL(request.url);

  // ✅ اختبار تليجرام: ?test=true
  if (url.searchParams.get('test') === 'true') {
    const env = getEnv();
    console.log('🔍 [Ping] Test mode activated!');
    console.log('🔍 [Ping] TELEGRAM_BOT_TOKEN exists?', !!env.TELEGRAM_BOT_TOKEN);
    console.log('🔍 [Ping] TELEGRAM_ERROR_CHAT_ID:', env.TELEGRAM_ERROR_CHAT_ID);

    const testError = new SystemError({
      code: 'TEST_001',
      userMessage: '🧪 هذا خطأ تجريبي لتأكيد وصول الرسائل لتليجرام',
      technicalMessage: 'Test error triggered manually via ?test=true',
      category: 'system',
      severity: 'critical',
      shouldAlert: true,
      retryable: false,
      metadata: { path: '/api/ping?test=true', storeId: 'global' },
    });

    await sendErrorToTelegram(testError, env);
    return NextResponse.json({
      success: true,
      message: 'Test error sent to Telegram. Check your channel!',
    });
  }

  // ✅ اختبار عبر Header (X-Test: true) كبديل أكثر موثوقية
  if (request.headers.get('x-test') === 'true') {
    const env = getEnv();
    console.log('🔍 [Ping] Test mode activated via Header!');

    const testError = new SystemError({
      code: 'TEST_002',
      userMessage: '🧪 هذا خطأ تجريبي عبر الـ Header',
      technicalMessage: 'Test error triggered via X-Test header',
      category: 'system',
      severity: 'critical',
      shouldAlert: true,
      retryable: false,
      metadata: { path: '/api/ping', storeId: 'global' },
    });

    await sendErrorToTelegram(testError, env);
    return NextResponse.json({
      success: true,
      message: 'Test error sent to Telegram via Header!',
    });
  }

  // ============================================================
  // المسار العادي (اختبار Rate Limit)
  // ============================================================
  try {
    const env = getEnv();
    const redisUrl = env.UPSTASH_REDIS_REST_URL;
    const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      const systemError = new SystemError({
        code: 'REDIS_001',
        userMessage: 'Redis env vars missing',
        technicalMessage: 'Redis configuration missing in environment',
        category: 'system',
        severity: 'critical',
        shouldAlert: true,
        retryable: false,
        metadata: { path: '/api/ping', storeId: 'global' },
      });

      await sendErrorToTelegram(systemError, env);

      return NextResponse.json(
        { error: 'Redis configuration missing' },
        { status: 500 }
      );
    }

    const redis = new Redis({ url: redisUrl, token: redisToken });
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const result = await checkRateLimit(redis, `rate:test:${ip}`, 3, 10);

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', remaining: result.remaining },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    return NextResponse.json({
      message: 'Rate limit test passed',
      remaining: result.remaining,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const env = getEnv();
    const errorObj = error instanceof Error ? error : new Error(String(error));

    const systemError = new SystemError({
      code: 'PING_001',
      userMessage: 'خطأ في اختبار الـ Ping',
      technicalMessage: errorObj.message,
      category: 'system',
      severity: 'critical',
      shouldAlert: true,
      retryable: false,
      metadata: {
        path: '/api/ping',
        storeId: 'global',
        originalStack: errorObj.stack,
      },
    });

    await sendErrorToTelegram(systemError, env);

    console.error('Ping error:', error);
    return NextResponse.json(
      {
        error: 'Internal error',
        details: errorObj.message,
      },
      { status: 500 }
    );
  }
}