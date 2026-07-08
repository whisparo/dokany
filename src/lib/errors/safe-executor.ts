// src/lib/errors/safe-executor.ts

/**
 * ============================================================
 * ⚙️ المُنفذ الآمن (Safe Executor Engine)
 * الإصدار: 9.2 (النسخة الكريستالية - توافقية Concurrency كاملة ومقاومة للأخطاء)
 * ============================================================
 */

import { classifyError } from './classifier';
import { sendErrorToTelegram } from './notifier';
import { ensureContext, addBreadcrumb } from '@/lib/context';
import { SystemError } from './types';
import type { ErrorContext, OperationType } from './types';


// ============================================================
// 📌 عتبات الأداء الافتراضية (Performance Thresholds)
// ============================================================

const DEFAULT_THRESHOLDS: Record<OperationType, number> = {
  api: 2000,        // 2 ثانية للـ API
  background: 5000, // 5 ثوانٍ للمهام الخلفية
  cron: 30000,      // 30 ثانية لمهام الـ Cron
};

// ============================================================
// ⚙️ تكوينات المُنفذ الآمن
// ============================================================

export interface SafeExecutorConfig<T = unknown> {
  /** القيمة الافتراضية عند الفشل النهائي */
  fallback?: T;
  
  /** عدد محاولات إعادة التنفيذ (افتراضي: 2) */
  retryCount?: number;
  
  /** معامل التأخير التصاعدي (افتراضي: 200ms) */
  backoffFactor?: number;
  
  /** الحد الأقصى للتأخير (افتراضي: 5000ms) */
  maxBackoffMs?: number;
  
  /** سياق إضافي يُمرر للمُصنف */
  context?: Partial<ErrorContext>;
  
  /** نوع العملية (لتحديد عتبة البطء المناسبة) */
  operationType?: OperationType;
  
  /** عتبة رصد البطء المخصصة (بالميلي ثانية) */
  performanceThresholdMs?: number;
  
  /** هل نرسل تنبيهات الأداء؟ (افتراضي: true) */
  alertOnPerformance?: boolean;
  
  /** اسم العملية للتسجيل (اختياري) */
  operationName?: string;
  
  /** هل نرمي الخطأ بدلاً من إرجاع fallback؟ (افتراضي: false) */
  throwOnError?: boolean;
}

// ============================================================
// 🎯 نوع النتيجة (Result Type)
// ============================================================

export type SafeResult<T> =
  | { success: true; data: T; duration: number }
  | { success: false; error: SystemError; duration: number };

// ============================================================
// 🚀 المُنفذ الآمن (Safe Executor)
// ============================================================

export async function safeExecute<T>(
  fn: () => Promise<T>,
  config: SafeExecutorConfig<T> = {}
): Promise<T | undefined> {
  const {
    fallback,
    retryCount = 2,
    backoffFactor = 200,
    maxBackoffMs = 5000,
    context: extraContext,
    operationType = 'api',
    performanceThresholdMs = DEFAULT_THRESHOLDS[operationType],
    alertOnPerformance = true,
    operationName = 'unknown',
    throwOnError = false,
  } = config;

  const startTime = Date.now();
  const maxAttempts = retryCount + 1;
  let attemptNumber = 0;

  const ctx = ensureContext();
  addBreadcrumb(`🚀 بدء تنفيذ: ${operationName} (نوع: ${operationType})`);

  while (attemptNumber < maxAttempts) {
    attemptNumber++;
    
    try {
      const result = await fn();
      
      const duration = Date.now() - startTime;
      if (duration > performanceThresholdMs && alertOnPerformance) {
        await handlePerformanceWarning(
          duration,
          performanceThresholdMs,
          operationName,
          operationType,
          extraContext
        );
      }
      
      addBreadcrumb(`✅ نجاح: ${operationName} (${duration}ms)`);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      let systemError: SystemError;
      
      // بناء الـ Metadata بشكل آمن ومتوافق مع الـ Readonly Records المعرفة حديثاً
      const executionMetadata: Record<string, unknown> = {
        attempts: attemptNumber,
        operationName,
        operationType,
        duration,
      };
      
      if (error instanceof SystemError) {
        systemError = new SystemError({
          ...error.toJSON(),
          metadata: {
            ...(error.metadata || {}),
            ...executionMetadata,
          },
        });
      } else {
        // دمج آمن للـ extras لتفادي كسر حماية الـ Readonly Context
        const mergedExtras: Record<string, unknown> = {
          ...(ctx.extras || {}),
          ...(extraContext?.extras || {}),
          ...executionMetadata,
        };

        systemError = classifyError(error, {
          ...ctx,
          ...extraContext,
          extras: mergedExtras,
        });
      }
      
      if (systemError.retryable && attemptNumber < maxAttempts) {
        const waitTime = Math.min(
          backoffFactor * Math.pow(2, attemptNumber - 1),
          maxBackoffMs
        );
        
        addBreadcrumb(
          `🔄 إعادة محاولة ${attemptNumber}/${maxAttempts} لـ ${operationName} (انتظار ${waitTime}ms)`
        );
        
        await sleep(waitTime);
        continue;
      }
      
      if (systemError.shouldAlert) {
        await sendErrorToTelegram(systemError);
      }
      
      addBreadcrumb(`❌ فشل نهائي: ${operationName} (${systemError.code})`);
      
      if (throwOnError) {
        throw systemError;
      }
      
      if ('fallback' in config) {
        return fallback as T;
      }
      
      return undefined;
    }
  }
  
  if ('fallback' in config) {
    return fallback as T;
  }
  
  return undefined;
}

