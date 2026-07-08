// lib/errors/classifier.ts

/**
 * ============================================================
 * 🧠 المُصنِّف الرئيسي (Classifier)
 * الإصدار: 8.3 (المُلمع للـ Edge والأداء الصاروخي)
 * ============================================================
 */

import {
  SystemError,
  type ErrorContext,
  type ErrorSeverity,
  type ErrorCategory,
} from './types';

import {
  getErrorCodeDefinition,
  getUserMessage,
} from './codes';

interface ErrorCodePattern {
  pattern: RegExp;
  code: string;
  priority: number; // الأعلى = الأولوية في المطابقة
}

const ERROR_CODE_PATTERNS: ErrorCodePattern[] = [
  // 🛡️ أخطاء الأمان (أولوية قصوى)
  { pattern: /invalid token|expired token|token.*invalid/i, code: 'SEC_001', priority: 100 },
  { pattern: /unauthorized|forbidden|permission denied|access denied/i, code: 'SEC_002', priority: 95 },
  { pattern: /suspicious|brute.?force|account.*locked|blocked/i, code: 'SEC_003', priority: 90 },

  // 🏗️ أخطاء البنية التحتية
  { pattern: /r2.*error|r2.*failed|cloudflare r2/i, code: 'R2_001', priority: 85 },
  { pattern: /redis.*error|redis.*failed|redis.*timeout/i, code: 'REDIS_001', priority: 84 },
  { pattern: /qstash.*error|qstash.*failed/i, code: 'QSTASH_001', priority: 83 },
  { pattern: /telegram.*error|telegram.*failed|telegram.*timeout/i, code: 'TELEGRAM_001', priority: 82 },
  { pattern: /resend.*error|email.*failed|smtp.*error/i, code: 'EMAIL_001', priority: 81 },

  // 🔴 أخطاء قاعدة البيانات D1
  { pattern: /d1.*error|d1.*failed|d1.*timeout/i, code: 'DB_001', priority: 80 },
  { pattern: /sqlite.*error|database.*locked|database.*corrupt/i, code: 'DB_002', priority: 79 },
  { pattern: /sql.*syntax|sqlite.*constraint|foreign key/i, code: 'DB_003', priority: 78 },
  { pattern: /not found|no such record|record.*missing/i, code: 'DB_004', priority: 77 },
  { pattern: /database|sql|connection.*refused/i, code: 'DB_001', priority: 75 },

  // 🌐 أخطاء الشبكة
  { pattern: /fetch.*failed|fetch.*error|network.*error/i, code: 'NET_001', priority: 70 },
  { pattern: /econnrefused|econnreset|enotfound/i, code: 'NET_001', priority: 69 },
  { pattern: /etimedout|connection.*timeout|network.*timeout/i, code: 'NET_002', priority: 68 },
  { pattern: /network|fetch|connection/i, code: 'NET_001', priority: 65 },

  // ⚡ أخطاء الأداء
  { pattern: /slow.*query|query.*slow|performance.*degraded/i, code: 'PERF_003', priority: 60 },
  { pattern: /timeout|deadline.*exceeded/i, code: 'PERF_002', priority: 55 },
  { pattern: /performance|slow|latency/i, code: 'PERF_001', priority: 50 },

  // 🔐 أخطاء المصادقة
  { pattern: /magic.*link.*expired|link.*expired/i, code: 'AUTH_001', priority: 45 },
  { pattern: /session.*expired|jwt.*expired/i, code: 'AUTH_002', priority: 44 },
  { pattern: /pin.*invalid|backup.*pin.*wrong/i, code: 'AUTH_003', priority: 43 },

  // 💳 أخطاء البزنس والتجارة
  { pattern: /payment.*failed|payment.*error|pay.*declined/i, code: 'PAY_001', priority: 40 },
  { pattern: /duplicate.*payment|idempotency|payment.*repeated/i, code: 'PAY_002', priority: 39 },
  { pattern: /shipping.*error|shipping.*failed|calculate.*shipping/i, code: 'SHIP_001', priority: 38 },
  { pattern: /coupon.*invalid|coupon.*expired|coupon.*not.*found/i, code: 'BIZ_002', priority: 37 },
  { pattern: /insufficient.*balance|balance.*low|not.*enough.*credit/i, code: 'BIZ_003', priority: 36 },
  { pattern: /out.*of.*stock|stock.*unavailable|inventory.*empty/i, code: 'BIZ_004', priority: 35 },
  { pattern: /quota.*exceeded|plan.*limit|subscription.*expired|exceeded.*limit/i, code: 'BIZ_001', priority: 34 },

  // 🚦 أخطاء Rate Limiting
  { pattern: /rate.*limit|too.* many.*requests|throttl/i, code: 'RATE_001', priority: 30 },
  { pattern: /ip.*blocked|ip.*banned|blocked.*ip/i, code: 'RATE_002', priority: 29 },

  // 🖼️ أخطاء الوسائط
  { pattern: /cloudinary.*error|image.*processing.*failed|image.*upload.*failed/i, code: 'MEDIA_001', priority: 25 },
  { pattern: /image.*too.*large|file.*size.*exceeded|image.*invalid/i, code: 'MEDIA_002', priority: 24 },

  // 🔍 أخطاء البحث
  { pattern: /duckdb.*error|search.*failed|query.*failed/i, code: 'SEARCH_001', priority: 20 },

  // 🔌 أخطاء Webhook
  { pattern: /webhook.*error|webhook.*failed|webhook.*invalid/i, code: 'WEBHOOK_001', priority: 15 },

  // 🧩 أخطاء التحقق
  { pattern: /validation.*error|invalid.*input|invalid.*data/i, code: 'VAL_001', priority: 10 },
  { pattern: /required.*field|field.*required|missing.*field/i, code: 'VAL_002', priority: 9 },
  { pattern: /validation|required/i, code: 'VAL_001', priority: 8 },

  // ⚙️ الافتراضي
  { pattern: /.*/, code: 'SYS_001', priority: 0 },
];

