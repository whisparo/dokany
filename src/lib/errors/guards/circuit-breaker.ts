// lib/errors/guards/circuit-breaker.ts
// الإصدار: 1.0.1
// الدور: حماية الخدمات الخارجية من الانهيار (Circuit Breaker Pattern)
// المبدأ: Closed → Open → Half-Open → Closed (مع تخزين الحالة في Redis)

import { getRedisClient, type RedisEnv } from '../storage/redis-counter';
import { addBreadcrumb } from '../core/context';
import type { Redis } from '@upstash/redis';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * حالة الدائرة
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * تكوين حارس الدائرة
 */
export interface CircuitBreakerConfig {
  /** اسم الخدمة (للتفرقة بين الخدمات المختلفة) */
  serviceName: string;

  /** عدد المحاولات الفاشلة قبل فتح الدائرة (افتراضي: 5) */
  failureThreshold?: number;

  /** مدة فتح الدائرة بالثواني (افتراضي: 300 = 5 دقائق) */
  openDurationSeconds?: number;

  /** عدد المحاولات الناجحة في Half-Open لإغلاق الدائرة (افتراضي: 3) */
  successThreshold?: number;

  /** مفتاح Redis الأساسي (افتراضي: circuit:{serviceName}) */
  redisKeyPrefix?: string;

  /** هل يجب تخزين الحالة في Redis؟ (افتراضي: true) */
  persistToRedis?: boolean;

  /** مهلة الاتصال بـ Redis بالمللي ثانية (افتراضي: 1000) */
  redisTimeoutMs?: number;
}

/**
 * حالة الدائرة الكاملة (للقراءة)
 */
export interface CircuitStatus {
  /** اسم الخدمة */
  serviceName: string;
  /** الحالة الحالية */
  state: CircuitState;
  /** عدد المحاولات الفاشلة المتتالية */
  failureCount: number;
  /** عدد المحاولات الناجحة المتتالية (في Half-Open) */
  successCount: number;
  /** الوقت المتبقي حتى إغلاق الدائرة (بالثواني) */
  remainingOpenSeconds: number;
  /** آخر تحديث */
  lastUpdated: Date;
}

// ═══════════════════════════════════════════════════════════════
// 🔌  حارس الدائرة الرئيسي
// ═══════════════════════════════════════════════════════════════

export class CircuitBreaker {
  private readonly config: Required<CircuitBreakerConfig>;
  private readonly redisKey: string;

