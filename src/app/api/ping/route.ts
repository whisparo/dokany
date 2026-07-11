// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis/cloudflare';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    // ✅ Redis.fromEnv() يقرأ UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN تلقائياً
    const redis = Redis.fromEnv();
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