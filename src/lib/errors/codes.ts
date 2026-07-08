// src/lib/errors/codes.ts

/**
 * ============================================================
 * 📋 سجل الأكواد المركزي لنظام الأخطاء الخالد
 * الإصدار: 8.2 (المُلمع والمُعتمد للـ Edge)
 * ============================================================
 */

import type {
  ErrorCodeDefinition,
  ErrorCategory,
  ErrorSeverity,
} from './types';
import { ErrorCodeDefinitionSchema } from './types';

// ============================================================
// 📚 سجل الأكواد الرئيسي (Registry)
// ============================================================

export const ERROR_CODES: Record<string, ErrorCodeDefinition> = {
  // 🔴 أخطاء قاعدة البيانات (Database)
  DB_001: {
    code: 'DB_001',
    userMessage: 'حدث عطل مؤقت في الاتصال بقاعدة البيانات، حاول مرة أخرى.',
    category: 'database',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },
  DB_002: {
    code: 'DB_002',
    userMessage: 'تعذر إنشاء الاتصال بقاعدة البيانات، يرجى المحاولة لاحقاً.',
    category: 'database',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },
  DB_003: {
    code: 'DB_003',
    userMessage: 'حدث خطأ في تنفيذ الاستعلام، يرجى مراجعة البيانات المدخلة.',
    category: 'database',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  DB_004: {
    code: 'DB_004',
    userMessage: 'تعذر العثور على السجل المطلوب في قاعدة البيانات.',
    category: 'database',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },

  // 💼 أخطاء منطق الأعمال (Business)
  BIZ_001: {
    code: 'BIZ_001',
    userMessage: 'لقد تجاوزت الحد الأقصى للمنتجات المسموح بها في باقتك الحالية.',
    category: 'business',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },
  BIZ_002: {
    code: 'BIZ_002',
    userMessage: 'عفواً، هذا الكوبون غير صالح أو منتهي الصلاحية.',
    category: 'business',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
  },
  BIZ_003: {
    code: 'BIZ_003',
    userMessage: 'الرصيد غير كافٍ لإتمام هذه العملية.',
    category: 'business',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },
  BIZ_004: {
    code: 'BIZ_004',
    userMessage: 'المخزون غير متوفر حالياً، حاول مرة أخرى لاحقاً.',
    category: 'business',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },

  // 🌐 أخطاء الشبكة (Network)
  NET_001: {
    code: 'NET_001',
    userMessage: 'تعذر الاتصال بالخدمة الخارجية، حاول مرة أخرى.',
    category: 'network',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },
  NET_002: {
    code: 'NET_002',
    userMessage: 'انتهت مهلة الاتصال بالخادم، يرجى المحاولة لاحقاً.',
    category: 'network',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },
  NET_003: {
    code: 'NET_003',
    userMessage: 'فشل في إرسال الإشعار، سيتم إعادة المحاولة تلقائياً.',
    category: 'network',
    severity: 'info',
    retryable: true,
    shouldAlert: false,
  },

  // ⚡ أخطاء الأداء (Performance)
  PERF_001: {
    code: 'PERF_001',
    userMessage: 'استغرقت العملية وقتاً أطول من المتوقع، تم إلغاؤها تلقائياً.',
    category: 'performance',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },
  PERF_002: {
    code: 'PERF_002',
    userMessage: 'تجاوز الطلب الحد الأقصى المسموح به لزمن الاستجابة.',
    category: 'performance',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  PERF_003: {
    code: 'PERF_003',
    userMessage: 'النظام يعاني من بطء شديد، يرجى المحاولة لاحقاً.',
    category: 'performance',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },

  // 🛡️ أخطاء الأمان (Security)
  SEC_001: {
    code: 'SEC_001',
    userMessage: 'جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى.',
    category: 'security',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  SEC_002: {
    code: 'SEC_002',
    userMessage: 'غير مصرح لك بالوصول إلى هذا المورد.',
    category: 'security',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  SEC_003: {
    code: 'SEC_003',
    userMessage: 'تم اكتشاف نشاط مشبوه، تم قفل الحساب مؤقتاً.',
    category: 'security',
    severity: 'critical',
    retryable: false,
    shouldAlert: true,
  },

  // 🧩 أخطاء التحقق (Validation)
  VAL_001: {
    code: 'VAL_001',
    userMessage: 'البيانات المدخلة غير صالحة، يرجى التحقق منها.',
    category: 'validation',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
  },
  VAL_002: {
    code: 'VAL_002',
    userMessage: 'حقل {field} مطلوب ولا يمكن تركه فارغاً.',
    category: 'validation',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
  },

  // ⚙️ أخطاء نظامية (System)
  SYS_001: {
    code: 'SYS_001',
    userMessage: 'حدث خطأ داخلي في النظام، يرجى المحاولة لاحقاً.',
    category: 'system',
    severity: 'critical',
    retryable: false,
    shouldAlert: true,
  },
  SYS_002: {
    code: 'SYS_002',
    userMessage: 'تعذر تحميل التكوين، يتم استخدام الإعدادات الافتراضية.',
    category: 'system',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },

  // 🏗️ أخطاء البنية التحتية (Infrastructure)
  R2_001: {
    code: 'R2_001',
    userMessage: 'تعذر تخزين البيانات، يرجى المحاولة لاحقاً.',
    category: 'system',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },
  REDIS_001: {
    code: 'REDIS_001',
    userMessage: 'تعذر الاتصال بخدمة التخزين المؤقت.',
    category: 'system',
    severity: 'critical',
    retryable: true,
    shouldAlert: true,
  },
  QSTASH_001: {
    code: 'QSTASH_001',
    userMessage: 'تعذر جدولة المهمة الخلفية، سيتم إعادة المحاولة.',
    category: 'system',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },
  TELEGRAM_001: {
    code: 'TELEGRAM_001',
    userMessage: 'تعذر إرسال الإشعار، سيتم إعادة المحاولة تلقائياً.',
    category: 'network',
    severity: 'warning',
    retryable: true,
    shouldAlert: false,
  },

  // 🔐 أخطاء المصادقة (Authentication)
  AUTH_001: {
    code: 'AUTH_001',
    userMessage: 'رابط الدخول منتهي الصلاحية، يرجى طلب رابط جديد.',
    category: 'security',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
  },
  AUTH_002: {
    code: 'AUTH_002',
    userMessage: 'جلسة منتهية الصلاحية، يرجى تسجيل الدخول مرة أخرى.',
    category: 'security',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  AUTH_003: {
    code: 'AUTH_003',
    userMessage: 'رمز الاحتياطي غير صحيح، تم قفل الحساب مؤقتاً.',
    category: 'security',
    severity: 'critical',
    retryable: false,
    shouldAlert: true,
  },

  // 💳 أخطاء التجارة (Commerce)
  PAY_001: {
    code: 'PAY_001',
    userMessage: 'fشلت عملية الدفع، يرجى المحاولة مرة أخرى.',
    category: 'business',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },
  PAY_002: {
    code: 'PAY_002',
    userMessage: 'تم اكتشاف محاولة دفع مكررة، تم تجاهلها.',
    category: 'business',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },
  SHIP_001: {
    code: 'SHIP_001',
    userMessage: 'تعذر حساب تكلفة الشحن، يرجى المحاولة لاحقاً.',
    category: 'network',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },

  // 📡 أخطاء المراقبة (Monitoring)
  MONITOR_001: {
    code: 'MONITOR_001',
    userMessage: 'النظام توقف عن العمل!',
    category: 'system',
    severity: 'critical',
    retryable: false,
    shouldAlert: true,
  },
  SLO_001: {
    code: 'SLO_001',
    userMessage: 'تم تجاوز ميزانية الأخطاء للشهر الحالي!',
    category: 'system',
    severity: 'critical',
    retryable: false,
    shouldAlert: true,
  },

  // 🖼️ أخطاء الوسائط (Media)
  MEDIA_001: {
    code: 'MEDIA_001',
    userMessage: 'تعذر معالجة الصورة، يرجى المحاولة لاحقاً.',
    category: 'system',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },
  MEDIA_002: {
    code: 'MEDIA_002',
    userMessage: 'حجم الصورة كبير جداً، يرجى استخدام صورة أصغر.',
    category: 'validation',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
  },

  // 📧 أخطاء البريد الإلكتروني (Email)
  EMAIL_001: {
    code: 'EMAIL_001',
    userMessage: 'تعذر إرسال البريد الإلكتروني، يرجى المحاولة لاحقاً.',
    category: 'network',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },

  // 🔍 أخطاء البحث (Search)
  SEARCH_001: {
    code: 'SEARCH_001',
    userMessage: 'تعذر تنفيذ البحث، يرجى المحاولة لاحقاً.',
    category: 'database',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },

  // 📝 أخطاء الأوديت (Audit)
  AUDIT_001: {
    code: 'AUDIT_001',
    userMessage: 'تعذر تسجيل الحدث، سيتم إعادة المحاولة.',
    category: 'system',
    severity: 'warning',
    retryable: true,
    shouldAlert: false,
  },

  // 🚦 أخطاء Rate Limiting
  RATE_001: {
    code: 'RATE_001',
    userMessage: 'تجاوزت الحد الأقصى للعمليات، يرجى الانتظار.',
    category: 'business',
    severity: 'warning',
    retryable: false,
    shouldAlert: false,
  },
  RATE_002: {
    code: 'RATE_002',
    userMessage: 'تم حظر عنوان IP مؤقتاً بسبب النشاط المشبوه.',
    category: 'security',
    severity: 'warning',
    retryable: false,
    shouldAlert: true,
  },

  // 🔌 أخطاء Webhook
  WEBHOOK_001: {
    code: 'WEBHOOK_001',
    userMessage: 'تعذر معالجة الطلب من الخدمة الخارجية.',
    category: 'network',
    severity: 'warning',
    retryable: true,
    shouldAlert: true,
  },
};

// ============================================================
// 🧠 دوال مساعدة معززة للـ Edge
// ============================================================

export function getErrorCodeDefinition(code: string): ErrorCodeDefinition | undefined {
  return ERROR_CODES[code];
}

export function isErrorCodeRegistered(code: string): boolean {
  return code in ERROR_CODES;
}

export function getUserMessage(code: string, fallback: string = 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.'): string {
  return ERROR_CODES[code]?.userMessage || fallback;
}

export function interpolateMessage(message: string, params: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

export function getErrorSeverity(code: string): ErrorSeverity {
  return ERROR_CODES[code]?.severity || 'info';
}

export function getErrorCategory(code: string): ErrorCategory {
  return ERROR_CODES[code]?.category || 'system';
}

export function isRetryableError(code: string): boolean {
  return ERROR_CODES[code]?.retryable || false;
}

export function shouldAlertError(code: string): boolean {
  return ERROR_CODES[code]?.shouldAlert || false;
}

export function getAllErrorCodes(): string[] {
  return Object.keys(ERROR_CODES);
}

export function getErrorCodesByCategory(category: ErrorCategory): string[] {
  return Object.entries(ERROR_CODES)
    .filter(([_, def]) => def.category === category)
    .map(([code]) => code);
}

export function getErrorCodesBySeverity(severity: ErrorSeverity): string[] {
  return Object.entries(ERROR_CODES)
    .filter(([_, def]) => def.severity === severity)
    .map(([code]) => code);
}

export function validateErrorCodeDefinition(definition: unknown): definition is ErrorCodeDefinition {
  return ErrorCodeDefinitionSchema.safeParse(definition).success;
}

export function createDynamicCode(prefix: string, id: string | number): string {
  const normalizedPrefix = prefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  const normalizedId = String(id).padStart(3, '0').slice(0, 3);
  return `${normalizedPrefix}_${normalizedId}`;
}

export function validateRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [key, definition] of Object.entries(ERROR_CODES)) {
    const result = ErrorCodeDefinitionSchema.safeParse(definition);
    if (!result.success) {
      errors.push(`❌ Invalid error code "${key}": ${result.error.message}`);
    }
    if (definition.code !== key) {
      errors.push(`❌ Key "${key}" does not match code "${definition.code}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ============================================================
// 📊 إحصائيات السجل الثابتة (Cached Static Statistics)
// ============================================================

export const ERROR_CODES_STATS = {
  total: Object.keys(ERROR_CODES).length,
  alertable: Object.values(ERROR_CODES).filter((c) => c.shouldAlert).length,
  retryable: Object.values(ERROR_CODES).filter((c) => c.retryable).length,
};