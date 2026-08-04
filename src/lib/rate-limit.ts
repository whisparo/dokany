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
 * ✅ Rate Limiter ذري ومحسّن للعمل على Cloudflare Workers & Upstash Redis
 */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // ✅ Lua Script آمن لمنع Race Conditions وحساب الـ TTL بصرامة
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    
    if not current then
      redis.call('SET', KEYS[1], 1, 'EX', ARGV[1])
      return {1, tonumber(ARGV[1])}
    end
    
    local count = tonumber(current)
    local limit = tonumber(ARGV[2])
    
    if count < limit then
      local newCount = redis.call('INCR', KEYS[1])
      local ttl = redis.call('TTL', KEYS[1])
      if ttl < 0 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
        ttl = tonumber(ARGV[1])
      end
      return {newCount, ttl}
    else
      local ttl = redis.call('TTL', KEYS[1])
      if ttl < 0 then
        ttl = tonumber(ARGV[1])
      end
      return {count, ttl}
    end
  `;

  const rawResult = await redis.eval(
    luaScript,
    [key],
    [windowSeconds.toString(), limit.toString()]
  ) as [number | string, number | string];

  const current = Number(rawResult[0]);
  const ttl = Math.max(1, Number(rawResult[1]));

  const remaining = Math.max(0, limit - current);
  const resetAt = Date.now() + (ttl * 1000);

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
 */
export function buildRateLimitKey(
  namespace: string,
  identifier: string,
  action: string
): string {
  return `ratelimit:${namespace}:${identifier}:${action}`;
}

/**
 * ✅ Helper: Reset Rate Limit يدوياً
 */
export async function resetRateLimit(
  redis: Redis,
  key: string
): Promise<boolean> {
  const deleted = await redis.del(key);
  return deleted > 0;
}

/**
 * ✅ Helper: جلب حالة الـ Rate Limit بدون زيادة العداد (للـ Dashboard)
 */
export async function peekRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const current = await redis.get(key);
  const count = current ? Number(current) : 0;
  const ttlRaw = await redis.ttl(key);
  const ttl = ttlRaw > 0 ? ttlRaw : windowSeconds;
  
  const remaining = Math.max(0, limit - count);
  const resetAt = Date.now() + (ttl * 1000);
  
  return {
    allowed: count <= limit,
    remaining,
    resetAt,
    current: count,
    limit,
  };
}