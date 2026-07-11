// src/lib/rate-limit.ts

import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  /** هل الطلب مسموح؟ */
  allowed: boolean;
  
  /** عدد المحاولات المتبقية */
  remaining: number;
  
  /** متى ينتهي الـ window (Unix timestamp بالمللي ثانية) */
  resetAt: number;
  
  /** العدد الحالي للمحاولات */
  current: number;
  
  /** الحد الأقصى */
  limit: number;
}

/**
 * ✅ Rate Limiter محسّن مع:
 * - Bounded Counter (منع الـ overflow)
 * - Reset Time (لـ Retry-After header)
 * - Namespace Support
 */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // ✅ Lua Script محسّن:
  // 1. يمنع الـ INCR بعد الـ limit (Bounded Counter)
  // 2. يرجع الـ TTL للـ key
  // 3. ذري 100%
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    
    if current == false then
      -- أول محاولة: ابدأ من 1
      redis.call('SET', KEYS[1], 1, 'EX', ARGV[1])
      return {1, ARGV[1]}
    end
    
    local count = tonumber(current)
    
    if count < tonumber(ARGV[2]) then
      -- لسه في مساحة: زود العداد
      local newCount = redis.call('INCR', KEYS[1])
      local ttl = redis.call('TTL', KEYS[1])
      return {newCount, ttl}
    else
      -- وصلت للحد: ارجع القيم الحالية
      local ttl = redis.call('TTL', KEYS[1])
      return {count, ttl}
    end
  `;

  const result = await redis.eval(
    luaScript,
    [key],
    [windowSeconds.toString(), limit.toString()]
  ) as [number, number];

  const [current, ttl] = result;
  const remaining = Math.max(0, limit - current);
  const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000);

  return {
    allowed: current <= limit,
    remaining,
    resetAt,
    current,
    limit,
  };
}

/**
 * ✅ Helper: بناء key مع namespace
 * 
 * @example
 * buildRateLimitKey('merchant', 'merchant_123', 'api')
 * // → "ratelimit:merchant:merchant_123:api"
 */
export function buildRateLimitKey(
  namespace: string,
  identifier: string,
  action: string
): string {
  return `ratelimit:${namespace}:${identifier}:${action}`;
}

/**
 * ✅ Helper: فحص Rate Limit مع auto-retry
 * مفيد للـ operations اللي ممكن تستنى
 */
export async function checkRateLimitWithRetry(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
  maxRetries: number = 3
): Promise<RateLimitResult & { retries: number }> {
  let retries = 0;
  
  while (retries < maxRetries) {
    const result = await checkRateLimit(redis, key, limit, windowSeconds);
    
    if (result.allowed) {
      return { ...result, retries };
    }
    
    // استنى حتى الـ reset
    const waitTime = result.resetAt - Date.now();
    if (waitTime > 0 && waitTime < 5000) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      retries++;
    } else {
      return { ...result, retries };
    }
  }
  
  const finalResult = await checkRateLimit(redis, key, limit, windowSeconds);
  return { ...finalResult, retries };
}

/**
 * ✅ Helper: Reset Rate Limit يدوياً (للأدمن)
 */
export async function resetRateLimit(
  redis: Redis,
  key: string
): Promise<boolean> {
  const deleted = await redis.del(key);
  return deleted > 0;
}

/**
 * ✅ Helper: جلب حالة الـ Rate Limit بدون زيادة العداد
 * مفيد للـ Dashboard والـ Monitoring
 */
export async function peekRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const current = await redis.get(key);
  const count = current ? Number(current) : 0;
  const ttl = await redis.ttl(key);
  
  const remaining = Math.max(0, limit - count);
  const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000);
  
  return {
    allowed: count <= limit,
    remaining,
    resetAt,
    current: count,
    limit,
  };
}