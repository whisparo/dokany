// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { checkRateLimit } from '@/lib/rate-limit';

// ✅ أضف هذا السطر
export const runtime = 'edge';

function getRedis() {
  return new Redis({
    url: process.env.REDIS_URL!,
    token: process.env.REDIS_TOKEN!,
  });
}

export async function GET(request: NextRequest) {
  const redis = getRedis();
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
}