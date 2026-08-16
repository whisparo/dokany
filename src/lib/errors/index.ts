// lib/errors/index.ts
// الإصدار: 1.0.1
// الدور: الواجهة الرسمية (Public API) لنظام الأخطاء
// المبدأ: تصدير نظيف ومركز لكل ما هو ضروري للاستخدام الخارجي

// ═══════════════════════════════════════════════════════════════
// 📦  الطبقة الأساسية (Core)
// ═══════════════════════════════════════════════════════════════

// الأنواع الأساسية
export {
  SystemError,
  isSystemError,
  getErrorMessage,
  getErrorCode,
  type ErrorSeverity,
  type ErrorCategory,
  type ErrorCodeConfig,
  type ErrorContextData,
} from './core/types';

// سجل الأكواد
export {
  ERROR_CODES,
  getErrorCodeConfig,
  isValidErrorCode,
  getErrorCodesByCategory,
  getErrorCodesBySeverity,
  getSilentErrorCodes,
  getAlertableErrorCodes,
} from './core/codes';

// ═══════════════════════════════════════════════════════════════
// 🌐 Context Management
// ═══════════════════════════════════════════════════════════════
export {
  runWithContext,
  getContext,
  addBreadcrumb,
  withBreadcrumb,
  updateContext,
  createNewContext,
  clearContext,
  mergeContexts,
  setupContextForRequest,
  getCorrelationId,
  hasActiveContext,
  getElapsedTime,
  isValidErrorContext,
  type ErrorContext,
  type ExplicitContext,
} from './core/context';

// تنقية البيانات الحساسة
export {
  sanitizeObject,
} from './core/sanitizer';

// ═══════════════════════════════════════════════════════════════
// ⚙️  طبقة المعالجة (Processing)
// ═══════════════════════════════════════════════════════════════

// تصنيف الأخطاء
export {
  classifyError,
  classifyErrorWithCode,
  classifySilent,
  getSafeUserMessage,
  getSafeHttpStatus,
  getSafeErrorCode,
  isD1Error,
  isRateLimitError,
  isValidationError,
  isSilentError,
  type ClassifyOptions,
} from './processing/classifier';

// المنفذ الآمن (Safe Executor)
export {
  safeExecute,
  withRetry,
  withFallback,
  tryOnce,
  shouldRetry,
  isTimeoutError,
  type SafeExecuteOptions,
} from './processing/safe-executor';

// حارس الأداء (Performance Sentry)
export {
  monitorPerformance,
  withPerformance,
  withCriticalPerformance,
  measureTime,
  getThresholdForRoute,
  setRouteThreshold,
  type MonitorOptions,
  type MonitorResult,
} from './processing/performance-sentry';

// ═══════════════════════════════════════════════════════════════
// 💾  طبقة التخزين (Storage)
// ═══════════════════════════════════════════════════════════════

// Backblaze B2
export {
  B2Store,
  createB2StoreFromEnv,
  type B2WriteOptions,
  type B2WriteResult,
  type B2ReadOptions,
  type B2ReadResult,
} from './storage/b2-store';

// ═══════════════════════════════════════════════════════════════
// 🧮  Redis Analytics & Counters
// ═══════════════════════════════════════════════════════════════

export {
  // Main Class & Factory
  ErrorCounter,
  createErrorCounterFromEnv,
  getRedisClient,

  // Key Generation Helpers
  createDailyCounterKey,
  createIncidentKey,
  createRecentErrorsKey,
  createErrorRateKey,

  // Types
  type RedisEnv,
  type RedisCounterOptions,
  type CounterUpdateResult,
  type RecentErrorEntry,
} from './storage/redis-counter';

// ═══════════════════════════════════════════════════════════════
// 📥  مدير قائمة الانتظار (Queue Manager)
// ═══════════════════════════════════════════════════════════════

