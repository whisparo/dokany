// lib/errors/guards/deduplicator.ts
// الإصدار: 1.0.1
// الدور: Incident Aggregation - تجميع الأخطاء المتشابهة مع First/Last Sample
// المبدأ: تخزين الحوادث في Redis مع TTL 5 دقائق → تجميع → إرسال ملخص

import { getRedisClient, type RedisEnv } from '../storage/redis-counter';
import { addBreadcrumb, getContext } from '../core/context';
import { SystemError } from '../core/types';
import type { Redis } from '@upstash/redis';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * تكوين حارس منع التكرار
 */
export interface DeduplicatorConfig {
  /** اسم الخدمة (مثل: 'telegram', 'qstash') */
  serviceName: string;

  /** مدة التجميع بالثواني (افتراضي: 300 = 5 دقائق) */
  windowSeconds?: number;

  /** مفتاح Redis الأساسي (افتراضي: incident:{serviceName}) */
  redisKeyPrefix?: string;

  /** هل يجب السماح عند فشل Redis؟ (افتراضي: true - Fail-Open) */
  allowOnRedisFailure?: boolean;

  /** مهلة الاتصال بـ Redis بالمللي ثانية (افتراضي: 500) */
  redisTimeoutMs?: number;
}

/**
 * بيانات حادثة مجمعة
 */
export interface IncidentData {
  /** معرف الحادثة (يعتمد على الكود + المعرفات) */
  incidentId: string;
  /** كود الخطأ */
  code: string;
  /** فئة الخطأ */
  category: string;
  /** درجة الخطورة */
  severity: string;
  /** عدد مرات حدوث الخطأ */
  count: number;
  /** أول عينة (أول خطأ) */
  firstSample: {
    timestamp: string;
    correlationId: string;
    userMessage: string;
    technicalMessage: string;
    metadata?: Record<string, unknown>;
    storeId?: string;
    userId?: string;
  };
  /** آخر عينة (آخر خطأ) */
  lastSample: {
    timestamp: string;
    correlationId: string;
    userMessage: string;
    technicalMessage: string;
    metadata?: Record<string, unknown>;
    storeId?: string;
    userId?: string;
  };
  /** بيانات وصفية إضافية (مثل: storeId المجمع) */
  metadata?: Record<string, unknown>;
  /** وقت بداية الحادثة */
  startedAt: string;
  /** وقت آخر تحديث */
  updatedAt: string;
}

/**
 * نتيجة تسجيل حادثة
 */
export interface DeduplicationResult {
  /** معرف الحادثة */
  incidentId: string;
  /** هل تم إنشاء حادثة جديدة؟ */
  isNewIncident: boolean;
  /** العدد الحالي للحادثة */
  count: number;
  /** هل يجب إرسال تنبيه؟ (أول حدث فقط) */
  shouldAlert: boolean;
  /** هل تم تجاوز الحد؟ (لإرسال الملخص) */
  shouldSummarize: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 🔒  حارس منع التكرار الرئيسي
// ═══════════════════════════════════════════════════════════════

export class Deduplicator {
  private readonly config: Required<DeduplicatorConfig>;
  private readonly redisKeyPrefix: string;

