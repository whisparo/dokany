// lib/errors/storage/queue-manager.ts
// الإصدار: 1.1.3
// الدور: إدارة قائمة انتظار Redis (error_queue) لتجنب LIST Operations في B2
// المبدأ: LPUSH (دفع) + RPOP (سحب) + TTL صارم ≤ 7 أيام

import { Redis } from '@upstash/redis';
import { addBreadcrumb } from '../core/context';
import type { RedisEnv } from './redis-counter';
import { getRedisClient } from './redis-counter';

// ═══════════════════════════════════════════════════════════════
// 📦 الأنواع
// ═══════════════════════════════════════════════════════════════

export type QueueEnv = RedisEnv;

export interface QueueOptions {
  /** اسم قائمة الانتظار (افتراضي: error_queue) */
  queueKey?: string;
  /** مدة انتهاء الصلاحية بالثواني (افتراضي: 7 أيام) */
  ttlSeconds?: number;
  /** الحد الأقصى لطول القائمة (افتراضي: 100,000) */
  maxLength?: number;
  /** Redis client (يُمرر مباشرة لتجنب استدعاء getRedisClient كل مرة) */
  redis?: Redis | null;
}

export interface QueueStats {
  length: number;
  isEmpty: boolean;
  isOverLimit: boolean;
  usagePercent: number;
}

// ═══════════════════════════════════════════════════════════════
// 🏗️ QueueManager (Main Class)
// ═══════════════════════════════════════════════════════════════

export class QueueManager {
  private readonly queueKey: string;
  private readonly ttlSeconds: number;
  private readonly maxLength: number;
  private readonly redis: Redis | null;

  constructor(options: QueueOptions = {}) {
    this.queueKey = options.queueKey ?? 'error_queue';
    this.ttlSeconds = options.ttlSeconds ?? 7 * 24 * 60 * 60; // 7 أيام
    this.maxLength = options.maxLength ?? 100000;
    this.redis = options.redis ?? null;
  }

  // ═══════════════════════════════════════════════════════════════
  // ➕ Push Operations
  // ═══════════════════════════════════════════════════════════════

  async push(key: string): Promise<boolean> {
    if (!this.redis) {
      console.warn('[QueueManager] Redis not available, skipping push');
      return false;
    }

    if (!key || key.trim() === '') {
      console.warn('[QueueManager] Empty key provided, skipping push');
      return false;
    }

    try {
      const pipeline = this.redis.pipeline();
      pipeline.lpush(this.queueKey, key);
      pipeline.expire(this.queueKey, this.ttlSeconds);
      pipeline.llen(this.queueKey);
      const results = await pipeline.exec();

      const length = typeof results[2] === 'number' ? results[2] : 0;

      if (length > this.maxLength) {
        await this.redis.ltrim(this.queueKey, 0, this.maxLength - 1);
        console.warn(`[QueueManager] Trimmed queue to ${this.maxLength} items`);
      }

      addBreadcrumb(`Queue push: ${key}`, { 
        queueKey: this.queueKey,
        queueLength: length,
      });
      return true;
    } catch (error) {
      console.error('[QueueManager] Push failed:', error);
      return false;
    }
  }

