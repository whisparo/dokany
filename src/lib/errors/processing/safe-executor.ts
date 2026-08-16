// lib/errors/processing/safe-executor.ts
// الإصدار: 1.1.1
// الدور: تنفيذ العمليات بأمان مع إعادة محاولة ذكية، مراقبة أداء، وقيمة افتراضية
// المبدأ: أي عملية تُنفذ، إما تنجح، أو تُعاد محاولتها، أو تسقط بقيمة افتراضية آمنة.

import { SystemError, isSystemError } from '../core/types';
import { classifyError } from './classifier';
import { monitorPerformance } from './performance-sentry';
import { addBreadcrumb, getContext, type ErrorContext } from '../core/context';

// ============================================================
// 📦 Safe Execute Options
// ============================================================

export interface SafeExecuteOptions<T> {
  /** اسم العملية (للتوثيق والتتبع) */
  operationName: string;

  /** مسار الطلب (لتطبيق عتبات الأداء المخصصة) */
  route?: string;

  /** عدد مرات إعادة المحاولة القصوى (افتراضي: 3) */
  maxRetries?: number;

  /** وقت الانتظار الأساسي بالمللي ثانية (يُضاعف مع كل محاولة) (افتراضي: 200ms) */
  backoffBaseMs?: number;

  /** القيمة الافتراضية في حال فشل جميع المحاولات (اختياري) */
  fallback?: T;

  /** دالة `waitUntil` لجدولة التنبيهات في الخلفية */
  waitUntil?: (promise: Promise<unknown>) => void;

  /** هل يجب تسجيل تنبيهات الأداء؟ (افتراضي: true) */
  enablePerformanceMonitoring?: boolean;

  /** كود خطأ مخصص للإخفاق النهائي (افتراضي: SYS_001) */
  finalFailureCode?: string;

  /** رسالة مستخدم مخصصة للإخفاق النهائي */
  finalFailureUserMessage?: string;

  /** السياق (إذا لم يُمرر، يُستخرج من AsyncLocalStorage) */
  context?: ErrorContext;

  /** دالة مخصصة لتحديد هل الخطأ قابل للمحاولة؟ (override للـ default) */
  shouldRetryFn?: (error: SystemError, attempt: number) => boolean;

  /** الحد الأقصى للتأخير بين المحاولات (افتراضي: 10000ms) */
  maxBackoffMs?: number;
}

// ============================================================
// 🛡️ Safe Executor (Main)
// ============================================================