// ============================================================
// ✅ النسخة المتقدمة مع ضمانات الـ Type Guard الكاملة
// ============================================================

export async function safeExecuteWithResult<T>(
  fn: () => Promise<T>,
  config: SafeExecutorConfig<T> = {}
): Promise<SafeResult<T>> {
  const startTime = Date.now();
  
  try {
    const data = await safeExecute(fn, {
      ...config,
      throwOnError: true, 
    });
    
    // فحص صارم للتأكد من طرد الـ undefined تماماً وإرضاء الـ Compiler
    if (data === undefined) {
      throw new Error('العملية انتهت بدون إرجاع بيانات وبدون رمي خطأ صريح.');
    }
    
    return {
      success: true,
      data: data,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof SystemError ? error : classifyError(error),
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================
// 🔧 دوال مساعدة
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handlePerformanceWarning(
  duration: number,
  threshold: number,
  operationName: string,
  operationType: OperationType,
  extraContext?: Partial<ErrorContext>
): Promise<void> {
  const ctx = ensureContext();
  
  // بناء الـ Extras بشكل صريح ومنفصل لمنع تداخل الـ Readonly للـ Context الأساسي
  const warningExtras: Record<string, unknown> = {
    ...(ctx.extras || {}),
    ...(extraContext?.extras || {}),
    duration,
    threshold,
    operationName,
    operationType,
    isPerformanceWarning: true,
  };

  const perfError = new SystemError({
    code: 'PERF_001',
    userMessage: `استغرقت العملية ${duration}ms، وهو أكثر من الحد المسموح (${threshold}ms).`,
    category: 'performance',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
    technicalMessage: `⏱️ عملية بطيئة: ${operationName} استغرقت ${duration}ms (الحد: ${threshold}ms)`,
    metadata: warningExtras,
  });
  
  await sendErrorToTelegram(perfError);
  addBreadcrumb(`⚠️ تحذير أداء: ${operationName} (${duration}ms)`);
}

// ============================================================
// 🧰 دوال مساعدة عالية المستوى
// ============================================================

export function safeApi<T>(
  fn: () => Promise<T>,
  config: Omit<SafeExecutorConfig<T>, 'operationType'> = {}
): Promise<T | undefined> {
  return safeExecute(fn, {
    ...config,
    operationType: 'api',
    performanceThresholdMs: config.performanceThresholdMs || 2000,
  });
}

export function safeBackground<T>(
  fn: () => Promise<T>,
  config: Omit<SafeExecutorConfig<T>, 'operationType'> = {}
): Promise<T | undefined> {
  return safeExecute(fn, {
    ...config,
    operationType: 'background',
    performanceThresholdMs: config.performanceThresholdMs || 5000,
    retryCount: config.retryCount ?? 3,
  });
}

export function safeCron<T>(
  fn: () => Promise<T>,
  config: Omit<SafeExecutorConfig<T>, 'operationType'> = {}
): Promise<T | undefined> {
  return safeExecute(fn, {
    ...config,
    operationType: 'cron',
    performanceThresholdMs: config.performanceThresholdMs || 30000,
    retryCount: config.retryCount ?? 1,
    alertOnPerformance: true,
  });
}

export async function safeApiWithResult<T>(
  fn: () => Promise<T>,
  config: Omit<SafeExecutorConfig<T>, 'operationType'> = {}
): Promise<SafeResult<T>> {
  return safeExecuteWithResult(fn, {
    ...config,
    operationType: 'api',
  });
}

// ============================================================
// 🧪 دوال مساعدة للاختبار
// ============================================================

export function createTestFunction<T>(
  shouldSucceed: boolean,
  result?: T,
  errorMessage?: string,
  delayMs?: number
): () => Promise<T> {
  return async () => {
    if (delayMs) await sleep(delayMs);
    
    if (shouldSucceed) {
      if (result === undefined) {
        throw new Error('Result must be provided when shouldSucceed is true');
      }
      return result;
    }
    
    throw new Error(errorMessage || 'Test error');
  };
}

export function createFailingFunction<T>(
  failCount: number,
  successResult: T,
  errorMessage: string = 'Test error'
): () => Promise<T> {
  let attempts = 0;
  
  return async () => {
    attempts++;
    if (attempts <= failCount) {
      throw new Error(`${errorMessage} (attempt ${attempts})`);
    }
    return successResult;
  };
}