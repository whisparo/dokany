// lib/errors/processing/performance-sentry.ts
// الإصدار: 1.1.1
// الدور: حارس الأداء - رصد زمن التنفيذ وتوليد تنبيهات PERF_xxx
// المبدأ: قياس، تصنيف، تنبيه (بدون إعاقة التدفق الرئيسي)

import { SystemError } from '../core/types';
import { ERROR_CODES } from '../core/codes';
import { getContext, addBreadcrumb, type ErrorContext } from '../core/context';

// ============================================================
// 📊 Route Thresholds
// ============================================================

export interface RouteThreshold {
  /** المدة بالمللي ثانية التي إذا تجاوزها الطلب، يُعتبر "بطيئاً" (PERF_001) */
  slowThresholdMs: number;
  /** المدة بالمللي ثانية التي إذا تجاوزها الطلب، يُعتبر "حرجاً" (PERF_003) */
  criticalThresholdMs: number;
}

/**
 * العتبات الافتراضية للمسارات
 */
export const DEFAULT_ROUTE_THRESHOLDS: Record<string, RouteThreshold> = {
  // مسارات الدفع والمعاملات المالية (تتحمل وقتاً أطول)
  '/api/checkout': { slowThresholdMs: 2000, criticalThresholdMs: 3500 },
  '/api/orders': { slowThresholdMs: 800, criticalThresholdMs: 1500 },
  '/api/payments': { slowThresholdMs: 1500, criticalThresholdMs: 3000 },

  // مسارات البحث والتصفح (سريعة)
  '/api/search': { slowThresholdMs: 300, criticalThresholdMs: 800 },
  '/api/products': { slowThresholdMs: 400, criticalThresholdMs: 900 },
  '/api/categories': { slowThresholdMs: 300, criticalThresholdMs: 700 },

  // مسارات الصحة والمراقبة (سريعة جداً)
  '/api/health': { slowThresholdMs: 200, criticalThresholdMs: 500 },
  '/api/ping': { slowThresholdMs: 100, criticalThresholdMs: 300 },

  // مسارات المصادقة (متوسطة)
  '/api/auth': { slowThresholdMs: 500, criticalThresholdMs: 1200 },
  '/api/login': { slowThresholdMs: 600, criticalThresholdMs: 1500 },

  // المسار الافتراضي
  '*': { slowThresholdMs: 1000, criticalThresholdMs: 2000 },
};

/**
 * الحصول على العتبات المناسبة لمسار معين
 */
export function getThresholdForRoute(route: string): RouteThreshold {
  // 1. تطابق تام
  if (route in DEFAULT_ROUTE_THRESHOLDS) {
    return DEFAULT_ROUTE_THRESHOLDS[route];
  }

  // 2. تطابق بادئة (أطول بادئة تطابق)
  const matchedKey = Object.keys(DEFAULT_ROUTE_THRESHOLDS)
    .filter((key) => key !== '*' && route.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedKey) {
    return DEFAULT_ROUTE_THRESHOLDS[matchedKey];
  }

  // 3. العتبة الافتراضية
  return DEFAULT_ROUTE_THRESHOLDS['*'] ?? { slowThresholdMs: 1000, criticalThresholdMs: 2000 };
}

/**
 * تحديث أو إضافة عتبات مخصصة
 */
export function setRouteThreshold(route: string, threshold: RouteThreshold): void {
  DEFAULT_ROUTE_THRESHOLDS[route] = threshold;
}

// ============================================================
// ⏱️ Performance Monitor
// ============================================================