/**
 * تنفيذ دالة بأمان مع إعادة محاولة ذكية، مراقبة أداء، وقيمة افتراضية
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  options: SafeExecuteOptions<T>
): Promise<T> {
  const {
    operationName,
    route = '*',
    maxRetries = 3,
    backoffBaseMs = 200,
    fallback,
    waitUntil,
    enablePerformanceMonitoring = true,
    finalFailureCode = 'SYS_001',
    finalFailureUserMessage = 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.',
    context = getContext(),
    shouldRetryFn,
    maxBackoffMs = 10000,
  } = options;

  // ============================================================
  // متغيرات التتبع
  // ============================================================
  let lastError: SystemError | null = null;
  let attempt = 0;
  const startTime = performance.now();

  // ============================================================
  // حلقة المحاولات (Retry Loop)
  // ============================================================
  while (attempt < maxRetries) {
    attempt++;

    // إضافة Breadcrumb للمحاولة
    addBreadcrumb(`Safe execution attempt ${attempt}/${maxRetries} - ${operationName}`, {
      attempt,
      maxRetries,
    });

    try {
      // ============================================================
      // تنفيذ الدالة (مع أو بدون مراقبة أداء)
      // ============================================================
      let result: T;

      if (enablePerformanceMonitoring) {
        const monitorResult = await monitorPerformance(fn, {
          operationName,
          route,
          context,
          waitUntil,
          throwOnCritical: false,
        });
        result = monitorResult.result;
      } else {
        result = await fn();
      }

      // ============================================================
      // نجاح العملية
      // ============================================================
      const totalDuration = performance.now() - startTime;
      addBreadcrumb(`✅ ${operationName} succeeded after ${attempt} attempt(s)`, {
        attempts: attempt,
        totalDuration: Math.round(totalDuration),
      });

      return result;
    } catch (error) {
      // ============================================================
      // فشل العملية - تصنيف الخطأ
      // ============================================================
      const systemError = classifyError(error, {
        context,
        metadata: {
          operationName,
          route,
          attempt,
          maxRetries,
        },
      });

      lastError = systemError;

      // ============================================================
      // التحقق من إمكانية إعادة المحاولة
      // ============================================================
      const canRetry = shouldRetryFn
        ? shouldRetryFn(systemError, attempt)
        : systemError.retryable && attempt < maxRetries;

      if (canRetry) {
        const delay = calculateBackoff(attempt, backoffBaseMs, maxBackoffMs);
        addBreadcrumb(`🔄 Retrying ${operationName} (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`, {
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          errorCode: systemError.code,
        });

        await sleep(delay);
        continue;
      }

      break;
    }
  }

  // ============================================================
  // فشل جميع المحاولات - التعامل مع الحالة النهائية
  // ============================================================

  const totalDuration = performance.now() - startTime;
  addBreadcrumb(`❌ ${operationName} failed after ${attempt} attempts`, {
    attempts: attempt,
    totalDuration: Math.round(totalDuration),
    lastErrorCode: lastError?.code,
  });

  if (fallback !== undefined) {
    addBreadcrumb(`⬇️ Using fallback for ${operationName}`, {
      fallbackType: typeof fallback,
    });
    return fallback;
  }

  if (lastError) {
    throw lastError;
  }

  throw new SystemError({
    code: finalFailureCode,
    category: 'system',
    severity: 'critical',
    userMessage: finalFailureUserMessage,
    technicalMessage: `Unknown failure in safeExecute for ${operationName} after ${maxRetries} attempts`,
    retryable: false,
    shouldAlert: true,
    httpStatus: 500,
    correlationId: context?.correlationId ?? 'unknown',
    breadcrumbs: context?.breadcrumbs ? [...context.breadcrumbs] : [],
    metadata: {
      operationName,
      route,
      attempts: attempt,
      totalDuration: Math.round(totalDuration),
    },
  });
}

// ============================================================
// 🧮 Helper Functions
// ============================================================

function calculateBackoff(attempt: number, baseMs: number, maxBackoffMs: number): number {
  const exponential = Math.pow(2, attempt - 1) * baseMs;
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxBackoffMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================
// 🛠️ Convenience Functions
// ============================================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Omit<SafeExecuteOptions<T>, 'fallback' | 'enablePerformanceMonitoring'>
): Promise<T> {
  return safeExecute(fn, {
    ...options,
    fallback: undefined,
    enablePerformanceMonitoring: false,
  });
}

export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: Omit<SafeExecuteOptions<T>, 'fallback' | 'maxRetries' | 'enablePerformanceMonitoring'>
): Promise<T> {
  return safeExecute(fn, {
    ...options,
    fallback,
    maxRetries: 1,
    enablePerformanceMonitoring: false,
  });
}

export async function tryOnce<T>(
  fn: () => Promise<T>,
  options: Omit<SafeExecuteOptions<T>, 'fallback' | 'maxRetries'>
): Promise<T> {
  return safeExecute(fn, {
    ...options,
    fallback: undefined,
    maxRetries: 1,
  });
}

export async function withMonitoring<T>(
  fn: () => Promise<T>,
  options: Omit<SafeExecuteOptions<T>, 'fallback' | 'maxRetries' | 'enablePerformanceMonitoring'>
): Promise<T> {
  return safeExecute(fn, {
    ...options,
    fallback: undefined,
    maxRetries: 1,
    enablePerformanceMonitoring: true,
  });
}

// ============================================================
// 🔍 Error Analysis Helpers
// ============================================================

export function shouldRetry(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.retryable;
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    );
  }
  
  return false;
}

export function isTimeoutError(error: unknown): boolean {
  if (isSystemError(error)) {
    return (
      error.code === 'DB_001' ||
      error.code === 'PERF_003' ||
      error.code === 'INT_001' ||
      error.code === 'SYS_002'
    );
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('etimedout')
    );
  }
  
  return false;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}

export function isDatabaseError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.category === 'database';
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('d1') ||
      msg.includes('sqlite') ||
      msg.includes('database') ||
      msg.includes('constraint') ||
      msg.includes('deadlock')
    );
  }
  
  return false;
}

export function extractErrorInfo(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  category: string;
  severity: string;
} {
  if (isSystemError(error)) {
    return {
      code: error.code,
      message: error.technicalMessage,
      retryable: error.retryable,
      category: error.category,
      severity: error.severity,
    };
  }
  
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      retryable: shouldRetry(error),
      category: 'unknown',
      severity: 'warning',
    };
  }
  
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    retryable: false,
    category: 'unknown',
    severity: 'info',
  };
}