export {
  // Main Class & Factory
  QueueManager,
  createQueueManager,

  // Convenience Functions
  enqueueErrorKey,
  dequeueErrorKey,
  dequeueErrorKeys,
  getQueueLength,

  // Types
  type QueueEnv,
  type QueueOptions,
  type QueueStats,
} from './storage/queue-manager';

// ═══════════════════════════════════════════════════════════════
// 🛡️  طبقة الحراس (Guards)
// ═══════════════════════════════════════════════════════════════

// Circuit Breaker
export {
  CircuitBreaker,
  getCircuitBreaker,
  withCircuitBreaker,
  resetAllCircuits,
  getAllCircuitStatuses,
  type CircuitBreakerConfig,
  type CircuitState,
  type CircuitStatus,
} from './guards/circuit-breaker';

// Rate Limiter
export {
  RateLimiter,
  getRateLimiter,
  checkRateLimit,
  peekRateLimit,
  resetRateLimit,
  withRateLimit,
  rateLimitMiddleware,
  type RateLimiterConfig,
  type RateLimitResult,
} from './guards/rate-limiter';

// Deduplicator (Incident Aggregation)
export {
  Deduplicator,
  getDeduplicator,
  recordError,
  getIncident,
  getActiveIncidents,
  resetIncident,
  withDeduplication,
  formatIncidentSummary,
  type DeduplicatorConfig,
  type IncidentData,
  type DeduplicationResult,
} from './guards/deduplicator';

// ═══════════════════════════════════════════════════════════════
// 📡  طبقة العملاء (Clients)
// ═══════════════════════════════════════════════════════════════

// Telegram Client
export {
  TelegramClient,
  createTelegramClientFromEnv,
  getTelegramClient,
  sendCriticalError,
  sendWarningError,
  sendDigestError,
  formatErrorForTelegram,
  formatIncidentSummary as formatTelegramIncident,
  type TelegramConfig,
  type TelegramChannel,
  type TelegramMessage,
  type TelegramSendResult,
  type TelegramInlineButton,
} from './clients/telegram';

// QStash Client
export {
  QStashClient,
  createQStashClientFromEnv,
  getQStashClient,
  publishToQStash,
  scheduleQStash,
  publishDelayedToQStash,
  cancelQStashSchedule,
  scheduleRetry,
  type QStashConfig,
  type QStashPublishOptions,
  type QStashPublishResult,
} from './clients/qstash';

// ═══════════════════════════════════════════════════════════════
// 🔄  طبقة المعالجة الخلفية (Background)
// ═══════════════════════════════════════════════════════════════

// معالج قائمة الانتظار
export {
  processErrorQueue,
  processErrorQueueHandler,
  reprocessFailedErrors,
  cleanupOldErrors,
  type ProcessorOptions,
  type BatchProcessResult,
  type ProcessedErrorResult,
} from './background/processor';

// ═══════════════════════════════════════════════════════════════
// 📊  التقرير اليومي للأخطاء الصامتة (Silent Errors Digest)
// ═══════════════════════════════════════════════════════════════

export {
  generateSilentDigest,
  silentDigestHandler,
  type SilentDigestOptions,
  type SilentDigestResult,
  type SilentCodeBreakdown,
} from './background/silent-digest';

// ═══════════════════════════════════════════════════════════════
// 🏥  طبقة الصحة (Health)
// ═══════════════════════════════════════════════════════════════

// مسار /ping
export {
  handlePing,
  pingResponse,
  pingLight,
  healthCheck,
  uptimeResponse,
  type PingResponse,
} from './health/ping';

// مسار /readiness
export {
  checkReadiness,
  readinessHandler,
  nextReadinessHandler,
  type ReadinessOptions,
  type ReadinessResponse,
  type ServiceCheck,
} from './health/readiness';

// ═══════════════════════════════════════════════════════════════
// ⚙️  طبقة الإعدادات (Config)
// ═══════════════════════════════════════════════════════════════

