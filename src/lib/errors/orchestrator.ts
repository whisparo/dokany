// lib/errors/orchestrator.ts
// الإصدار: 1.4.1
// الدور: المنسق الرئيسي المباشر - موجه الاستثناءات اللحظية (Runtime Exception Pipeline)

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
  createB2StoreFromEnv,
  B2Store,
  enqueueErrorKey,
  type QueueEnv,
} from './storage';

import {
  Deduplicator,
  getDeduplicator,
} from './guards';

import {
  TelegramAdapter,
} from './adapters';

import type {
  TelegramEnvBindings,
} from './clients';

export interface SystemEnvironment extends TelegramEnvBindings {
  ENVIRONMENT?: string;
  DB?: unknown;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  B2_ENDPOINT?: string;
  B2_BUCKET_NAME?: string;
  B2_APPLICATION_KEY_ID?: string;
  B2_APPLICATION_KEY?: string;
  [key: string]: unknown;
}

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
   * استدعاء موديول التخزين بأمان (Redis + B2 Storage)
   */
  private async dispatchStorageTasks(
    error: SystemError,
    env: SystemEnvironment
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    // 1. تحديث عدادات Redis
    try {
      const redis = getRedisClient(env);
      if (redis) {
        const errorCounter = new ErrorCounter({ redis });
        tasks.push(errorCounter.incrementDailyCounter(error.code, error.storeId));
      }
    } catch (redisErr) {
      console.error('[Orchestrator] Redis counter failed:', redisErr);
    }

    // 2. توليد المفتاح، الرفع إلى B2، وإضافة المفتاح المولد إلى Redis Queue
    try {
      const b2Store = createB2StoreFromEnv(env as Record<string, string | undefined>);
      const generatedKey = B2Store.createErrorKey();

      const b2WriteTask = b2Store
        .write({
          content: error,
          key: generatedKey,
          compress: true,
          enqueue: false,
          env: env as unknown as QueueEnv,
        })
        .then(async (result) => {
          // بعد نجاح الكتابة في B2 يتم زق المفتاح المولد بالدقة في قائمة Redis
          const queueEnv = env as unknown as QueueEnv;
          await enqueueErrorKey(queueEnv, result.key);
        });

      tasks.push(b2WriteTask);
    } catch (b2Err) {
      console.error('[Orchestrator] B2 Store setup failed:', b2Err);

      // Fallback: لو B2 فشل، نحفظ الـ correlationId في Redis Queue كبديل
      try {
        const redis = getRedisClient(env);
        if (redis) {
          const queueManager = new QueueManager({ redis });
          tasks.push(queueManager.push(error.correlationId));
        }
      } catch (queueErr) {
        console.error('[Orchestrator] Queue fallback failed:', queueErr);
      }
    }

    await Promise.allSettled(tasks);
  }

  /**
   * استدعاء موديول التنبيهات بأمان تام
   */
  private async dispatchNotifications(
    error: SystemError,
    env: SystemEnvironment
  ): Promise<void> {
    try {
      if (!env.TELEGRAM_BOT_TOKEN) return;

      const telegramAdapter = new TelegramAdapter(env);
      await telegramAdapter.notifyError(error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown notification error';
      console.error('[Orchestrator Safe-Catch] Telegram dispatch error:', msg);
    }
  }
}

export const errorOrchestrator = new ErrorOrchestrator();