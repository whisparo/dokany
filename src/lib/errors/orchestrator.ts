// lib/errors/orchestrator.ts
// الإصدار: 1.5.4
// الدور: المنسق الرئيسي المباشر - موجه الاستثناءات اللحظية والمعالجة الخلفية

import {
  SystemError,
  isSystemError,
  addBreadcrumb,
  getContext,
  sanitizeObject,
  type ErrorContext,
  type ErrorContextData,
} from './core';

import {
  classifyError,
} from './processing';

import {
  QueueManager,
  ErrorCounter,
  getRedisClient,
  type QueueEnv,
  type RedisEnv,
} from './storage';

import {
  Deduplicator,
  getDeduplicator,
} from './guards';

import { processErrorQueue as runProcessor } from './background/processor';
import { processBatchFlush as runBatchFlush } from './background/batch-flush'; // 👈 إضافة الاستيراد
import { alertService } from '@/lib/alerts';
import type { SystemEnvironment } from '@/lib/env';

// إعادة تصدير النوع الموحد من النواة
export type { SystemEnvironment };

export interface HandleErrorOptions {
  code?: string;
  storeId?: string;
  userId?: string;
  context?: Partial<ErrorContext> | Partial<ErrorContextData>;
  metadata?: Record<string, unknown>;
}

export class ErrorOrchestrator {
  private initialized: boolean = false;
  private env?: SystemEnvironment;
  private deduplicator: Deduplicator;

  constructor() {
    this.deduplicator = getDeduplicator('orchestrator');
  }

  /**
   * تهيئة بيئة التشغيل
   */
  async init(env?: SystemEnvironment): Promise<void> {
    this.env = env;
    this.initialized = true;

    addBreadcrumb('ErrorOrchestrator initialized', {
      environment: env?.ENVIRONMENT || 'development',
    });
  }

  /**
   * المعالج الرئيسي لجميع الاستثناءات اللحظية
   */
  async handleException(
    error: unknown,
    env?: SystemEnvironment,
    options?: HandleErrorOptions
  ): Promise<SystemError> {
    const activeEnv = env || this.env;
    const currentContext = getContext();

    // 1. استخراج الـ storeId والـ userId مع ضمان نوع string
    const rawStoreId = options?.storeId || options?.context?.storeId || currentContext?.storeId;
    const rawUserId = options?.userId || options?.context?.userId || currentContext?.userId;

    const storeId = typeof rawStoreId === 'string' 
      ? rawStoreId 
      : (rawStoreId && typeof rawStoreId !== 'object' ? String(rawStoreId) : undefined);

    const userId = typeof rawUserId === 'string' 
      ? rawUserId 
      : (rawUserId && typeof rawUserId !== 'object' ? String(rawUserId) : undefined);

    // 2. تنقية وتجميع الـ Metadata
    const mergedMetadata = sanitizeObject({
      ...options?.metadata,
    });

    // 3. تصنيف الخطأ
    const systemError = classifyError(error, {
      code: options?.code,
      metadata: {
        ...mergedMetadata,
        storeId,
        userId,
      },
    });

    // 4. منع التكرار باستخدام Deduplicator
    const dedupResult = await this.deduplicator.record(
      systemError,
      activeEnv,
      {
        storeId,
        userId,
        metadata: mergedMetadata,
      }
    );

    if (!dedupResult.isNewIncident && !dedupResult.shouldAlert) {
      addBreadcrumb(`Duplicate error suppressed: ${systemError.code}`, {
        incidentId: dedupResult.incidentId,
        count: dedupResult.count,
      });
      return systemError;
    }

    // 5. التخزين والتنبيه بأمان
    if (activeEnv) {
      this.dispatchStorageTasks(systemError, activeEnv).catch((err: Error) => {
        console.error('[Orchestrator] Storage task failed safely:', err.message);
      });

      if (systemError.shouldAlert && !systemError.isSilent()) {
        this.dispatchNotifications(systemError, activeEnv).catch((err: Error) => {
          console.error('[Orchestrator] Notification task failed safely:', err.message);
        });
      }
    }

    return systemError;
  }

