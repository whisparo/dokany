// src/lib/rate-limit-client.ts

import { headers } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export interface CheckOptions {
  action: string;
  userId?: string;
  storeId?: string;
  ip?: string;
}

export interface CheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  layer?: string;
  degraded?: boolean;
}

/**
 * 🛠️ Helper لاستخراج أسرار البيئة ديناميكياً بين Cloudflare Workers و Node
 */
async function getRateLimiterEnv(): Promise<{ url?: string; token?: string }> {
  try {
    const context = await getCloudflareContext();
    const cfEnv = context.env as unknown as Env & {
      RATE_LIMITER_URL?: string;
      RATE_LIMITER_TOKEN?: string;
    };

    return {
      url: cfEnv?.RATE_LIMITER_URL || process.env.RATE_LIMITER_URL,
      token: cfEnv?.RATE_LIMITER_TOKEN || process.env.RATE_LIMITER_TOKEN,
    };
  } catch {
    return {
      url: process.env.RATE_LIMITER_URL,
      token: process.env.RATE_LIMITER_TOKEN,
    };
  }
}

export async function checkRateLimit(options: CheckOptions): Promise<CheckResult> {
  // 🟢 جلب المتغيرات ديناميكياً لتتوافق مع Cloudflare Context
  const { url: rateLimiterUrl, token: rateLimiterToken } = await getRateLimiterEnv();

  // إذا لم يتم ضبط المتغيرات، اسمح بالطلب بدلاً من إيقاف الموقع (Fail-Open)
  if (!rateLimiterUrl || !rateLimiterToken) {
    console.warn('⚠️ Rate limiter env vars missing, skipping check.');
    return { allowed: true, degraded: true, limit: 0, remaining: 0, resetAt: 0 };
  }

  try {
    const headersList = await headers();
    
    // استخراج أول IP صحيح
    const rawIp = options.ip
      || headersList.get('cf-connecting-ip')
      || headersList.get('x-forwarded-for')?.split(',')[0].trim()
      || '127.0.0.1';

    const response = await fetch(`${rateLimiterUrl}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RL-Token': rateLimiterToken,
      },
      body: JSON.stringify({ ...options, ip: rawIp }),
      // timeout بعد ثانيتين كي لا يتعطل الـ Server Action
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return await response.json();
      }
      // في حالة وجود خطأ سيرفر 500: Fail-Open
      return { allowed: true, degraded: true, limit: 0, remaining: 0, resetAt: 0 };
    }

    return await response.json();
  } catch (error) {
    // في حالة انقطاع الشبكة أو الـ Timeout: Fail-Open
    console.error('Rate limiter call failed:', error);
    return { allowed: true, degraded: true, limit: 0, remaining: 0, resetAt: 0 };
  }
}

/**
 * Helper للـ Server Actions لمنع تنفيذ الأكشن عند تجاوز الحد
 */
export async function enforceRateLimit(options: CheckOptions): Promise<void> {
  const result = await checkRateLimit(options);

  if (!result.allowed) {
    throw new Error(
      JSON.stringify({
        code: 'RATE_LIMITED',
        retryAfter: result.retryAfter || 60,
        layer: result.layer || 'unknown',
      })
    );
  }
}

/**
 * Decorator اختياري للاستخدام مع الميثودز داخل الكلاسات
 */
export function withRateLimit(action: string) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      await enforceRateLimit({ action });
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}