/**
 * ⚡ تلميع 2026 للأداء المسلح:
 * ترتيب المصفوفة "مرة واحدة فقط عند إقلاع الملف" (AOT Optimization) 
 * بدلاً من إعادة ترتيبها مع كل أيرور يضرب السيرفر.
 */
const SORTED_ERROR_CODE_PATTERNS = Object.freeze(
  [...ERROR_CODE_PATTERNS].sort((a, b) => b.priority - a.priority)
);

// ============================================================
// 🧠 المُصنِّف الرئيسي (Classifier)
// ============================================================

export function classifyError(
  error: unknown,
  context?: Partial<ErrorContext>
): SystemError {
  if (error instanceof SystemError) {
    return error;
  }

  // 1. تفكيك الخطأ بدقة سريعة
  const { message, stack, cause } = extractErrorDetails(error);

  // 2. قراءة الكود المستنتج بصفر تكلفة ترنيب
  const code = inferErrorCode(message);

  // 3. سحب كائن الـ Definition من المعجم المركزي
  const definition = getErrorCodeDefinition(code);

  // 4. دمج الـ Metadata مع سياق الـ Multi-tenant
  const metadata: Record<string, unknown> = {
    ...context?.extras,
  };

  if (context) {
    if (context.storeId) metadata.storeId = context.storeId;
    if (context.merchantId) metadata.merchantId = context.merchantId;
    if (context.userId) metadata.userId = context.userId;
    if (context.path) metadata.path = context.path;
    if (context.method) metadata.method = context.method;
    if (context.ip) metadata.ip = context.ip;
    if (context.userAgent) metadata.userAgent = context.userAgent;
    if (context.breadcrumbs) metadata.breadcrumbs = context.breadcrumbs;
  }

  // 5. بناء كائن الخطأ النظيف المشتق من الـ Class الملمع
  return new SystemError({
    code,
    userMessage: definition?.userMessage || getUserMessage(code),
    category: definition?.category || inferCategory(message),
    severity: definition?.severity || inferSeverity(code),
    retryable: definition?.retryable ?? inferRetryable(message),
    shouldAlert: definition?.shouldAlert ?? (inferSeverity(code) !== 'info'),
    technicalMessage: message,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    cause,
  });
}

// ============================================================
// 🛠️ دوال مساعدة معززة للأداء (Internal Helpers)
// ============================================================

function extractErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  cause?: unknown;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return {
        message: obj.message,
        stack: typeof obj.stack === 'string' ? obj.stack : undefined,
        cause: obj.cause,
      };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }

  return { message: String(error) };
}

function inferErrorCode(message: string): string {
  // استخدام المصفوفة المرتبة والمحفوظة في الذاكرة مسبقاً لعثور لحظي وموفر
  for (let i = 0; i < SORTED_ERROR_CODE_PATTERNS.length; i++) {
    if (SORTED_ERROR_CODE_PATTERNS[i].pattern.test(message)) {
      return SORTED_ERROR_CODE_PATTERNS[i].code;
    }
  }
  return 'SYS_001';
}

function inferCategory(message: string): ErrorCategory {
  const lowerMessage = message.toLowerCase();

  if (/database|sql|d1|sqlite|r2/.test(lowerMessage)) return 'database';
  if (/network|fetch|connection|redis|telegram|resend|email/.test(lowerMessage)) return 'network';
  if (/performance|slow|timeout|latency/.test(lowerMessage)) return 'performance';
  if (/unauthorized|forbidden|permission|token|auth|security|suspicious/.test(lowerMessage)) return 'security';
  if (/validation|required|invalid.*input/.test(lowerMessage)) return 'validation';
  if (/subscription|plan|quota|coupon|payment|shipping|stock|balance/.test(lowerMessage)) return 'business';

  return 'system';
}

function inferSeverity(code: string): ErrorSeverity {
  const definition = getErrorCodeDefinition(code);
  if (definition) return definition.severity;

  if (code.startsWith('DB_') || code.startsWith('R2_') || code.startsWith('REDIS_')) return 'critical';
  if (code.startsWith('SEC_') && code !== 'SEC_001' && code !== 'SEC_002') return 'critical';
  if (code.startsWith('NET_') || code.startsWith('PERF_') || code.startsWith('BIZ_') || code.startsWith('PAY_') || code.startsWith('SHIP_')) return 'warning';
  if (code.startsWith('VAL_') || code.startsWith('AUTH_')) return 'info';

  return 'warning';
}

function inferRetryable(message: string): boolean {
  return /timeout|connection|network|fetch|econnrefused|etimedout|temporarily|retry/.test(message.toLowerCase());
}

// ============================================================
// 🧪 أدوات الـ Type Guards والـ Testing
// ============================================================

export function isSystemError(error: unknown): error is SystemError {
  return error instanceof SystemError;
}

export function ensureSystemError(
  error: unknown,
  context?: Partial<ErrorContext>
): SystemError {
  return error instanceof SystemError ? error : classifyError(error, context);
}