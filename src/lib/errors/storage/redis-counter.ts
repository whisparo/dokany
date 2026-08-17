// lib/errors/storage/redis-counter.ts
// الإصدار: 1.1.2
// الدور: إدارة عدادات Redis للتحليلات مع سياسة TTL صارمة متوافقة مع الـ Edge

import { Redis } from '@upstash/redis';
import { SystemError } from '../core/types';
import { classifyError } from '../processing/classifier';
import { addBreadcrumb } from '../core/context';

// ═══════════════════════════════════════════════════════════════
// 📦 الأنواع
// ═══════════════════════════════════════════════════════════════

export interface RedisEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  [key: string]: unknown;
}

export interface RedisCounterOptions {
  redis: Redis;
  maxTTLSeconds?: number;
  keyPrefix?: string;
}

export interface CounterUpdateResult {
  count: number;
  isNew: boolean;
  key: string;
}

export interface RecentErrorEntry {
  code: string;
  message: string;
  severity: string;
  timestamp: number;
  storeId?: string;
  correlationId?: string;
}

// ═══════════════════════════════════════════════════════════════
// 🔒 Redis Client Factory
// ═══════════════════════════════════════════════════════════════

export function getRedisClient(env?: RedisEnv): Redis | null {
  if (!env?.UPSTASH_REDIS_REST_URL || !env?.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ═══════════════════════════════════════════════════════════════
// 🧮 ErrorCounter (Main Class)
// ═══════════════════════════════════════════════════════════════

export class ErrorCounter {
  private readonly redis: Redis;
  private readonly maxTTLSeconds: number;
  private readonly keyPrefix: string;

  constructor(options: RedisCounterOptions) {
    this.redis = options.redis;
    this.maxTTLSeconds = options.maxTTLSeconds ?? 24 * 60 * 60; // 24 ساعة
    this.keyPrefix = options.keyPrefix ?? 'error';
  }

  async incrementDailyCounter(
    code: string,
    storeId?: string
  ): Promise<CounterUpdateResult> {
    if (!code || code.trim() === '') {
      throw new SystemError({
        code: 'VAL_001',
        category: 'validation',
        severity: 'warning',
        userMessage: 'كود الخطأ مطلوب.',
        technicalMessage: 'Error code is required for daily counter',
        retryable: false,
        shouldAlert: false,
      });
    }

    const date = new Date().toISOString().split('T')[0];
    const key = `${this.keyPrefix}:${date}:${code}${storeId ? `:${storeId}` : ''}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);
      const results = await pipeline.exec();

      const rawCount = results[0];
      const rawTtl = results[1];
      
      const count = typeof rawCount === 'number' ? rawCount : 0;
      const ttl = typeof rawTtl === 'number' ? rawTtl : -1;
      const isNew = count === 1;

      if (ttl === -1) {
        await this.redis.expire(key, this.maxTTLSeconds);
      }

      addBreadcrumb(`Counter updated: ${key}`, { count, isNew });

      return { count, isNew, key };
    } catch (error) {
      throw classifyError(error, {
        code: 'DB_003',
        metadata: { key, operation: 'incrementDailyCounter' },
      });
    }
  }

  async incrementIncidentCounter(
    code: string,
    storeId: string,
    ttlSeconds: number = 300
  ): Promise<CounterUpdateResult> {
    if (!code || !storeId) {
      throw new SystemError({
        code: 'VAL_001',
        category: 'validation',
        severity: 'warning',
        userMessage: 'كود الخطأ ومعرف المتجر مطلوبان.',
        technicalMessage: 'Code and storeId are required for incident counter',
        retryable: false,
        shouldAlert: false,
      });
    }

    const key = `incident:${code}:${storeId}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);
      const results = await pipeline.exec();

      const rawCount = results[0];
      const rawTtl = results[1];

      const count = typeof rawCount === 'number' ? rawCount : 0;
      const ttl = typeof rawTtl === 'number' ? rawTtl : -1;
      const isNew = count === 1;

      if (ttl === -1) {
        await this.redis.expire(key, Math.min(ttlSeconds, this.maxTTLSeconds));
      }

      return { count, isNew, key };
    } catch (error) {
      throw classifyError(error, {
        code: 'DB_003',
        metadata: { key, operation: 'incrementIncidentCounter' },
      });
    }
  }

  async incrementGeneric(
    key: string,
    ttlSeconds?: number
  ): Promise<CounterUpdateResult> {
    if (!key || key.trim() === '') {
      throw new SystemError({
        code: 'VAL_001',
        category: 'validation',
        severity: 'warning',
        userMessage: 'المفتاح مطلوب.',
        technicalMessage: 'Key is required for generic counter',
        retryable: false,
        shouldAlert: false,
      });
    }

    const fullKey = `${this.keyPrefix}:${key}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(fullKey);
      pipeline.ttl(fullKey);
      const results = await pipeline.exec();

      const rawCount = results[0];
      const rawTtl = results[1];

      const count = typeof rawCount === 'number' ? rawCount : 0;
      const ttl = typeof rawTtl === 'number' ? rawTtl : -1;
      const isNew = count === 1;

      if (isNew && ttlSeconds !== undefined) {
        await this.redis.expire(fullKey, Math.min(ttlSeconds, this.maxTTLSeconds));
      }

      return { count, isNew, key: fullKey };
    } catch (error) {
      throw classifyError(error, {
        code: 'DB_003',
        metadata: { key: fullKey, operation: 'incrementGeneric' },
      });
    }
  }

  async getCounter(key: string): Promise<number | null> {
    try {
      const value = await this.redis.get(key);
      if (value === null || value === undefined) return null;
      
      const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);
      return isNaN(numValue) ? null : numValue;
    } catch (error) {
      console.warn(`[RedisCounter] Failed to get ${key}:`, error);
      return null;
    }
  }

  async getCounters(keys: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (keys.length === 0) return result;

    try {
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      const values = await pipeline.exec();

      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== null && value !== undefined) {
          const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);
          if (!isNaN(numValue)) {
            result.set(key, numValue);
          }
        }
      });

      return result;
    } catch (error) {
      console.warn(`[RedisCounter] Failed to get counters:`, error);
      return result;
    }
  }

  async resetCounter(key: string): Promise<boolean> {
    try {
      const deleted = await this.redis.del(key);
      return deleted > 0;
    } catch (error) {
      console.warn(`[RedisCounter] Failed to reset ${key}:`, error);
      return false;
    }
  }

  async addRecentError(
    entry: RecentErrorEntry,
    maxEntries: number = 100
  ): Promise<void> {
    const key = createRecentErrorsKey();

    try {
      const pipeline = this.redis.pipeline();
      pipeline.lpush(key, JSON.stringify(entry));
      pipeline.ltrim(key, 0, maxEntries - 1);
      pipeline.expire(key, 7 * 24 * 60 * 60);
      await pipeline.exec();
    } catch (error) {
      console.warn(`[RedisCounter] Failed to add recent error:`, error);
    }
  }

  async getRecentErrors(limit: number = 100): Promise<RecentErrorEntry[]> {
    const key = createRecentErrorsKey();

    try {
      const rawErrors = await this.redis.lrange<string>(key, 0, limit - 1);
      
      return rawErrors
        .map((raw) => {
          try {
            return (typeof raw === 'string' ? JSON.parse(raw) : raw) as RecentErrorEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is RecentErrorEntry => entry !== null);
    } catch (error) {
      console.warn(`[RedisCounter] Failed to get recent errors:`, error);
      return [];
    }
  }

  validateTTL(ttlSeconds: number): number {
    return Math.min(Math.max(ttlSeconds, 1), this.maxTTLSeconds);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭 Factory Functions
// ═══════════════════════════════════════════════════════════════

export function createErrorCounterFromEnv(env?: RedisEnv): ErrorCounter | null {
  const redis = getRedisClient(env);
  if (!redis) return null;

  return new ErrorCounter({
    redis,
    maxTTLSeconds: 24 * 60 * 60,
    keyPrefix: 'error',
  });
}

// ═══════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════

export function createDailyCounterKey(date: string, code: string, storeId?: string): string {
  return `error:${date}:${code}${storeId ? `:${storeId}` : ''}`;
}

export function createIncidentKey(code: string, storeId: string): string {
  return `incident:${code}:${storeId}`;
}

export function createRecentErrorsKey(): string {
  return 'error:recent';
}

export function createErrorRateKey(minutes: number): string {
  return `error:rate:${minutes}m`;
}