  async pushBatch(keys: string[]): Promise<number> {
    if (!this.redis) {
      console.warn('[QueueManager] Redis not available, skipping pushBatch');
      return 0;
    }

    if (keys.length === 0) return 0;

    try {
      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        if (key && key.trim() !== '') {
          pipeline.lpush(this.queueKey, key);
        }
      }
      
      pipeline.expire(this.queueKey, this.ttlSeconds);
      pipeline.llen(this.queueKey);
      
      const results = await pipeline.exec();
      const rawLength = results[results.length - 1];
      const length = typeof rawLength === 'number' ? rawLength : 0;

      if (length > this.maxLength) {
        await this.redis.ltrim(this.queueKey, 0, this.maxLength - 1);
      }

      addBreadcrumb(`Queue pushBatch: ${keys.length} items`, {
        queueKey: this.queueKey,
        queueLength: length,
      });

      return keys.length;
    } catch (error) {
      console.error('[QueueManager] PushBatch failed:', error);
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ➖ Pop Operations
  // ═══════════════════════════════════════════════════════════════

  async pop(): Promise<string | null> {
    if (!this.redis) {
      console.warn('[QueueManager] Redis not available, skipping pop');
      return null;
    }

    try {
      const key = await this.redis.rpop<string>(this.queueKey);
      if (key) {
        addBreadcrumb(`Queue pop: ${key}`, { queueKey: this.queueKey });
      }
      return key;
    } catch (error) {
      console.error('[QueueManager] Pop failed:', error);
      return null;
    }
  }

  async popBatch(count: number): Promise<string[]> {
    if (!this.redis) {
      console.warn('[QueueManager] Redis not available, skipping popBatch');
      return [];
    }

    if (count <= 0) return [];

    try {
      const keys: string[] = [];
      const pipeline = this.redis.pipeline();
      const actualCount = Math.min(count, 100);
      
      for (let i = 0; i < actualCount; i++) {
        pipeline.rpop(this.queueKey);
      }
      
      const results = await pipeline.exec();
      
      for (const result of results) {
        if (typeof result === 'string') {
          keys.push(result);
        }
      }

      if (keys.length > 0) {
        addBreadcrumb(`Queue popBatch: ${keys.length} items`, { 
          queueKey: this.queueKey,
          requested: count,
        });
      }

      return keys;
    } catch (error) {
      console.error('[QueueManager] PopBatch failed:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 Read & Management
  // ═══════════════════════════════════════════════════════════════

  async length(): Promise<number> {
    if (!this.redis) return 0;
    
    try {
      const len = await this.redis.llen(this.queueKey);
      return typeof len === 'number' ? len : 0;
    } catch (error) {
      console.error('[QueueManager] Length check failed:', error);
      return 0;
    }
  }

  async getStats(): Promise<QueueStats> {
    const length = await this.length();
    const usagePercent = this.maxLength > 0 
      ? Math.round((length / this.maxLength) * 100)
      : 0;

    return {
      length,
      isEmpty: length === 0,
      isOverLimit: length > this.maxLength,
      usagePercent,
    };
  }

  async peek(start: number = 0, stop: number = 10): Promise<string[]> {
    if (!this.redis) return [];
    
    const safeStop = Math.min(stop, start + 99);
    
    try {
      const keys = await this.redis.lrange<string>(this.queueKey, start, safeStop);
      return keys ?? [];
    } catch (error) {
      console.error('[QueueManager] Peek failed:', error);
      return [];
    }
  }

  async clear(): Promise<boolean> {
    if (!this.redis) return false;
    
    try {
      const deleted = await this.redis.del(this.queueKey);
      addBreadcrumb(`Queue cleared: ${this.queueKey}`, { 
        queueKey: this.queueKey,
        deleted,
      });
      return deleted > 0;
    } catch (error) {
      console.error('[QueueManager] Clear failed:', error);
      return false;
    }
  }

  async refreshTTL(): Promise<boolean> {
    if (!this.redis) return false;
    
    try {
      const result = await this.redis.expire(this.queueKey, this.ttlSeconds);
      return result === 1;
    } catch (error) {
      console.error('[QueueManager] Refresh TTL failed:', error);
      return false;
    }
  }

  getQueueKey(): string {
    return this.queueKey;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭 Factory Functions
// ═══════════════════════════════════════════════════════════════

export function createQueueManager(env?: RedisEnv, options?: Omit<QueueOptions, 'redis'>): QueueManager {
  const redis = getRedisClient(env);
  return new QueueManager({
    ...options,
    redis,
  });
}

// ═══════════════════════════════════════════════════════════════
// 🛠️ Convenience Functions
// ═══════════════════════════════════════════════════════════════

export async function enqueueErrorKey(env: RedisEnv | undefined, key: string): Promise<boolean> {
  const manager = createQueueManager(env);
  return manager.push(key);
}

export async function dequeueErrorKey(env?: RedisEnv): Promise<string | null> {
  const manager = createQueueManager(env);
  return manager.pop();
}

export async function dequeueErrorKeys(env: RedisEnv | undefined, count: number): Promise<string[]> {
  const manager = createQueueManager(env);
  return manager.popBatch(count);
}

export async function getQueueLength(env?: RedisEnv): Promise<number> {
  const manager = createQueueManager(env);
  return manager.length();
}