  constructor(config: DeduplicatorConfig) {
    this.config = {
      windowSeconds: 300,
      redisKeyPrefix: 'incident',
      allowOnRedisFailure: true,
      redisTimeoutMs: 500,
      ...config,
    };

    this.redisKeyPrefix = this.config.redisKeyPrefix;
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤  الطرق العامة (Public Methods)
  // ═══════════════════════════════════════════════════════════════

  /**
   * تسجيل حدث (خطأ) في نظام التجميع
   * 
   * @param error - الـ SystemError المراد تسجيله
   * @param env - بيئة Workers
   * @param options - خيارات إضافية (مثل: storeId إضافية للتجميع)
   * @returns نتيجة التجميع
   */
  async record(
    error: SystemError,
    env: RedisEnv | undefined,
    options: {
      storeId?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<DeduplicationResult> {
    // 1️⃣ توليد معرف الحادثة
    const incidentId = this.generateIncidentId(error, options.storeId);

    try {
      const redis = getRedisClient(env);
      if (!redis) {
        return this.fallbackResult(incidentId, 'Redis not available');
      }

      // 2️⃣ قراءة الحادثة الحالية (إن وجدت)
      const existing = await this.getIncident(redis, incidentId);

      if (existing) {
        // 3️⃣ تحديث الحادثة الموجودة (زيادة العداد، تحديث Last Sample)
        const updated = await this.updateExistingIncident(
          redis,
          incidentId,
          existing,
          error
        );

        addBreadcrumb(`Incident updated: ${incidentId}`, {
          service: this.config.serviceName,
          count: updated.count,
          code: error.code,
        });

        return {
          incidentId,
          isNewIncident: false,
          count: updated.count,
          shouldAlert: false,
          shouldSummarize: updated.count >= 10, // بعد 10 أحداث، نرسل ملخص
        };
      }

      // 4️⃣ إنشاء حادثة جديدة
      await this.createNewIncident(redis, incidentId, error, options);

      addBreadcrumb(`New incident: ${incidentId}`, {
        service: this.config.serviceName,
        code: error.code,
        storeId: options.storeId,
      });

      return {
        incidentId,
        isNewIncident: true,
        count: 1,
        shouldAlert: true, // أول حدث يُرسل تنبيه
        shouldSummarize: false,
      };
    } catch (redisError) {
      console.warn(
        `[Deduplicator] Redis failed for ${this.config.serviceName}:`,
        redisError
      );

      if (this.config.allowOnRedisFailure) {
        return this.fallbackResult(incidentId, 'Redis error (fail-open)');
      }

      // Fail-Close: نتعامل مع كل خطأ كحادثة جديدة (لعدم فقدان التنبيهات)
      return {
        incidentId,
        isNewIncident: true,
        count: 1,
        shouldAlert: true,
        shouldSummarize: false,
      };
    }
  }

  /**
   * الحصول على بيانات حادثة محددة
   */
  async getIncidentData(
    incidentId: string,
    env: RedisEnv | undefined
  ): Promise<IncidentData | null> {
    try {
      const redis = getRedisClient(env);
      if (!redis) return null;

      const key = this.getIncidentKey(incidentId);
      const data = await redis.get(key);
      if (!data) return null;

      return typeof data === 'string' ? JSON.parse(data) : (data as IncidentData);
    } catch (error) {
      console.warn(
        `[Deduplicator] Failed to get incident ${incidentId}:`,
        error
      );
      return null;
    }
  }

  /**
   * الحصول على جميع الحوادث النشطة (للتصحيح)
   */
  async getActiveIncidents(env: RedisEnv | undefined): Promise<IncidentData[]> {
    try {
      const redis = getRedisClient(env);
      if (!redis) return [];

      const pattern = `${this.redisKeyPrefix}:*`;
      const keys = await redis.keys(pattern);

      const incidents: IncidentData[] = [];
      for (const key of keys) {
        try {
          const data = await redis.get(key);
          if (data) {
            incidents.push(typeof data === 'string' ? JSON.parse(data) : (data as IncidentData));
          }
        } catch {
          // تجاهل المفاتيح التي لا يمكن قراءتها
        }
      }

      return incidents.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.warn(
        `[Deduplicator] Failed to get active incidents:`,
        error
      );
      return [];
    }
  }

  /**
   * إرسال ملخص الحادثة (تُستدعى بعد انتهاء النافذة)
   * يتم استدعاؤها من الـ Background Processor
   */
  async summarize(
    incidentId: string,
    env: RedisEnv | undefined
  ): Promise<IncidentData | null> {
    const data = await this.getIncidentData(incidentId, env);
    if (!data) return null;

    // لا نمسح الحادثة، نتركها تنتهي تلقائياً بـ TTL
    // لكن نُضيف علامة بأنه تم إرسال الملخص
    try {
      const redis = getRedisClient(env);
      if (!redis) return data;

      const key = this.getIncidentKey(incidentId);
      const updated: IncidentData = {
        ...data,
        metadata: {
          ...data.metadata,
          summarized: true,
          summarizedAt: new Date().toISOString(),
        },
      };

      await redis.set(key, JSON.stringify(updated), {
        ex: this.config.windowSeconds,
      });

      return updated;
    } catch (error) {
      console.warn(
        `[Deduplicator] Failed to summarize incident ${incidentId}:`,
        error
      );
      return data;
    }
  }

  /**
   * إعادة ضبط الحادثة (يدوياً)
   */
  async resetIncident(incidentId: string, env: RedisEnv | undefined): Promise<void> {
    try {
      const redis = getRedisClient(env);
      if (!redis) return;

      const key = this.getIncidentKey(incidentId);
      await redis.del(key);

      addBreadcrumb(`Incident reset: ${incidentId}`, {
        service: this.config.serviceName,
      });
    } catch (error) {
      console.warn(
        `[Deduplicator] Failed to reset incident ${incidentId}:`,
        error
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧩  الدوال الداخلية (Private Helpers)
  // ═══════════════════════════════════════════════════════════════

  /**
   * توليد معرف الحادثة
   */
  private generateIncidentId(error: SystemError, storeId?: string): string {
    const parts = [error.code];

    if (storeId) {
      parts.push(storeId);
    }

    // إضافة معرف إضافي من السياق إن وجد
    const context = getContext();
    if (context?.storeId && context.storeId !== storeId) {
      parts.push(context.storeId);
    }

    return parts.join(':');
  }

  /**
   * الحصول على مفتاح Redis للحادثة
   */
  private getIncidentKey(incidentId: string): string {
    return `${this.redisKeyPrefix}:${incidentId}`;
  }

  /**
   * قراءة حادثة من Redis
   */
  private async getIncident(
    redis: Redis,
    incidentId: string
  ): Promise<IncidentData | null> {
    const key = this.getIncidentKey(incidentId);
    const data = await redis.get(key);

    if (!data) return null;

    try {
      return typeof data === 'string' ? JSON.parse(data) : (data as IncidentData);
    } catch {
      return null;
    }
  }

  /**
   * إنشاء حادثة جديدة
   */
  private async createNewIncident(
    redis: Redis,
    incidentId: string,
    error: SystemError,
    options: { storeId?: string; userId?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    const key = this.getIncidentKey(incidentId);
    const now = new Date().toISOString();

    const sample = {
      timestamp: error.timestamp.toISOString(),
      correlationId: error.correlationId,
      userMessage: error.userMessage,
      technicalMessage: error.technicalMessage,
      metadata: error.metadata,
      storeId: error.storeId || options.storeId,
      userId: (error.metadata?.userId as string | undefined) || options.userId,
    };

    const data: IncidentData = {
      incidentId,
      code: error.code,
      category: error.category,
      severity: error.severity,
      count: 1,
      firstSample: sample,
      lastSample: sample,
      metadata: options.metadata,
      startedAt: now,
      updatedAt: now,
    };

    await redis.set(key, JSON.stringify(data), {
      ex: this.config.windowSeconds,
    });
  }

  /**
   * تحديث حادثة موجودة
   */
  private async updateExistingIncident(
    redis: Redis,
    incidentId: string,
    existing: IncidentData,
    error: SystemError
  ): Promise<IncidentData> {
    const key = this.getIncidentKey(incidentId);

    const updated: IncidentData = {
      ...existing,
      count: existing.count + 1,
      lastSample: {
        timestamp: error.timestamp.toISOString(),
        correlationId: error.correlationId,
        userMessage: error.userMessage,
        technicalMessage: error.technicalMessage,
        metadata: error.metadata,
        storeId: error.storeId || existing.lastSample.storeId,
        userId: (error.metadata?.userId as string | undefined) || existing.lastSample.userId,
      },
      updatedAt: new Date().toISOString(),
    };

    // تحديث TTL
    await redis.set(key, JSON.stringify(updated), {
      ex: this.config.windowSeconds,
    });

    return updated;
  }

  /**
   * إنشاء نتيجة Fallback (عند فشل Redis)
   */
  private fallbackResult(
    incidentId: string,
    _reason: string
  ): DeduplicationResult {
    return {
      incidentId,
      isNewIncident: true,
      count: 1,
      shouldAlert: true,
      shouldSummarize: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭  المصنع (Factory)
// ═══════════════════════════════════════════════════════════════

/**
 * خريطة لحارس منع التكرار (Singleton لكل خدمة)
 */
const deduplicatorMap = new Map<string, Deduplicator>();

/**
 * الحصول على حارس منع التكرار لخدمة معينة (Singleton)
 */
export function getDeduplicator(
  serviceName: string,
  config?: Partial<DeduplicatorConfig>
): Deduplicator {
  const key = serviceName;
  if (!deduplicatorMap.has(key)) {
    const fullConfig: DeduplicatorConfig = {
      serviceName,
      windowSeconds: config?.windowSeconds ?? 300,
      redisKeyPrefix: config?.redisKeyPrefix ?? 'incident',
      allowOnRedisFailure: config?.allowOnRedisFailure ?? true,
      redisTimeoutMs: config?.redisTimeoutMs ?? 500,
    };
    deduplicatorMap.set(key, new Deduplicator(fullConfig));
  }
  return deduplicatorMap.get(key)!;
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام السريع
// ═══════════════════════════════════════════════════════════════

/**
 * تسجيل خطأ في نظام التجميع (دالة مساعدة)
 */
export async function recordError(
  error: SystemError,
  env: RedisEnv | undefined,
  options?: {
    storeId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<DeduplicationResult> {
  const deduplicator = getDeduplicator('default');
  return deduplicator.record(error, env, options);
}

/**
 * الحصول على بيانات حادثة محددة (دالة مساعدة)
 */
export async function getIncident(
  incidentId: string,
  env: RedisEnv | undefined
): Promise<IncidentData | null> {
  const deduplicator = getDeduplicator('default');
  return deduplicator.getIncidentData(incidentId, env);
}

/**
 * الحصول على جميع الحوادث النشطة (دالة مساعدة)
 */
export async function getActiveIncidents(
  env: RedisEnv | undefined
): Promise<IncidentData[]> {
  const deduplicator = getDeduplicator('default');
  return deduplicator.getActiveIncidents(env);
}

/**
 * إعادة ضبط حادثة (دالة مساعدة)
 */
export async function resetIncident(
  incidentId: string,
  env: RedisEnv | undefined
): Promise<void> {
  const deduplicator = getDeduplicator('default');
  return deduplicator.resetIncident(incidentId, env);
}

/**
 * تنفيذ عملية مع تجميع تلقائي (Decorator)
 * 
 * @param env - بيئة Workers
 * @param serviceName - اسم الخدمة
 * @param fn - الدالة المراد تنفيذها
 * @param options - خيارات التجميع
 * @param config - تكوين إضافي للحارس
 * @returns نتيجة الدالة
 * 
 * @example
 * ```typescript
 * const result = await withDeduplication(
 *   env,
 *   'telegram',
 *   async () => {
 *     return await sendTelegramMessage();
 *   },
 *   { code: 'INT_003', storeId: 'store_123' }
 * );
 * ```
 */
export async function withDeduplication<T>(
  env: RedisEnv | undefined,
  serviceName: string,
  fn: () => Promise<T>,
  options: {
    code: string;
    storeId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  },
  config?: Partial<DeduplicatorConfig>
): Promise<{
  result: T;
  incidentId: string;
  isNewIncident: boolean;
  count: number;
}> {
  // إنشاء خطأ وهمي للتجميع (بدون رميه)
  // نستخدمه فقط لتوليد incidentId
  const mockError = new SystemError({
    code: options.code,
    category: 'system',
    severity: 'warning',
    userMessage: 'Deduplication mock',
    technicalMessage: 'Deduplication mock for grouping',
    retryable: false,
    shouldAlert: false,
    correlationId: 'mock',
    breadcrumbs: [],
  });

  const deduplicator = getDeduplicator(serviceName, config);

  // 1️⃣ تسجيل الحدث في نظام التجميع
  const result = await deduplicator.record(mockError, env, {
    storeId: options.storeId,
    userId: options.userId,
    metadata: options.metadata,
  });

  // 2️⃣ تنفيذ الدالة (بغض النظر عن التجميع)
  try {
    const fnResult = await fn();
    return {
      result: fnResult,
      incidentId: result.incidentId,
      isNewIncident: result.isNewIncident,
      count: result.count,
    };
  } catch (error) {
    // في حال فشل الدالة، نُسجل الفشل أيضاً (لكن نعيد رمي الخطأ)
    throw error;
  }
}

/**
 * تنسيق رسالة الملخص لتليجرام
 */
export function formatIncidentSummary(data: IncidentData): string {
  const emoji =
    data.severity === 'critical' ? '🚨' :
    data.severity === 'warning' ? '⚠️' :
    'ℹ️';

  const lines: string[] = [];

  lines.push(`${emoji} <b>Incident Report</b>`);
  lines.push(`<b>🔴 Code:</b> ${data.code}`);
  lines.push(`<b>📂 Category:</b> ${data.category}`);
  lines.push(`<b>📦 Count:</b> ${data.count} errors in ${Math.floor((new Date(data.updatedAt).getTime() - new Date(data.startedAt).getTime()) / 1000)} seconds`);

  if (data.firstSample.storeId) {
    lines.push(`<b>🏪 Store:</b> ${data.firstSample.storeId}`);
  }

  lines.push('');
  lines.push(`<b>🕒 First:</b> ${data.firstSample.timestamp}`);
  lines.push(`<b>🕒 Last:</b> ${data.lastSample.timestamp}`);

  if (data.firstSample.userMessage !== data.lastSample.userMessage) {
    lines.push('');
    lines.push(`<b>📌 First Message:</b> ${data.firstSample.userMessage}`);
    lines.push(`<b>📌 Last Message:</b> ${data.lastSample.userMessage}`);
  } else {
    lines.push('');
    lines.push(`<b>📌 Message:</b> ${data.firstSample.userMessage}`);
  }

  if (data.metadata && Object.keys(data.metadata).length > 0) {
    lines.push('');
    lines.push('<b>📊 Details:</b>');
    for (const [key, value] of Object.entries(data.metadata)) {
      if (typeof value !== 'object') {
        lines.push(`  • ${key}: ${String(value)}`);
      }
    }
  }

  return lines.join('\n');
}