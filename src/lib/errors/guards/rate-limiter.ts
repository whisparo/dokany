// lib/errors/guards/rate-limiter.ts
// الإصدار: 1.0.2
// الدور: حماية الخدمات الخارجية من تجاوز الحدود المسموحة (Rate Limiting)
// المبدأ: Sliding Window Log باستخدام Redis ZSET لتوزيع الحالة عبر الـ Workers

import { getRedisClient, type RedisEnv } from '../storage/redis-counter';
import { addBreadcrumb } from '../core/context';
import type { Redis } from '@upstash/redis';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * تكوين حارس المعدل
 */
export interface RateLimiterConfig {
  /** اسم الخدمة (مثل: 'telegram', 'qstash') */
  serviceName: string;

  /** الحد الأقصى للطلبات في النافذة (افتراضي: 30) */
  limit?: number;

  /** مدة النافذة بالثواني (افتراضي: 1) */
  windowSeconds?: number;

  /** مفتاح Redis الأساسي (افتراضي: ratelimit:{serviceName}) */
  redisKeyPrefix?: string;

  /** هل يجب السماح عند فشل Redis؟ (افتراضي: true - Fail-Open) */
  allowOnRedisFailure?: boolean;

  /** مهلة الاتصال بـ Redis بالمللي ثانية (افتراضي: 500) */
  redisTimeoutMs?: number;
}

/**
 * نتيجة التحقق من المعدل
 */
export interface RateLimitResult {
  /** هل الطلب مسموح؟ */
  allowed: boolean;
  /** الحد الأقصى للطلبات */
  limit: number;
  /** عدد الطلبات المتبقية في النافذة الحالية */
  remaining: number;
  /** الوقت المتبقي حتى إعادة الضبط (بالثواني) */
  resetAfterSeconds: number;
  /** الوقت الذي ستُعاد فيه الضبط (Timestamp) */
  resetAt: number;
  /** هل تم استخدام Redis بنجاح؟ */
  redisUsed: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 🔒  حارس المعدل الرئيسي
// ═══════════════════════════════════════════════════════════════

export class RateLimiter {
  private readonly config: Required<RateLimiterConfig>;
  private readonly redisKey: string;

