// lib/errors/processing/classifier.ts
// الإصدار: 1.1.0
// الدور: تحويل الأخطاء الخام إلى SystemError موحد
// المبدأ: أي خطأ يدخل ← SystemError يخرج

import { SystemError, isSystemError, type ErrorSeverity, type ErrorCategory } from '../core/types';
import { getErrorCodeConfig, isValidErrorCode } from '../core/codes';
import { getContext, addBreadcrumb, type ErrorContext } from '../core/context';
import { sanitizeError } from '../core/sanitizer';

// ============================================================
// 📦 خيارات التصنيف
// ============================================================

export interface ClassifyOptions {
  /** كود الخطأ (إن كان معروفاً مسبقاً) */
  code?: string;
  /** الفئة (تستخدم إذا لم يتم العثور على الكود) */
  fallbackCategory?: ErrorCategory;
  /** درجة الخطورة (تستخدم إذا لم يتم العثور على الكود) */
  fallbackSeverity?: ErrorSeverity;
  /** رسالة المستخدم (تستخدم إذا لم يتم العثور على الكود) */
  fallbackUserMessage?: string;
  /** هل الخطأ قابل للمحاولة؟ (تستخدم إذا لم يتم العثور على الكود) */
  fallbackRetryable?: boolean;
  /** هل يجب إرسال تنبيه؟ (تستخدم إذا لم يتم العثور على الكود) */
  fallbackShouldAlert?: boolean;
  /** هل الخطأ صامت؟ (تستخدم إذا لم يتم العثور على الكود) */
  fallbackSilent?: boolean;
  /** كود HTTP (تستخدم إذا لم يتم العثور على الكود) */
  fallbackHttpStatus?: number;
  /** بيانات تعريفية إضافية */
  metadata?: Record<string, unknown>;
  /** السياق (إذا لم يُمرر، يُستخرج من AsyncLocalStorage) */
  context?: ErrorContext;
  /** هل يتم تنقية الـ cause؟ (افتراضي: true) */
  sanitizeCause?: boolean;
}

// ============================================================
// 🔍 المصنف الرئيسي
// ============================================================

/**
 * تصنيف أي خطأ إلى SystemError موحد
 */
export function classifyError(error: unknown, options: ClassifyOptions = {}): SystemError {
  // 1️⃣ استخراج السياق (من المعطى أو من AsyncLocalStorage)
  const context = options.context ?? getContext();

  // 2️⃣ حماية من تكرار تصنيف SystemError المعرف مسبقاً مع دمج الـ metadata وفك مرجعية الـ breadcrumbs
  if (isSystemError(error) && !options.code) {
    if (options.metadata) {
      return new SystemError({
        code: error.code,
        category: error.category,
        severity: error.severity,
        userMessage: error.userMessage,
        technicalMessage: error.technicalMessage,
        retryable: error.retryable,
        shouldAlert: error.shouldAlert,
        silent: error.silent,
        httpStatus: error.httpStatus,
        cause: error.cause,
        correlationId: error.correlationId,
        breadcrumbs: [...error.breadcrumbs],
        metadata: { ...error.metadata, ...options.metadata },
      });
    }
    return error;
  }

  // 3️⃣ محاولة استخراج الكود من الخيارات أو من الخطأ نفسه
  let code = options.code;
  
  if (!code && isSystemError(error)) {
    code = error.code;
  }
  
  if (!code && typeof error === 'object' && error !== null && 'code' in error) {
    const errorObj = error as Record<string, unknown>;
    const maybeCode = errorObj.code;
    if (typeof maybeCode === 'string' && isValidErrorCode(maybeCode)) {
      code = maybeCode;
    }
  }

  // 4️⃣ الحصول على تكوين الكود (إن وجد)
  const config = code ? getErrorCodeConfig(code) : undefined;

  // 5️⃣ بناء القيم النهائية
  const finalCode = config?.code ?? code ?? 'SYS_001';
  const finalCategory = config?.category ?? options.fallbackCategory ?? 'system';
  const finalSeverity = config?.severity ?? options.fallbackSeverity ?? 'critical';
  const finalUserMessage = config?.userMessage ?? options.fallbackUserMessage ?? 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.';
  const finalTechnicalMessage = config?.technicalMessage ?? extractTechnicalMessage(error);
  const finalRetryable = config?.retryable ?? options.fallbackRetryable ?? false;
  const finalShouldAlert = config?.shouldAlert ?? options.fallbackShouldAlert ?? true;
  const finalSilent = config?.silent ?? options.fallbackSilent ?? false;
  const finalHttpStatus = config?.httpStatus ?? options.fallbackHttpStatus ?? 500;

  // 6️⃣ جمع البيانات الوصفية
  const metadata = buildMetadata(error, options.metadata);

  // 7️⃣ تنقية الـ cause
  const sanitizedCause = options.sanitizeCause !== false 
    ? sanitizeCause(error) 
    : error;

  // 8️⃣ إضافة Breadcrumb للتصنيف
  addBreadcrumb(`Classified error: ${finalCode}`, {
    code: finalCode,
    severity: finalSeverity,
    category: finalCategory,
  });

  // 9️⃣ إنشاء SystemError مع نسخ أثر الـ Breadcrumbs لمنع تسرب المرجع مستقبلاً
  return new SystemError({
    code: finalCode,
    category: finalCategory,
    severity: finalSeverity,
    userMessage: finalUserMessage,
    technicalMessage: finalTechnicalMessage,
    retryable: finalRetryable,
    shouldAlert: finalShouldAlert,
    silent: finalSilent,
    httpStatus: finalHttpStatus,
    cause: sanitizedCause,
    metadata,
    correlationId: context?.correlationId ?? 'unknown',
    breadcrumbs: context?.breadcrumbs ? [...context.breadcrumbs] : [],
  });
}
// ============================================================
// 🔧 Helper Functions (Private)
// ============================================================

function extractTechnicalMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }
  
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const errorObj = error as Record<string, unknown>;
    const message = errorObj.message;
    if (typeof message === 'string') {
      return message;
    }
  }
  
  return String(error);
}

function buildMetadata(
  error: unknown,
  additionalMetadata?: Record<string, unknown>
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...additionalMetadata };

  if (error instanceof Error) {
    metadata.errorName = error.name;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      const constructorName = error.constructor?.name;
      if (constructorName && constructorName !== 'Object') {
        metadata.errorType = constructorName;
      }
    } catch {
      // تجاهل الأخطاء
    }
  }

  if (isSystemError(error) && error.metadata) {
    metadata.originalMetadata = error.metadata;
  }

  return metadata;
}

function sanitizeCause(error: unknown): unknown {
  if (error === null || error === undefined) {
    return null;
  }

  if (error instanceof Error) {
    const causeObj: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const errorAny = error as unknown as Record<string, unknown>;
    if (errorAny.metadata && typeof errorAny.metadata === 'object') {
      try {
        causeObj.metadata = sanitizeError({ metadata: errorAny.metadata as Record<string, unknown> }).metadata;
      } catch {
        // تجاهل الأخطاء
      }
    }

    return causeObj;
  }

  if (typeof error === 'object') {
    try {
      return sanitizeError(error as { metadata?: Record<string, unknown>; cause?: unknown });
    } catch {
      return '[Unserializable Object]';
    }
  }

  return String(error);
}

// ============================================================
// 🎯 Convenience Functions
// ============================================================

export function classifyErrorWithCode(
  error: unknown,
  code: string,
  metadata?: Record<string, unknown>
): SystemError {
  return classifyError(error, { code, metadata });
}

export function classifySilent(
  error: unknown,
  code: string = 'SILENT_001',
  metadata?: Record<string, unknown>
): SystemError {
  return classifyError(error, { 
    code, 
    metadata,
    fallbackSilent: true,
    fallbackShouldAlert: false,
  });
}

export function classifyCritical(
  error: unknown,
  code: string = 'SYS_001',
  metadata?: Record<string, unknown>
): SystemError {
  return classifyError(error, { 
    code, 
    metadata,
    fallbackSeverity: 'critical',
    fallbackShouldAlert: true,
  });
}

// ============================================================
// 🛡️ Safe Extraction Functions
// ============================================================

export function getSafeUserMessage(error: unknown): string {
  const systemError = classifyError(error);
  return systemError.userMessage;
}

export function getSafeHttpStatus(error: unknown): number {
  const systemError = classifyError(error);
  return systemError.httpStatus;
}

export function getSafeErrorCode(error: unknown): string {
  const systemError = classifyError(error);
  return systemError.code;
}

export function getSafeErrorResponse(error: unknown): {
  success: false;
  error: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
  };
} {
  const systemError = classifyError(error);
  return {
    success: false,
    error: {
      code: systemError.code,
      message: systemError.userMessage,
      status: systemError.httpStatus,
      retryable: systemError.retryable,
    },
  };
}

// ============================================================
// 🔍 Error Type Guards
// ============================================================

export function isD1Error(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.category === 'database';
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('d1') || msg.includes('sqlite') || msg.includes('database');
  }
  return false;
}

export function isRateLimitError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.category === 'security' && (
      error.code.startsWith('RATE_') || 
      error.code.startsWith('SEC_001') || 
      error.code.startsWith('SEC_002')
    );
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429');
  }
  return false;
}

export function isValidationError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.category === 'validation';
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('validation') || msg.includes('invalid') || msg.includes('zod');
  }
  return false;
}

export function isAuthError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.category === 'security' && error.code.startsWith('AUTH_');
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('unauthorized') || msg.includes('401') || msg.includes('jwt');
  }
  return false;
}

export function isSilentError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.silent || error.isSilent();
  }
  return false;
}

export function isCriticalError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.severity === 'critical' || error.isCritical();
  }
  return false;
}

export function isRetryableError(error: unknown): boolean {
  if (isSystemError(error)) {
    return error.retryable || error.isRetryable();
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused');
  }
  return false;
}