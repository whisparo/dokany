// lib/errors/core/index.ts
// الإصدار: 1.1.0
// الدور: النقطة الموحدة لتصدير وحدة النواة (Core Unit Barrel Export)

// ═══════════════════════════════════════════════════════════════
// 1️⃣ الأنواع والكلاس الرئيسي (Types & SystemError)
// ═══════════════════════════════════════════════════════════════
export {
  SystemError,
  isSystemError,
  getErrorMessage,
  getErrorCode,
} from './types';

export type {
  ErrorSeverity,
  ErrorCategory,
  ErrorContextData,
  ErrorContext,
  ErrorCodeConfig,
  SystemErrorParams,
} from './types';

// ═══════════════════════════════════════════════════════════════
// 2️⃣ سجل الأكواد والدوال المساعدة (Error Codes)
// ═══════════════════════════════════════════════════════════════
export {
  ERROR_CODES,
  getErrorCodeConfig,
  isValidErrorCode,
  getErrorCodesByCategory,
  getErrorCodesBySeverity,
  getSilentErrorCodes,
  getAlertableErrorCodes,
  validateErrorCodeConfig,
  validateAllErrorCodes,
} from './codes';

// ═══════════════════════════════════════════════════════════════
// 3️⃣ إدارة السياق (Context & Breadcrumbs Management)
// ═══════════════════════════════════════════════════════════════
export {
  runWithContext,
  getContext,
  getCorrelationId,
  addBreadcrumb,
  withBreadcrumb,
  updateContext,
  createNewContext,
  clearContext,
  mergeContexts,
  setupContextForRequest,
  hasActiveContext,
  getElapsedTime,
  isValidErrorContext,
} from './context';

export type { ExplicitContext } from './context';

// ═══════════════════════════════════════════════════════════════
// 4️⃣ تنقية البيانات والحماية (Sanitizer)
// ═══════════════════════════════════════════════════════════════
export {
  sanitizeObject,
  sanitizeError,
  sanitizeMessage,
  sanitizeForLogging,
  sanitizeForStorage,
  hasSensitiveData,
  getSensitiveKeys,
  addSensitiveKey,
} from './sanitizer';