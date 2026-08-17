// lib/errors/processing/index.ts
// الإصدار: 1.1.0
// الدور: التصدير الموحد لوحدة معالجات الأخطاء والأداء والتنفيذ الآمن

export {
  classifyError,
  classifyErrorWithCode,
  classifySilent,
  classifyCritical,
  getSafeUserMessage,
  getSafeHttpStatus,
  getSafeErrorCode,
  getSafeErrorResponse,
  isD1Error,
  isRateLimitError,
  isValidationError,
  isAuthError,
  isSilentError,
  isCriticalError,
  isRetryableError,
  type ClassifyOptions,
} from './classifier';

export {
  monitorPerformance,
  getThresholdForRoute,
  setRouteThreshold,
  withPerformance,
  withCriticalPerformance,
  measureTime,
  measureTimeSync,
  type RouteThreshold,
  type MonitorOptions,
  type MonitorResult,
} from './performance-sentry';

export {
  safeExecute,
  withRetry,
  withFallback,
  tryOnce,
  withMonitoring,
  shouldRetry,
  isTimeoutError,
  isNetworkError,
  isDatabaseError,
  extractErrorInfo,
  type SafeExecuteOptions,
} from './safe-executor';