  // الحالة في الذاكرة (تُستخدم كـ Cache لتجنب ضرب Redis في كل طلب)
  private cachedState: CircuitState = 'closed';
  private cachedFailureCount: number = 0;
  private cachedSuccessCount: number = 0;
  private cachedOpenUntil: number = 0;
  private lastRedisSync: number = 0;
  private readonly syncIntervalMs: number = 5000; // مزامنة مع Redis كل 5 ثوانٍ

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      openDurationSeconds: 300,
      successThreshold: 3,
      redisKeyPrefix: 'circuit',
      persistToRedis: true,
      redisTimeoutMs: 1000,
      ...config,
    };

    this.redisKey = `${this.config.redisKeyPrefix}:${this.config.serviceName}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤  الطرق العامة (Public Methods)
  // ═══════════════════════════════════════════════════════════════

  /**
   * التحقق مما إذا كانت الدائرة تسمح بإرسال الطلب
   */
  async allow(env?: RedisEnv): Promise<boolean> {
    await this.syncState(env);

    if (this.cachedState === 'open') {
      const now = Date.now();
      if (now >= this.cachedOpenUntil) {
        // الانتقال إلى Half-Open تلقائياً
        this.cachedState = 'half-open';
        this.cachedFailureCount = 0;
        this.cachedSuccessCount = 0;
        await this.persistState(env);
        addBreadcrumb(`Circuit ${this.config.serviceName}: open → half-open (expired)`, {
          service: this.config.serviceName,
        });
        return true;
      }
      return false;
    }

    if (this.cachedState === 'half-open') {
      // نسمح بمحاولة واحدة في Half-Open (لتقييم الخدمة)
      // لكننا نحد من عدد المحاولات لتفادي الإغراق
      return true;
    }

    return true;
  }

  /**
   * تسجيل نجاح (يُغلق الدائرة تدريجياً)
   */
  async recordSuccess(env?: RedisEnv): Promise<void> {
    await this.syncState(env);

    if (this.cachedState === 'half-open') {
      this.cachedSuccessCount++;
      if (this.cachedSuccessCount >= this.config.successThreshold) {
        // نجاح كافٍ → إغلاق الدائرة
        this.cachedState = 'closed';
        this.cachedFailureCount = 0;
        this.cachedSuccessCount = 0;
        addBreadcrumb(`Circuit ${this.config.serviceName}: half-open → closed (threshold met)`, {
          service: this.config.serviceName,
          successThreshold: this.config.successThreshold,
        });
      }
    } else if (this.cachedState === 'closed') {
      // إعادة ضبط عداد الفشل عند النجاح
      this.cachedFailureCount = 0;
    }

    await this.persistState(env);
  }

  /**
   * تسجيل فشل (يزيد العداد ويفتح الدائرة إن لزم)
   */
  async recordFailure(env?: RedisEnv): Promise<void> {
    await this.syncState(env);

    this.cachedFailureCount++;

    if (this.cachedState === 'half-open') {
      // فشل في Half-Open → فتح الدائرة فوراً
      this.cachedState = 'open';
      this.cachedOpenUntil = Date.now() + this.config.openDurationSeconds * 1000;
      this.cachedSuccessCount = 0;
      addBreadcrumb(`Circuit ${this.config.serviceName}: half-open → open (failure in half-open)`, {
        service: this.config.serviceName,
        failureCount: this.cachedFailureCount,
      });
    } else if (this.cachedState === 'closed') {
      if (this.cachedFailureCount >= this.config.failureThreshold) {
        // تجاوز الحد → فتح الدائرة
        this.cachedState = 'open';
        this.cachedOpenUntil = Date.now() + this.config.openDurationSeconds * 1000;
        addBreadcrumb(`Circuit ${this.config.serviceName}: closed → open (threshold exceeded)`, {
          service: this.config.serviceName,
          failureThreshold: this.config.failureThreshold,
          failureCount: this.cachedFailureCount,
        });
      }
    }

    await this.persistState(env);
  }

  /**
   * الحصول على الحالة الكاملة للدائرة
   */
  async getStatus(env?: RedisEnv): Promise<CircuitStatus> {
    await this.syncState(env);

    const now = Date.now();
    const remainingOpenSeconds = this.cachedState === 'open'
      ? Math.max(0, Math.ceil((this.cachedOpenUntil - now) / 1000))
      : 0;

    return {
      serviceName: this.config.serviceName,
      state: this.cachedState,
      failureCount: this.cachedFailureCount,
      successCount: this.cachedSuccessCount,
      remainingOpenSeconds,
      lastUpdated: new Date(),
    };
  }

  /**
   * إعادة ضبط الدائرة يدوياً (إغلاق فوري)
   */
  async reset(env?: RedisEnv): Promise<void> {
    this.cachedState = 'closed';
    this.cachedFailureCount = 0;
    this.cachedSuccessCount = 0;
    this.cachedOpenUntil = 0;
    await this.persistState(env);
    addBreadcrumb(`Circuit ${this.config.serviceName}: manually reset to closed`, {
      service: this.config.serviceName,
    });
  }

  /**
   * فتح الدائرة يدوياً (للطوارئ)
   */
  async forceOpen(env?: RedisEnv, durationSeconds?: number): Promise<void> {
    this.cachedState = 'open';
    this.cachedOpenUntil = Date.now() + (durationSeconds ?? this.config.openDurationSeconds) * 1000;
    await this.persistState(env);
    addBreadcrumb(`Circuit ${this.config.serviceName}: manually forced open`, {
      service: this.config.serviceName,
      durationSeconds: durationSeconds ?? this.config.openDurationSeconds,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧩  الدوال الداخلية (Private Helpers)
  // ═══════════════════════════════════════════════════════════════

  /**
   * مزامنة الحالة مع Redis (إن كان التخزين مفعلاً)
   */
  private async syncState(env?: RedisEnv): Promise<void> {
    if (!this.config.persistToRedis) {
      return;
    }

    const now = Date.now();

    // تجنب مزامنة Redis في كل طلب (استخدام Cache مع TTL)
    if (now - this.lastRedisSync < this.syncIntervalMs) {
      return;
    }

    try {
      const redis = getRedisClient(env);
      if (!redis) {
        // إذا لم يتوفر Redis، نعتمد على الحالة في الذاكرة فقط
        return;
      }

      const state = await this.loadFromRedis(redis);
      if (state) {
        this.cachedState = state.state;
        this.cachedFailureCount = state.failureCount;
        this.cachedSuccessCount = state.successCount;
        this.cachedOpenUntil = state.openUntil;
      }

      this.lastRedisSync = now;
    } catch (error) {
      // في حال فشل الاتصال بـ Redis، نعتمد على الحالة المخزنة محلياً (أو الحالة الافتراضية)
      console.warn(`[CircuitBreaker] Failed to sync with Redis for ${this.config.serviceName}:`, error);
    }
  }

  /**
   * تحميل الحالة من Redis
   */
  private async loadFromRedis(redis: Redis): Promise<{
    state: CircuitState;
    failureCount: number;
    successCount: number;
    openUntil: number;
  } | null> {
    try {
      const data = await redis.get(this.redisKey);
      if (!data) return null;

      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return {
        state: parsed.state as CircuitState,
        failureCount: parsed.failureCount ?? 0,
        successCount: parsed.successCount ?? 0,
        openUntil: parsed.openUntil ?? 0,
      };
    } catch (error) {
      console.warn(`[CircuitBreaker] Failed to load state from Redis for ${this.config.serviceName}:`, error);
      return null;
    }
  }

  /**
   * حفظ الحالة إلى Redis (مع TTL حسب الحالة)
   */
  private async persistState(env?: RedisEnv): Promise<void> {
    if (!this.config.persistToRedis) {
      return;
    }

    try {
      const redis = getRedisClient(env);
      if (!redis) return;

      const data = {
        state: this.cachedState,
        failureCount: this.cachedFailureCount,
        successCount: this.cachedSuccessCount,
        openUntil: this.cachedOpenUntil,
        updatedAt: Date.now(),
      };

      const ttl = this.cachedState === 'open'
        ? Math.max(60, Math.ceil((this.cachedOpenUntil - Date.now()) / 1000) + 10)
        : 3600; // ساعة واحدة للحالتين closed و half-open

      await redis.set(this.redisKey, JSON.stringify(data), { ex: ttl });
    } catch (error) {
      console.warn(`[CircuitBreaker] Failed to persist state to Redis for ${this.config.serviceName}:`, error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭  المصنع (Factory)
// ═══════════════════════════════════════════════════════════════

/**
 * خريطة لحارس الدائرة (Singleton لكل خدمة)
 */
const circuitBreakerMap = new Map<string, CircuitBreaker>();

/**
 * الحصول على حارس دائرة لخدمة معينة (Singleton)
 */
export function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const key = serviceName;
  if (!circuitBreakerMap.has(key)) {
    const fullConfig: CircuitBreakerConfig = {
      serviceName,
      failureThreshold: config?.failureThreshold ?? 5,
      openDurationSeconds: config?.openDurationSeconds ?? 300,
      successThreshold: config?.successThreshold ?? 3,
      redisKeyPrefix: config?.redisKeyPrefix ?? 'circuit',
      persistToRedis: config?.persistToRedis ?? true,
      redisTimeoutMs: config?.redisTimeoutMs ?? 1000,
    };
    circuitBreakerMap.set(key, new CircuitBreaker(fullConfig));
  }
  return circuitBreakerMap.get(key)!;
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام السريع
// ═══════════════════════════════════════════════════════════════

/**
 * تنفيذ عملية مع حماية Circuit Breaker
 * 
 * @param env - بيئة Workers أو Redis
 * @param serviceName - اسم الخدمة (مثل: 'telegram', 'qstash')
 * @param fn - الدالة المراد تنفيذها
 * @param config - تكوين إضافي
 * @returns نتيجة الدالة
 * 
 * @example
 * ```typescript
 * const result = await withCircuitBreaker(env, 'telegram', async () => {
 *   return await fetchTelegramAPI();
 * });
 * ```
 */
export async function withCircuitBreaker<T>(
  env: RedisEnv | undefined,
  serviceName: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const breaker = getCircuitBreaker(serviceName, config);

  // 1️⃣ التحقق من السماح
  const allowed = await breaker.allow(env);
  if (!allowed) {
    const status = await breaker.getStatus(env);
    throw new Error(
      `Circuit breaker is open for service '${serviceName}'. ` +
      `Retry after ${status.remainingOpenSeconds} seconds.`
    );
  }

  // 2️⃣ تنفيذ الدالة
  try {
    const result = await fn();
    await breaker.recordSuccess(env);
    return result;
  } catch (error) {
    await breaker.recordFailure(env);
    throw error;
  }
}

/**
 * دالة مساعدة لتوليد مفتاح Redis للحالة
 */
export function getCircuitKey(serviceName: string): string {
  return `circuit:${serviceName}`;
}

/**
 * إعادة ضبط جميع الدوائر (للتصحيح)
 */
export async function resetAllCircuits(env?: RedisEnv): Promise<void> {
  const redis = getRedisClient(env);
  if (!redis) return;

  const keys = await redis.keys('circuit:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // إعادة ضبط الخريطة المحلية
  circuitBreakerMap.clear();

  addBreadcrumb('All circuits reset', { count: keys.length });
}

/**
 * الحصول على حالة جميع الدوائر (للتصحيح)
 */
export async function getAllCircuitStatuses(env?: RedisEnv): Promise<CircuitStatus[]> {
  const statuses: CircuitStatus[] = [];

  for (const [serviceName, breaker] of circuitBreakerMap) {
    try {
      const status = await breaker.getStatus(env);
      statuses.push(status);
    } catch (error) {
      console.warn(`[CircuitBreaker] Failed to get status for ${serviceName}:`, error);
    }
  }

  return statuses;
}