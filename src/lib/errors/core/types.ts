// lib/errors/core/types.ts

/**
 * 🎯 نظام الأخطاء — الأننوع والأنماط الأساسية (Core Types & SystemError Class)
 * 
 * هذا الملف يُعرّف الهيكل البنائي والنموذج القطعي لكائنات الأخطاء وفقاً للدستور v9.1.
 */

// ============================================================
// 📋 أنواع أساسية (Types)
// ============================================================

export type ErrorSeverity = 'info' | 'warning' | 'critical';

export type ErrorCategory =
  | 'database'
  | 'business'
  | 'system'
  | 'security'
  | 'performance'
  | 'cache'
  | 'integration'
  | 'validation';

// تم إضافة هذا النوع لمنع خطأ التصدير في ملف index.ts
export type ErrorContextData = Record<string, unknown>;

// ============================================================
// 🧵 سياق الخطأ (Error Context)
// ============================================================

export interface ErrorContext {
  correlationId: string;
  storeId?: string;
  userId?: string;
  breadcrumbs: string[];
  startTime: number;
  path?: string;
  method?: string;
  ip?: string;
}

// ============================================================
// 📋 إعدادات كود الخطأ (Error Code Config)
// ============================================================

export interface ErrorCodeConfig {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  userMessage: string;
  technicalMessage: string;
  retryable: boolean;
  shouldAlert: boolean;
  silent?: boolean;
  httpStatus?: number;
}

// ============================================================
// 🚨 SystemError — كلاس الخطأ الرئيسي
// ============================================================

export interface SystemErrorParams {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  userMessage: string;
  technicalMessage: string;
  retryable?: boolean;
  shouldAlert?: boolean;
  silent?: boolean;
  httpStatus?: number;
  cause?: unknown;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  storeId?: string; // Multi-tenant Support
  breadcrumbs?: readonly string[];
  sourceMap?: string;
}

export class SystemError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly userMessage: string;
  public readonly technicalMessage: string;
  public readonly retryable: boolean;
  public readonly shouldAlert: boolean;
  public readonly silent: boolean;
  public readonly httpStatus: number;
  public readonly cause?: unknown;
  public readonly metadata?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly correlationId: string;
  public readonly storeId?: string;
  public readonly breadcrumbs: readonly string[];
  public readonly sourceMap?: string;

  constructor(params: SystemErrorParams) {
    const technical = params.technicalMessage || 'Unknown error';
    super(technical);
    
    // ضبط المرجعية الوراثية الصحيحة لـ ES5/ES6 Transpilation
    Object.setPrototypeOf(this, SystemError.prototype);
    this.name = 'SystemError';

    // ✅ الحقول الأساسية
    this.code = params.code;
    this.category = params.category;
    this.severity = params.severity;
    this.userMessage = params.userMessage || 'حدث خطأ غير متوقع';
    this.technicalMessage = technical;
    this.timestamp = new Date();

    // ✅ Silent & Alert flags
    this.silent = params.silent ?? false;
    this.shouldAlert = params.shouldAlert ?? !this.silent;

    // ✅ باقي الحقول وقيم HTTP Status
    this.retryable = params.retryable ?? false;
    this.httpStatus = params.httpStatus ?? this.getDefaultHttpStatus(params.category, params.severity, params.code);
    this.cause = params.cause;
    this.metadata = params.metadata ? { ...params.metadata } : undefined;
    this.sourceMap = params.sourceMap;
    this.storeId = params.storeId;

    // ✅ Correlation ID مع دعم بيئات Edge آمن
    this.correlationId = params.correlationId || this.generateCorrelationId();

    // ✅ Breadcrumbs غير قابلة للتدفق وتجميد البيانات
    this.breadcrumbs = Object.freeze([...(params.breadcrumbs || [])]);

    // ✅ Stack Trace الآمن
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, SystemError);
    }
  }

  // ============================================================
  // 🔧 Helper Methods
  // ============================================================

  isSilent(): boolean {
    return this.silent || !this.shouldAlert;
  }

  isCritical(): boolean {
    return this.severity === 'critical';
  }

  isRetryable(): boolean {
    return this.retryable;
  }

  withMetadata(additional: Record<string, unknown>): SystemError {
    return new SystemError({
      code: this.code,
      category: this.category,
      severity: this.severity,
      userMessage: this.userMessage,
      technicalMessage: this.technicalMessage,
      retryable: this.retryable,
      shouldAlert: this.shouldAlert,
      silent: this.silent,
      httpStatus: this.httpStatus,
      cause: this.cause,
      metadata: { ...(this.metadata || {}), ...additional },
      correlationId: this.correlationId,
      storeId: this.storeId,
      breadcrumbs: [...this.breadcrumbs],
      sourceMap: this.sourceMap,
    });
  }

  // ============================================================
  // 🔄 Serialization (toJSON)
  // ============================================================

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      severity: this.severity,
      userMessage: this.userMessage,
      technicalMessage: this.technicalMessage,
      retryable: this.retryable,
      shouldAlert: this.shouldAlert,
      silent: this.silent,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      storeId: this.storeId,
      breadcrumbs: this.breadcrumbs,
      metadata: this.metadata,
      sourceMap: this.sourceMap,
      cause: this.serializeCause(this.cause),
      stack: this.stack,
    };
  }

  // ============================================================
  // 🔒 Private Helpers
  // ============================================================

  private generateCorrelationId(): string {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
      }
    } catch {
      // Fallback
    }
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private getDefaultHttpStatus(category: ErrorCategory, severity: ErrorSeverity, code: string): number {
    if (code.startsWith('RATE_')) return 429;
    if (category === 'validation') return 400;
    if (category === 'security') return severity === 'critical' ? 403 : 401;
    if (category === 'business') return 409;
    if (category === 'cache') return 500;
    return 500;
  }

  private serializeCause(cause: unknown): unknown {
    if (cause === null || cause === undefined) return null;

    if (cause instanceof Error) {
      return {
        name: cause.name,
        message: cause.message,
        stack: cause.stack,
      };
    }

    if (typeof cause === 'object') {
      try {
        return JSON.parse(JSON.stringify(cause));
      } catch {
        return '[Circular or Unserializable Object]';
      }
    }

    return String(cause);
  }
}

// ============================================================
// 🔍 Type Guards & Helpers (معالجة الأخطاء بأمان)
// ============================================================

/**
 * فحص ما إذا كان الكائن Instance حقيقي أو يحقق واجهة SystemError
 */
export function isSystemError(error: unknown): error is SystemError {
  return error instanceof SystemError;
}

/**
 * دالة مساعدة لاستخراج النص البرمجي للخطأ بأمان
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

/**
 * دالة مساعدة لاستخراج كود الخطأ بأمان
 */
export function getErrorCode(error: unknown, fallback = 'SYS_500'): string {
  if (isSystemError(error)) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return fallback;
}