  constructor(config: RateLimiterConfig) {
    this.config = {
      limit: 30,
      windowSeconds: 1,
      redisKeyPrefix: 'ratelimit',
      allowOnRedisFailure: true,
      redisTimeoutMs: 500,
      ...config,
    };

    this.redisKey = `${this.config.redisKeyPrefix}:${this.config.serviceName}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤  الطرق العامة (Public Methods)
  // ═══════════════════════════════════════════════════════════════

  /**
   * التحقق من السماح بالطلب، وتسجيله إن كان مسموحاً
   */
  async checkAndIncrement(
    env?: RedisEnv,
    identifier?: string
  ): Promise<RateLimitResult> {
    const key = identifier
      ? `${this.redisKey}:${identifier}`
      : this.redisKey;

    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;

    try {
      const redis = getRedisClient(env);
      if (!redis) {
        return this.fallbackResult('Redis not available');
      }

      // 1️⃣ استخدام Lua Script للعملية الذرية (Sliding Window Log)
      const result = await this.executeAtomicScript(redis, key, now, windowMs);

      const count = typeof result === 'number' ? result : 0;
      const allowed = count <= this.config.limit;

      // 2️⃣ حساب القيم المتبقية
      const remaining = Math.max(0, this.config.limit - count);
      const resetAt = now + windowMs;
      const resetAfterSeconds = Math.ceil(windowMs / 1000);

      // 3️⃣ إضافة Breadcrumb
      if (!allowed) {
        addBreadcrumb(`Rate limit exceeded for ${this.config.serviceName}`, {
          service: this.config.serviceName,
          limit: this.config.limit,
          count,
          identifier,
        });
      }

      return {
        allowed,
        limit: this.config.limit,
        remaining: allowed ? remaining : 0,
        resetAfterSeconds,
        resetAt,
        redisUsed: true,
      };
    } catch (error) {
      // فشل الاتصال بـ Redis → استخدام Fail-Open أو منع الطلب
      console.warn(
        `[RateLimiter] Redis failed for ${this.config.serviceName}:`,
        error
      );

      if (this.config.allowOnRedisFailure) {
        return this.fallbackResult('Redis error (fail-open)');
      }

      // Fail-Close: منع الطلب
      return {
        allowed: false,
        limit: this.config.limit,
        remaining: 0,
        resetAfterSeconds: this.config.windowSeconds,
        resetAt: Date.now() + this.config.windowSeconds * 1000,
        redisUsed: false,
      };
    }
  }

  /**
   * التحقق من السماح بدون تسجيل (للقراءة فقط)
   */
  async checkOnly(env?: RedisEnv, identifier?: string): Promise<RateLimitResult> {
    const key = identifier
      ? `${this.redisKey}:${identifier}`
      : this.redisKey;

    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
      const redis = getRedisClient(env);
      if (!redis) {
        return this.fallbackResult('Redis not available');
      }

      // حذف الطلبات القديمة وعد الباقي
      await this.withTimeout(redis.zremrangebyscore(key, 0, windowStart));
      const count = await this.withTimeout(redis.zcard(key));

      const allowed = count < this.config.limit;
      const remaining = Math.max(0, this.config.limit - count);
      const resetAt = now + windowMs;
      const resetAfterSeconds = Math.ceil(windowMs / 1000);

      return {
        allowed,
        limit: this.config.limit,
        remaining,
        resetAfterSeconds,
        resetAt,
        redisUsed: true,
      };
    } catch (error) {
      if (this.config.allowOnRedisFailure) {
        return this.fallbackResult('Redis error (fail-open)');
      }

      return {
        allowed: false,
        limit: this.config.limit,
        remaining: 0,
        resetAfterSeconds: this.config.windowSeconds,
        resetAt: Date.now() + this.config.windowSeconds * 1000,
        redisUsed: false,
      };
    }
  }

  /**
   * إعادة ضبط العداد (يدوياً)
   */
  async reset(env?: RedisEnv, identifier?: string): Promise<void> {
    const key = identifier
      ? `${this.redisKey}:${identifier}`
      : this.redisKey;

    try {
      const redis = getRedisClient(env);
      if (!redis) return;

      await this.withTimeout(redis.del(key));
      addBreadcrumb(`Rate limiter reset for ${this.config.serviceName}`, {
        service: this.config.serviceName,
        identifier,
      });
    } catch (error) {
      console.warn(
        `[RateLimiter] Failed to reset for ${this.config.serviceName}:`,
        error
      );
    }
  }

  /**
   * الحصول على العدد الحالي للطلبات في النافذة
   */
  async getCurrentCount(env?: RedisEnv, identifier?: string): Promise<number> {
    const key = identifier
      ? `${this.redisKey}:${identifier}`
      : this.redisKey;

    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
      const redis = getRedisClient(env);
      if (!redis) return 0;

      // حذف الطلبات القديمة وعد الباقي
      await this.withTimeout(redis.zremrangebyscore(key, 0, windowStart));
      return await this.withTimeout(redis.zcard(key));
    } catch (error) {
      console.warn(
        `[RateLimiter] Failed to get count for ${this.config.serviceName}:`,
        error
      );
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧩  الدوال الداخلية (Private Helpers)
  // ═══════════════════════════════════════════════════════════════

  /**
   * تغليف استدعاءات Redis بمهلة زمنية (Timeout) لتفادي تعليق الـ Worker
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Redis operation timed out after ${this.config.redisTimeoutMs}ms`));
      }, this.config.redisTimeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * تنفيذ العملية الذرية باستخدام Lua Script
   * - يضمن عدم وجود سباقات (Race Conditions)
   * - يحذف الطلبات القديمة تلقائياً
   * - يضيف الطلب الجديد ويعيد العدد
   */
  private async executeAtomicScript(
    redis: Redis,
    key: string,
    now: number,
    windowMs: number
  ): Promise<number> {
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local maxCount = tonumber(ARGV[3])
      local windowSeconds = tonumber(ARGV[4])

      -- حذف الطلبات القديمة
      redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

      -- الحصول على العدد الحالي
      local count = redis.call('ZCARD', key)

      -- إذا لم يتجاوز الحد، أضف الطلب الجديد
      if count < maxCount then
        redis.call('ZADD', key, now, now)
        -- تعيين TTL للنافذة بالشكل الصحيح
        redis.call('EXPIRE', key, windowSeconds)
        return count + 1
      end

      return count
    `;

    const windowStart = now - windowMs;
    // إضافة احتياطي ثانية واحدة لضمان بقاء الـ Key طوال النافذة
    const expireSeconds = Math.ceil(this.config.windowSeconds) + 1;

    const result = await this.withTimeout(
      redis.eval(
        script,
        [key],
        [
          String(now),
          String(windowStart),
          String(this.config.limit),
          String(expireSeconds),
        ]
      )
    );

    return typeof result === 'number' ? result : 0;
  }

  /**
   * إنشاء نتيجة Fallback (عند فشل Redis)
   */
  private fallbackResult(_reason: string): RateLimitResult {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;

    return {
      allowed: this.config.allowOnRedisFailure,
      limit: this.config.limit,
      remaining: this.config.allowOnRedisFailure ? this.config.limit : 0,
      resetAfterSeconds: this.config.windowSeconds,
      resetAt: now + windowMs,
      redisUsed: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭  المصنع (Factory)
// ═══════════════════════════════════════════════════════════════

/**
 * خريطة لحارس المعدل (Singleton لكل خدمة)
 */
const rateLimiterMap = new Map<string, RateLimiter>();

/**
 * الحصول على حارس معدل لخدمة معينة (Singleton)
 */
export function getRateLimiter(
  serviceName: string,
  config?: Partial<RateLimiterConfig>
): RateLimiter {
  const key = serviceName;
  if (!rateLimiterMap.has(key)) {
    const fullConfig: RateLimiterConfig = {
      serviceName,
      limit: config?.limit ?? 30,
      windowSeconds: config?.windowSeconds ?? 1,
      redisKeyPrefix: config?.redisKeyPrefix ?? 'ratelimit',
      allowOnRedisFailure: config?.allowOnRedisFailure ?? true,
      redisTimeoutMs: config?.redisTimeoutMs ?? 500,
    };
    rateLimiterMap.set(key, new RateLimiter(fullConfig));
  }
  return rateLimiterMap.get(key)!;
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام السريع
// ═══════════════════════════════════════════════════════════════

/**
 * التحقق من المعدل وتسجيل الطلب (دالة مساعدة)
 */
export async function checkRateLimit(
  env: RedisEnv | undefined,
  serviceName: string,
  identifier?: string,
  config?: Partial<RateLimiterConfig>
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(serviceName, config);
  return limiter.checkAndIncrement(env, identifier);
}

/**
 * التحقق من المعدل بدون تسجيل (دالة مساعدة)
 */
export async function peekRateLimit(
  env: RedisEnv | undefined,
  serviceName: string,
  identifier?: string,
  config?: Partial<RateLimiterConfig>
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(serviceName, config);
  return limiter.checkOnly(env, identifier);
}

/**
 * إعادة ضبط عداد الخدمة (دالة مساعدة)
 */
export async function resetRateLimit(
  env: RedisEnv | undefined,
  serviceName: string,
  identifier?: string
): Promise<void> {
  const limiter = getRateLimiter(serviceName);
  return limiter.reset(env, identifier);
}

/**
 * تنفيذ عملية مع حماية المعدل
 */
export async function withRateLimit<T>(
  env: RedisEnv | undefined,
  serviceName: string,
  fn: () => Promise<T>,
  config?: Partial<RateLimiterConfig>,
  identifier?: string
): Promise<T> {
  const limiter = getRateLimiter(serviceName, config);

  // 1️⃣ التحقق من المعدل
  const result = await limiter.checkAndIncrement(env, identifier);

  if (!result.allowed) {
    throw new Error(
      `Rate limit exceeded for service '${serviceName}'. ` +
      `Limit: ${result.limit}, Retry after ${result.resetAfterSeconds} seconds.`
    );
  }

  // 2️⃣ تنفيذ الدالة
  try {
    return await fn();
  } catch (error) {
    throw error;
  }
}

/**
 * إنشاء مُحول (Middleware) لـ Hono مع Rate Limiting
 */
export function rateLimitMiddleware(
  serviceName: string,
  config?: Partial<RateLimiterConfig>
) {
  return async (
    c: {
      env: RedisEnv;
      req: { header: (name: string) => string | undefined };
      header: (name: string, value: string) => void;
      json: (body: unknown, status: number) => unknown;
    },
    next: () => Promise<void>
  ) => {
    const env = c.env;
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const identifier = `${serviceName}:${ip}`;

    const limiter = getRateLimiter(serviceName, config);
    const result = await limiter.checkAndIncrement(env, identifier);

    // إضافة Headers للمعدل
    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      c.header('Retry-After', String(result.resetAfterSeconds));
      return c.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Retry after ${result.resetAfterSeconds} seconds.`,
          retryAfter: result.resetAfterSeconds,
        },
        429
      );
    }

    await next();
  };
}