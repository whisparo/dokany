// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis/cloudflare';
import { checkRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/env'; // ✅ استورد الـ interface بتاعك هنا (عدل المسار حسب الفولدر عندك)

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    // ✅ الحل السنيور: إجبار الـ env يتطابق مع الـ Env الموحد بتاعك
    const env = getRequestContext().env as unknown as Env;

    // دلوقتي الـ TypeScript هيقرأ المتغيرات دي وهو مبتسم ومن غير خطوط حمراء
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

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
    console.error('Ping error:', error);
    return NextResponse.json(
      {
        error: 'Internal error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}