// عتبات الأداء
export {
  DEFAULT_THRESHOLDS,
  getThresholdForPath,
  getThresholdForPathWithInfo,
  getPathsByPrefix,
  getPathsByPriority,
  hasCustomThreshold,
  mergeThresholds,
  setThresholdForPath,
  removeThresholdForPath,
  getThresholdsJSON,
  getThresholdsSummary,
  type RouteThreshold,
  type PerformanceThresholdsConfig,
} from './config/thresholds';

// ═══════════════════════════════════════════════════════════════
// 🧩  الواجهة المبسطة للمستخدم النهائي (High-Level API)
// ═══════════════════════════════════════════════════════════════

import { addBreadcrumb } from './core/context';
import { classifyError } from './processing/classifier';
import { SystemError } from './core/types';
import { getAllCircuitStatuses, type CircuitStatus } from './guards/circuit-breaker';

/**
 * واجهة البيئة الخاصة بنظام Cloudflare / Next.js
 */
export interface SystemEnvironment {
  ENVIRONMENT?: string;
  DB?: unknown;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  B2_ENDPOINT?: string;
  B2_BUCKET_NAME?: string;
  B2_ACCESS_KEY_ID?: string;
  B2_SECRET_ACCESS_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  QSTASH_TOKEN?: string;
  [key: string]: unknown;
}

/**
 * وظيفة التهيئة الأساسية للنظام
 * يجب استدعاؤها مرة واحدة عند بدء التطبيق
 */
export async function initErrorSystem(env?: SystemEnvironment): Promise<void> {
  try {
    const environment =
      typeof process !== 'undefined' && process.env?.NODE_ENV
        ? process.env.NODE_ENV
        : env?.ENVIRONMENT || 'unknown';

    // إضافة Breadcrumb عام
    addBreadcrumb('Error system initialized', {
      version: '1.0.0',
      environment,
    });

    console.log('[ErrorSystem] ✅ Initialized successfully');
  } catch (error) {
    console.error('[ErrorSystem] ❌ Failed to initialize:', error);
  }
}

/**
 * التقاط خطأ وإرساله إلى النظام
 */
export function captureException(
  error: unknown,
  _env?: SystemEnvironment,
  context?: {
    storeId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    code?: string;
  }
): SystemError {
  const systemError = classifyError(error, {
    code: context?.code,
    metadata: {
      ...context?.metadata,
      storeId: context?.storeId,
      userId: context?.userId,
    },
  });

  addBreadcrumb(`Exception captured: ${systemError.code}`, {
    code: systemError.code,
    severity: systemError.severity,
    category: systemError.category,
  });

  console.error(`[ErrorSystem] ${systemError.code}: ${systemError.technicalMessage}`);

  return systemError;
}

/**
 * رسالة خطأ بسيطة
 */
