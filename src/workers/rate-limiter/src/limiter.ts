//src/workers/rate-limiter/src/limiter.ts

import { Redis } from '@upstash/redis';
import { STRATEGIES, type Strategy } from './strategies';

export interface RateLimitRequest {
  action: string;        // 'login', 'checkout', 'api_call', 'storefront:read'
  ip: string;
  userId?: string;       // لو مسجل دخول
  storeId?: string;      // لو بيخص متجر معين
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;        // Unix timestamp
  retryAfter?: number;    // seconds
  layer: 'global' | 'ip' | 'user' | 'store';
}

export interface EnvBindings {
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

// 🧠 1. In-Memory Block Cache
// ذاكرة محلية داخل الـ Worker لرفض الهجمات فوراً ومنع استنزاف Upstash Quota
const inMemoryBlocklist = new Map<string, number>();

function cleanMemoryCache() {
  const now = Date.now();
  for (const [key, expiresAt] of inMemoryBlocklist.entries()) {
    if (now > expiresAt) {
      inMemoryBlocklist.delete(key);
    }
  }
}

// 📜 2. Lua Script أسرع خفيف بدون تخزين UUIDs (توفير 90% من الذاكرة والـ Redis Operations)
const SLIDING_COUNTER_LUA = `
  local key = KEYS[1]
  local window = tonumber(ARGV[1])
  local limit = tonumber(ARGV[2])

  local current = redis.call('GET', key)

  if not current then
      redis.call('SET', key, 1, 'EX', window)
      return {1, limit - 1, window}
  end

  local count = tonumber(current)

  if count < limit then
      local newCount = redis.call('INCR', key)
      local ttl = redis.call('TTL', key)
      if ttl < 0 then
          redis.call('EXPIRE', key, window)
          ttl = window
      end
      return {newCount, limit - newCount, ttl}
  else
      local ttl = redis.call('TTL', key)
      if ttl < 0 then ttl = window end
      return {count, 0, ttl}
  end
`;

// 🎯 الدالة الأساسية المعدلة والمحمية
export async function checkRateLimit(
  req: RateLimitRequest,
  env: EnvBindings
): Promise<RateLimitResult> {
  const strategy: Strategy = STRATEGIES[req.action] || STRATEGIES.default;
  const now = Date.now();

  // A. فحص الـ In-Memory Cache أولاً (إذا كان الهدف محظوراً سابقاً، ارفض فوراً)
  cleanMemoryCache();
  const blockKeys = [
    `global`,
    `ip:${req.ip}:${req.action}`,
    req.userId ? `user:${req.userId}:${req.action}` : null,
    req.storeId ? `store:${req.storeId}:${req.action}` : null,
  ].filter(Boolean) as string[];

  for (const bKey of blockKeys) {
    const blockedUntil = inMemoryBlocklist.get(bKey);
    if (blockedUntil && now < blockedUntil) {
      const retryAfter = Math.ceil((blockedUntil - now) / 1000);
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetAt: blockedUntil,
        retryAfter,
        layer: bKey === 'global' ? 'global' : bKey.startsWith('ip') ? 'ip' : bKey.startsWith('user') ? 'user' : 'store',
      };
    }
  }

  // B. إنشاء العميل بمتغيرات البيئة الممررة ديناميكياً من Cloudflare Worker
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  const windowSeconds = Math.ceil((strategy.windowMs || 60000) / 1000);

  // الطبقة 1: Global (حماية شاملة للنظام)
  if (strategy.globalLimit) {
    const globalRes = await checkLayer(redis, `rl:global`, strategy.globalLimit, windowSeconds);
    if (!globalRes.allowed) {
      inMemoryBlocklist.set(`global`, globalRes.resetAt);
      return { ...globalRes, layer: 'global' };
    }
  }

  // الطبقة 2: IP
  const ipKey = `rl:ip:${req.ip}:${req.action}`;
  const ipResult = await checkLayer(redis, ipKey, strategy.perIp, windowSeconds);
  if (!ipResult.allowed) {
    inMemoryBlocklist.set(`ip:${req.ip}:${req.action}`, ipResult.resetAt);
    return { ...ipResult, layer: 'ip' };
  }

  // الطبقة 3: User (لو مسجل دخول)
  if (req.userId && strategy.perUser) {
    const userKey = `rl:user:${req.userId}:${req.action}`;
    const userResult = await checkLayer(redis, userKey, strategy.perUser, windowSeconds);
    if (!userResult.allowed) {
      inMemoryBlocklist.set(`user:${req.userId}:${req.action}`, userResult.resetAt);
      return { ...userResult, layer: 'user' };
    }
  }

  // الطبقة 4: Store (لو بيخص متجر)
  if (req.storeId && strategy.perStore) {
    const storeKey = `rl:store:${req.storeId}:${req.action}`;
    const storeResult = await checkLayer(redis, storeKey, strategy.perStore, windowSeconds);
    if (!storeResult.allowed) {
      inMemoryBlocklist.set(`store:${req.storeId}:${req.action}`, storeResult.resetAt);
      return { ...storeResult, layer: 'store' };
    }
  }

  return { ...ipResult, layer: 'ip' };
}

// 🔧 دالة مساعدة لتنفيذ الـ Lua Script
async function checkLayer(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<Omit<RateLimitResult, 'layer'>> {
  const raw = (await redis.eval(
    SLIDING_COUNTER_LUA,
    [key],
    [windowSeconds.toString(), limit.toString()]
  )) as [number, number, number];

  const [current, remaining, ttl] = raw;
  const allowed = current <= limit;
  const resetAt = Date.now() + ttl * 1000;

  return {
    allowed,
    limit,
    remaining: Math.max(0, remaining),
    resetAt,
    retryAfter: allowed ? undefined : ttl,
  };
}