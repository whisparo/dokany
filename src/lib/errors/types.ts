// src/lib/errors/types.ts

import { z } from 'zod';

// ============================================================
// 🎯 تصنيفات الخطأ الأساسية (Edge Optimized)
// ============================================================

export const ErrorSeveritySchema = z.enum(['critical', 'warning', 'info']);
export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

export const ErrorCategorySchema = z.enum([
  'database',
  'business',
  'network',
  'performance',
  'validation',
  'security',
  'system',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

// ============================================================
// 🌐 سياق الطلب المعزول (Multi-Tenant Context)
// ============================================================

export const ErrorContextSchema = z.object({
  correlationId: z.string().uuid().optional(), // اختياري لعدم ضرب السيستم في الأخطاء العامة خارج الـ Requests
  storeId: z.string().min(1), // إلزامي لعزل الحسابات الفوري في الـ Edge
  merchantId: z.string().optional(),
  userId: z.string().optional(),
  path: z.string().min(1).optional(), // اختياري للسماح برصد أخطاء الـ Worker Initialization
  method: z.string().max(7).optional(), 
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
  // استخدام .readonly() لحماية الـ Concurrency وثبات البيانات أثناء التنقل
  breadcrumbs: z.array(z.string()).max(20).readonly().optional(),
});

// تحويل السكيما إلى Type طبيعي مع جلب قيم الـ Readonly الحامية
export type ErrorContext = Readonly<z.infer<typeof ErrorContextSchema>>;

// ============================================================
// 📦 كلاس الخطأ الخالد الموحد (Native SystemError)
// ============================================================

export interface ISystemError {
  code: string;
  userMessage: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  shouldAlert: boolean;
  technicalMessage: string;
  metadata?: Record<string, unknown>;
  cause?: unknown;
  context?: ErrorContext; // 🚀 حقن رسمي للـ Context في الـ Interface
}

/**
 * 🚀 هندسة للـ Edge:
 * امتداد كامل للـ Error الأصلي لضمان التقاط الـ Stack Trace والـ Source Maps بالملي
 * دون استهلاك موارد الـ CPU في الفحص المتكرر لـ Zod أثناء الـ Runtime الحرج.
 */
export class SystemError extends Error implements ISystemError {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly shouldAlert: boolean;
  public readonly technicalMessage: string;
  public readonly metadata?: Record<string, unknown>;
  public readonly context?: ErrorContext; // 🚀 خاصية أصلية داخل الكلاس

  constructor(init: ISystemError) {
    super(init.technicalMessage, { cause: init.cause });
    
    this.name = 'SystemError';
    this.code = init.code;
    this.userMessage = init.userMessage;
    this.category = init.category;
    this.severity = init.severity;
    this.retryable = init.retryable;
    this.shouldAlert = init.shouldAlert;
    this.technicalMessage = init.technicalMessage;
    this.metadata = init.metadata;
    this.context = init.context; // 🚀 ربط الـ Context فوراً عند البناء

    // تثبيت الـ Stack Trace تلقائياً في V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SystemError);
    }
  }

  /**
   * تحويل كائن الخطأ إلى كائن JSON نظيف وجاهز للـ R2 أو تليجرام أو Redis
   */
  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      userMessage: this.userMessage,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      shouldAlert: this.shouldAlert,
      technicalMessage: this.technicalMessage,
      stack: this.stack,
      cause: this.cause ? String(this.cause) : undefined,
      metadata: this.metadata,
      context: this.context, // 🚀 يخرج تلقائياً مع تفاصيل الخطأ
    };
  }
}

// الـ Schema للتحقق الخلفي في الـ Dashboard والـ Background Processor
export const SystemErrorSchema = z.object({
  code: z.string().min(1),
  userMessage: z.string().min(1),
  category: ErrorCategorySchema,
  severity: ErrorSeveritySchema,
  retryable: z.boolean(),
  shouldAlert: z.boolean(),
  technicalMessage: z.string(),
  stack: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cause: z.unknown().optional(),
  context: ErrorContextSchema.optional(), // 🚀 تحديث السكيما لتدعم وجود الـ Context
});

// ============================================================
// 🔐 سجل الأكواد الحاكم (Registry Blueprint)
// ============================================================

export const ErrorCodeDefinitionSchema = z.object({
  code: z.string().regex(/^[A-Z]{2,4}_\d{3}$/), 
  userMessage: z.string(),
  category: ErrorCategorySchema,
  severity: ErrorSeveritySchema,
  retryable: z.boolean(),
  shouldAlert: z.boolean(),
});

export type ErrorCodeDefinition = z.infer<typeof ErrorCodeDefinitionSchema>;

// ============================================================
// ⚙️ تكوينات المُنفذ الآمن (Safe Executor Engines)
// ============================================================

export const OperationTypeSchema = z.enum(['api', 'background', 'cron']);
export type OperationType = z.infer<typeof OperationTypeSchema>;

export interface SafeExecutorConfig<T = unknown> {
  fallback?: T;
  retryCount?: number; 
  backoffFactor?: number; 
  context?: Partial<ErrorContext>;
  operationType?: OperationType;
  performanceThresholdMs?: number; 
}

// ============================================================
// 📦 هيكل خلود التخزين الفوري في R2
// ============================================================

export const StoredErrorSchema = z.object({
  id: z.string().uuid(),
  error: SystemErrorSchema,
  context: ErrorContextSchema,
  timestamp: z.number().int().positive(), 
  processed: z.boolean().default(false),
  retryCount: z.number().int().min(0).default(0),
  processingStartedAt: z.number().int().positive().optional(),
  processedAt: z.number().int().positive().optional(),
  failedAt: z.number().int().positive().optional(),
});

// 🚀 الحل السنيور: نضمن بقاء الـ Types نظيفة بنسبة 100% بدون أي Casting عشوائي في السيستم
export type StoredError = Omit<z.infer<typeof StoredErrorSchema>, 'error'> & {
  error: ISystemError;
};

// ============================================================
// 📤 هيكل الرسالة المُرسلة إلى تليجرام (المسار الفوري/المجمع)
// ============================================================

export const TelegramMessageSchema = z.object({
  title: z.string(),
  details: z.string(),
  code: z.string(),
  severity: ErrorSeveritySchema,
  correlationId: z.string().uuid(),
  storeId: z.string(),
  merchantId: z.string().optional(),
  path: z.string().optional(),
  aggregationCount: z.number().optional(), 
});

export type TelegramMessage = z.infer<typeof TelegramMessageSchema>;

// ============================================================
// 📊 هيكل الـ Metrics وعدادات Redis الاقتصادي
// ============================================================

export interface ErrorCounters {
  date: string; 
  [errorKey: string]: number | string; 
}

export interface ProcessedErrorResult {
  success: boolean;
  error?: ISystemError;
  failureReason?: string;
  sentToTelegram?: boolean;
}

// ============================================================
// 🧠 أسلحة الـ Incident Aggregation و تليجرام Protection
// ============================================================

export interface Incident {
  id: string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  storeId: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  sample: ISystemError;
  correlationIds: string[];
  resolved?: boolean;
  resolvedAt?: number;
}

// ============================================================
// 🔌 أسلحة الـ Circuit Breaker و الـ Rate Limiter 
// ============================================================

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; 
  resetTimeout: number; 
  monitoringPeriod: number; 
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt?: number;
  nextRetryAt?: number;
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string; 
}