export function captureMessage(
  message: string,
  _env?: SystemEnvironment,
  options?: {
    code?: string;
    storeId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): SystemError {
  const error = new Error(message);
  const systemError = classifyError(error, {
    code: options?.code || 'SYS_001',
    fallbackUserMessage: message,
    metadata: {
      ...options?.metadata,
      storeId: options?.storeId,
      userId: options?.userId,
      isCapturedMessage: true,
    },
  });

  addBreadcrumb(`Message captured: ${message}`, {
    code: systemError.code,
    severity: systemError.severity,
  });

  return systemError;
}

/**
 * تحويل أي خطأ إلى استجابة JSON موحدة (لـ API)
 */
export function toApiError(
  error: unknown,
  includeDetails: boolean = false
): {
  success: false;
  error: {
    code: string;
    message: string;
    status: number;
    timestamp: string;
    correlationId?: string;
    details?: Record<string, unknown>;
  };
} {
  const systemError = classifyError(error);
  const isDev =
    typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

  const response: {
    success: false;
    error: {
      code: string;
      message: string;
      status: number;
      timestamp: string;
      correlationId?: string;
      details?: Record<string, unknown>;
    };
  } = {
    success: false,
    error: {
      code: systemError.code,
      message: systemError.userMessage,
      status: systemError.httpStatus,
      timestamp: systemError.timestamp.toISOString(),
      correlationId: systemError.correlationId,
    },
  };

  if (includeDetails) {
    response.error.details = {
      technicalMessage: systemError.technicalMessage,
      category: systemError.category,
      severity: systemError.severity,
      metadata: systemError.metadata,
      ...(isDev ? { stack: systemError.stack } : {}),
    };
  }

  return response;
}

/**
 * الحصول على حالة النظام الحالية للتصحيح والتشخيص
 */
export async function getSystemStatus(env?: SystemEnvironment): Promise<{
  version: string;
  timestamp: string;
  env: {
    hasD1: boolean;
    hasRedis: boolean;
    hasB2: boolean;
    hasTelegram: boolean;
    hasQStash: boolean;
  };
  circuitStatuses: CircuitStatus[];
}> {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: {
      hasD1: !!env?.DB,
      hasRedis: !!(env?.UPSTASH_REDIS_REST_URL && env?.UPSTASH_REDIS_REST_TOKEN),
      hasB2: !!(
        env?.B2_ENDPOINT &&
        env?.B2_BUCKET_NAME &&
        env?.B2_ACCESS_KEY_ID &&
        env?.B2_SECRET_ACCESS_KEY
      ),
      hasTelegram: !!env?.TELEGRAM_BOT_TOKEN,
      hasQStash: !!env?.QSTASH_TOKEN,
    },
    circuitStatuses: await getAllCircuitStatuses(),
  };
}
// ═══════════════════════════════════════════════════════════════
// 📋  تصدير الإصدار والمعلومات العامة
// ═══════════════════════════════════════════════════════════════

export const VERSION = '1.0.0';
export const NAME = 'Dokany Error System';

export const SYSTEM_INFO = {
  name: NAME,
  version: VERSION,
  description: 'Proactive Error Management System for Cloudflare Edge',
  author: 'Dokany Team',
  license: 'MIT',
};

// ═══════════════════════════════════════════════════════════════
// 🏁  التصدير الافتراضي (Default Export)
// ═══════════════════════════════════════════════════════════════

import * as types from './core/types';
import * as codes from './core/codes';
import * as context from './core/context';
import * as sanitizer from './core/sanitizer';
import * as classifier from './processing/classifier';
import * as safeExecutor from './processing/safe-executor';
import * as performanceSentry from './processing/performance-sentry';
import * as b2Store from './storage/b2-store';
import * as redisCounter from './storage/redis-counter';
import * as queueManager from './storage/queue-manager';
import * as circuitBreaker from './guards/circuit-breaker';
import * as rateLimiter from './guards/rate-limiter';
import * as deduplicator from './guards/deduplicator';
import * as telegram from './clients/telegram';
import * as qstash from './clients/qstash';
import * as processor from './background/processor';
import * as silentDigest from './background/silent-digest';
import * as ping from './health/ping';
import * as readiness from './health/readiness';
import * as thresholds from './config/thresholds';

export default {
  // Core
  ...types,
  ...codes,
  ...context,
  ...sanitizer,

  // Processing
  ...classifier,
  ...safeExecutor,
  ...performanceSentry,

  // Storage
  ...b2Store,
  ...redisCounter,
  ...queueManager,

  // Guards
  ...circuitBreaker,
  ...rateLimiter,
  ...deduplicator,

  // Clients
  ...telegram,
  ...qstash,

  // Background
  ...processor,
  ...silentDigest,

  // Health
  ...ping,
  ...readiness,

  // Config
  ...thresholds,

  // High-level API
  initErrorSystem,
  captureException,
  captureMessage,
  toApiError,
  getSystemStatus,

  // Info
  VERSION,
  NAME,
  SYSTEM_INFO,
};