  /**
   * معالجة الرسائل النصية
   */
  async handleMessage(
    message: string,
    env?: SystemEnvironment,
    options?: HandleErrorOptions
  ): Promise<SystemError> {
    return this.handleException(new Error(message), env, options);
  }

  /**
   * إدارة وتنسيق عملية معالجة الـ Queue في الخلفية (Cron Processing)
   */
  async processQueue(
    env?: SystemEnvironment,
    options?: { batchSize?: number }
  ) {
    const activeEnv = env || this.env;
    if (!activeEnv) {
      throw new Error('[Orchestrator] Environment configuration is missing for queue processing.');
    }

    return await runProcessor(activeEnv, options);
  }

  /**
   * 🚀 تفريغ الطلبات الموقتة من الـ KV للـ D1 في الخلفية (Batch Flush Facade)
   */
  async processBatchFlush(
    env?: SystemEnvironment,
    options?: { batchSize?: number }
  ) {
    const activeEnv = env || this.env;
    if (!activeEnv) {
      throw new Error('[Orchestrator] Environment configuration is missing for batch flush.');
    }

    // استخراج القيمة العددية لضمان تطابق الأنواع
    return await runBatchFlush(activeEnv, options?.batchSize);
  }
  /**
   * صياغة الـ API Response
   */
  formatApiError(
    error: unknown,
    includeDetails: boolean = false
  ) {
    const systemError = isSystemError(error) ? error : classifyError(error);

    return {
      success: false as const,
      error: {
        code: systemError.code,
        message: systemError.userMessage,
        status: systemError.httpStatus,
        timestamp: systemError.timestamp.toISOString(),
        correlationId: systemError.correlationId,
        ...(includeDetails && {
          details: {
            technicalMessage: systemError.technicalMessage,
            category: systemError.category,
            severity: systemError.severity,
            metadata: systemError.metadata,
          },
        }),
      },
    };
  }

  /**
   * استدعاء موديول التخزين بأمان (Redis Queue فقط)
   */
  private async dispatchStorageTasks(
    error: SystemError,
    env: SystemEnvironment
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    // 1. تحديث عدادات Redis
    try {
      const redisEnv: RedisEnv = {
        UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
      };
      const redis = getRedisClient(redisEnv);
      if (redis) {
        const errorCounter = new ErrorCounter({ redis });
        tasks.push(errorCounter.incrementDailyCounter(error.code, error.storeId));
      }
    } catch (redisErr) {
      console.error('[Orchestrator] Redis counter failed:', redisErr);
    }

    // 2. التوجيه الصحيح: الرمي المباشر في الـ Queue فقط للتعامل معاه لاحقاً
    try {
      const queueEnv: QueueEnv = {
        UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
      };
      const redis = getRedisClient(queueEnv);
      if (redis) {
        const queueManager = new QueueManager({ redis });
        tasks.push(queueManager.push(JSON.stringify(error)));
      }
    } catch (queueErr) {
      console.error('[Orchestrator] Queue push failed:', queueErr);
    }

    await Promise.allSettled(tasks);
  }

  /**
   * استدعاء موديول التنبيهات بأمان تام عبر AlertService الموحد
   */
  private async dispatchNotifications(
    error: SystemError,
    env: SystemEnvironment
  ): Promise<void> {
    try {
      await alertService.dispatch(
        {
          type: 'CRITICAL_FAILURE',
          severity: error.severity === 'critical' ? 'CRITICAL' : 'WARNING',
          payload: {
            storeId: error.storeId || 'system',
            action: error.code,
            error: error.technicalMessage || error.userMessage,
            stack: error.stack,
          },
        },
        env
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown notification error';
      console.error('[Orchestrator Safe-Catch] AlertService dispatch error:', msg);
    }
  }
}

export const errorOrchestrator = new ErrorOrchestrator();