export interface MonitorOptions {
  /** اسم العملية (للتوثيق) */
  operationName: string;
  /** مسار الطلب (لتحديد العتبات المناسبة) */
  route?: string;
  /** السياق (إذا لم يُمرر، يُستخرج من AsyncLocalStorage) */
  context?: ErrorContext;
  /** دالة تُستدعى عند تجاوز العتبة البطيئة (PERF_001) */
  onSlow?: (duration: number, threshold: RouteThreshold) => void;
  /** دالة تُستدعى عند تجاوز العتبة الحرجة (PERF_003) */
  onCritical?: (duration: number, threshold: RouteThreshold) => void;
  /** هل يجب رمي خطأ إذا تجاوزت العملية الحد الحرج؟ (افتراضي: false) */
  throwOnCritical?: boolean;
  /** دالة `waitUntil` لجدولة التنبيهات في الخلفية */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface MonitorResult<T> {
  /** نتيجة تنفيذ الدالة */
  result: T;
  /** مدة التنفيذ بالمللي ثانية */
  durationMs: number;
  /** العتبات المستخدمة */
  threshold: RouteThreshold;
  /** هل تجاوز العتبة البطيئة؟ */
  isSlow: boolean;
  /** هل تجاوز العتبة الحرجة؟ */
  isCritical: boolean;
  /** الكود الناتج عن التنبيه (إن وجد) */
  alertCode?: 'PERF_001' | 'PERF_003';
}

/**
 * تنفيذ دالة مع مراقبة الأداء
 */
export async function monitorPerformance<T>(
  fn: () => Promise<T>,
  options: MonitorOptions
): Promise<MonitorResult<T>> {
  const {
    operationName,
    route = '*',
    context = getContext(),
    onSlow,
    onCritical,
    throwOnCritical = false,
    waitUntil,
  } = options;

  // 1️⃣ الحصول على العتبات المناسبة
  const threshold = getThresholdForRoute(route);

  // 2️⃣ قياس وقت التنفيذ
  const startTime = performance.now();
  let result: T;
  let operationError: unknown = null;
  let isSuccess = false;

  try {
    result = await fn();
    isSuccess = true;
  } catch (err) {
    operationError = err;
    isSuccess = false;
  }

  const duration = performance.now() - startTime;

  // 3️⃣ تقييم الأداء
  const isSlow = duration > threshold.slowThresholdMs;
  const isCritical = duration > threshold.criticalThresholdMs;

  // 4️⃣ إضافة Breadcrumb
  addBreadcrumb(`Performance: ${operationName}`, {
    duration: Math.round(duration),
    route,
    isSlow,
    isCritical,
    success: isSuccess,
  });

  let alertCode: 'PERF_001' | 'PERF_003' | undefined;

  // 5️⃣ توليد التنبيهات المناسبة
  if (isCritical) {
    alertCode = 'PERF_003';
    const alert = createPerformanceAlert({
      code: 'PERF_003',
      operationName,
      route,
      duration,
      threshold,
      context,
      severity: 'critical',
      error: operationError,
    });
    
    scheduleAlert(alert, waitUntil);

    if (onCritical) {
      try {
        onCritical(duration, threshold);
      } catch (callbackError) {
        console.error('[Performance Sentry] onCritical callback failed:', callbackError);
      }
    }

    if (throwOnCritical && isSuccess) {
      throw alert;
    }
  } else if (isSlow) {
    alertCode = 'PERF_001';
    const alert = createPerformanceAlert({
      code: 'PERF_001',
      operationName,
      route,
      duration,
      threshold,
      context,
      severity: 'warning',
      error: operationError,
    });
    
    scheduleAlert(alert, waitUntil);

    if (onSlow) {
      try {
        onSlow(duration, threshold);
      } catch (callbackError) {
        console.error('[Performance Sentry] onSlow callback failed:', callbackError);
      }
    }
  }

  // 6️⃣ إذا كان هناك خطأ في العملية الأصلية، نرميه الآن
  if (!isSuccess && operationError) {
    throw operationError;
  }

  // 7️⃣ إرجاع النتيجة مع بيانات الأداء
  return {
    result: result!,
    durationMs: duration,
    threshold,
    isSlow,
    isCritical,
    alertCode,
  };
}

// ============================================================
// 📨 Performance Alert Creation
// ============================================================

interface PerformanceAlertData {
  code: 'PERF_001' | 'PERF_003';
  operationName: string;
  route: string;
  duration: number;
  threshold: RouteThreshold;
  context?: ErrorContext;
  severity: 'warning' | 'critical';
  error?: unknown;
}

/**
 * إنشاء تنبيه أداء (SystemError)
 */
function createPerformanceAlert(data: PerformanceAlertData): SystemError {
  const {
    code,
    operationName,
    route,
    duration,
    threshold,
    context,
    severity,
    error,
  } = data;

  const config = ERROR_CODES[code];
  
  const userMessage = config?.userMessage ?? (
    severity === 'critical'
      ? 'تجاوز الطلب الحد الأقصى المسموح به للوقت، يرجى المحاولة لاحقاً.'
      : 'نواجه بطئاً في الأداء حالياً، قد تستغرق العملية وقتاً أطول.'
  );

  const technicalMessage = `[${code}] ${operationName} on ${route} took ${Math.round(duration)}ms ` +
    `(slow: ${threshold.slowThresholdMs}ms, critical: ${threshold.criticalThresholdMs}ms)`;

  return new SystemError({
    code,
    category: 'performance',
    severity,
    userMessage,
    technicalMessage,
    retryable: severity === 'critical',
    shouldAlert: true,
    silent: false,
    httpStatus: severity === 'critical' ? 504 : 503,
    cause: error,
    metadata: {
      operationName,
      route,
      duration: Math.round(duration),
      slowThreshold: threshold.slowThresholdMs,
      criticalThreshold: threshold.criticalThresholdMs,
    },
    correlationId: context?.correlationId ?? 'unknown',
    breadcrumbs: context?.breadcrumbs ? [...context.breadcrumbs] : [],
  });
}

// ============================================================
// 📤 Alert Scheduling (Fire-and-Forget)
// ============================================================

function scheduleAlert(
  alert: SystemError, 
  waitUntil?: (promise: Promise<unknown>) => void
): void {
  const alertPromise = (async () => {
    try {
      if (alert.isCritical()) {
        console.error('[Performance Alert - CRITICAL]', {
          code: alert.code,
          message: alert.technicalMessage,
          metadata: alert.metadata,
          correlationId: alert.correlationId,
        });
      } else {
        console.warn('[Performance Alert - SLOW]', {
          code: alert.code,
          message: alert.technicalMessage,
          metadata: alert.metadata,
          correlationId: alert.correlationId,
        });
      }
    } catch (err) {
      console.error('[Performance Sentry] Failed to process alert:', err);
    }
  })();

  if (waitUntil) {
    waitUntil(alertPromise);
  }
}

// ============================================================
// 🛠️ Convenience Functions
// ============================================================

export async function withPerformance<T>(
  fn: () => Promise<T>,
  options: Omit<MonitorOptions, 'onSlow' | 'onCritical'>
): Promise<T> {
  const result = await monitorPerformance(fn, options);
  return result.result;
}

export async function withCriticalPerformance<T>(
  fn: () => Promise<T>,
  options: Omit<MonitorOptions, 'onSlow' | 'onCritical' | 'throwOnCritical'>
): Promise<T> {
  const result = await monitorPerformance(fn, {
    ...options,
    throwOnCritical: true,
  });
  return result.result;
}

export async function measureTime<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  if (label) {
    console.debug(`[Performance] ${label}: ${Math.round(duration)}ms`);
  }
  
  return { result, durationMs: duration };
}

export function measureTimeSync<T>(
  fn: () => T,
  label?: string
): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  if (label) {
    console.debug(`[Performance] ${label}: ${Math.round(duration)}ms`);
  }
  
  return { result, durationMs: duration };
}