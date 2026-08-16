// lib/errors/core/codes.ts
// الإصدار: 1.1.0
// الدور: سجل الأكواد الرسمي لنظام الأخطاء
// المبدأ: مصدر وحيد للحقيقة (Single Source of Truth) لجميع أكواد الأخطاء

import type { ErrorCodeConfig, ErrorCategory, ErrorSeverity } from './types';

/**
 * 📋 سجل الأكواد الرسمي
 * 
 * التصنيف:
 * - DB_xxx:   أخطاء قاعدة البيانات (Database)
 * - BIZ_xxx:  أخطاء منطق الأعمال (Business Logic)
 * - SYS_xxx:  أخطاء نظامية (System)
 * - SEC_xxx:  أخطاء أمنية والمصادقة (Security & Authentication)
 * - PERF_xxx: أخطاء الأداء (Performance)
 * - CACHE_xxx: أخطاء الكاش (Cache)
 * - INT_xxx:  أخطاء التكامل (Integration)
 * - VAL_xxx:  أخطاء التحقق (Validation)
 * - SILENT_xxx: أخطاء صامتة للتجميع
 */
export const ERROR_CODES: Record<string, ErrorCodeConfig> = {
  // ═══════════════════════════════════════════════════════════════
  // 🗄️  أخطاء قاعدة البيانات (DB_xxx)
  // ═══════════════════════════════════════════════════════════════
  DB_001: {
    code: 'DB_001',
    category: 'database',
    severity: 'critical',
    userMessage: 'نواجه مشكلة في الاتصال بقاعدة البيانات حالياً، يرجى المحاولة لاحقاً.',
    technicalMessage: 'D1 database connection timeout or service unavailable',
    retryable: true,
    shouldAlert: true,
    httpStatus: 503,
  },
  DB_002: {
    code: 'DB_002',
    category: 'database',
    severity: 'warning',
    userMessage: 'حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.',
    technicalMessage: 'D1 write operation failed after multiple attempts',
    retryable: true,
    shouldAlert: true,
    httpStatus: 500,
  },
  DB_003: {
    code: 'DB_003',
    category: 'database',
    severity: 'warning',
    userMessage: 'حدث خطأ أثناء قراءة البيانات، يرجى تحديث الصفحة.',
    technicalMessage: 'D1 read operation failed',
    retryable: true,
    shouldAlert: false,
    httpStatus: 500,
  },
  DB_004: {
    code: 'DB_004',
    category: 'database',
    severity: 'critical',
    userMessage: 'فشل في تنفيذ المعاملة المطلوبة، يرجى المحاولة لاحقاً.',
    technicalMessage: 'D1 transaction failed with constraint violation or deadlock',
    retryable: true,
    shouldAlert: true,
    httpStatus: 500,
  },
  DB_005: {
    code: 'DB_005',
    category: 'database',
    severity: 'info',
    userMessage: 'تمت العملية بنجاح.',
    technicalMessage: 'Database operation completed successfully',
    retryable: false,
    shouldAlert: false,
    httpStatus: 200,
  },

  // ═══════════════════════════════════════════════════════════════
  // 💼  أخطاء منطق الأعمال (BIZ_xxx)
  // ═══════════════════════════════════════════════════════════════
  BIZ_001: {
    code: 'BIZ_001',
    category: 'business',
    severity: 'warning',
    userMessage: 'الكمية المطلوبة غير متوفرة حالياً في المخزن.',
    technicalMessage: 'Insufficient stock for requested product quantity',
    retryable: false,
    shouldAlert: false,
    httpStatus: 409,
  },
  BIZ_002: {
    code: 'BIZ_002',
    category: 'business',
    severity: 'warning',
    userMessage: 'هذا المنتج غير متاح للشراء حالياً.',
    technicalMessage: 'Product is not published or has been deleted',
    retryable: false,
    shouldAlert: false,
    httpStatus: 404,
  },
  BIZ_003: {
    code: 'BIZ_003',
    category: 'business',
    severity: 'warning',
    userMessage: 'تم تجاوز الحد الأقصى المسموح به لهذا العنصر.',
    technicalMessage: 'Maximum order quantity limit exceeded for this product',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },
  BIZ_004: {
    code: 'BIZ_004',
    category: 'business',
    severity: 'warning',
    userMessage: 'لا يمكن إتمام الطلب، السلة فارغة.',
    technicalMessage: 'Checkout attempted with empty cart',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },
  BIZ_005: {
    code: 'BIZ_005',
    category: 'business',
    severity: 'warning',
    userMessage: 'العميل غير موجود أو تم حذفه.',
    technicalMessage: 'Customer account not found or deleted',
    retryable: false,
    shouldAlert: false,
    httpStatus: 404,
  },
  BIZ_006: {
    code: 'BIZ_006',
    category: 'business',
    severity: 'warning',
    userMessage: 'المتجر غير موجود أو غير نشط.',
    technicalMessage: 'Store not found or inactive',
    retryable: false,
    shouldAlert: false,
    httpStatus: 404,
  },
  BIZ_007: {
    code: 'BIZ_007',
    category: 'business',
    severity: 'info',
    userMessage: 'تم إنشاء الطلب بنجاح.',
    technicalMessage: 'Order created successfully',
    retryable: false,
    shouldAlert: false,
    httpStatus: 201,
  },
  BIZ_008: {
    code: 'BIZ_008',
    category: 'business',
    severity: 'warning',
    userMessage: 'لا يمكن تعديل هذا الطلب لأنه قيد المعالجة بالفعل.',
    technicalMessage: 'Order is already in processing state',
    retryable: false,
    shouldAlert: false,
    httpStatus: 409,
  },

  // ═══════════════════════════════════════════════════════════════
  // ⚙️  أخطاء نظامية (SYS_xxx)
  // ═══════════════════════════════════════════════════════════════
  SYS_001: {
    code: 'SYS_001',
    category: 'system',
    severity: 'critical',
    userMessage: 'حدث خطأ غير متوقع في النظام، يرجى المحاولة لاحقاً.',
    technicalMessage: 'Unexpected system error - requires investigation',
    retryable: false,
    shouldAlert: true,
    httpStatus: 500,
  },
  SYS_002: {
    code: 'SYS_002',
    category: 'system',
    severity: 'warning',
    userMessage: 'حدث تأخير في معالجة طلبك، يرجى الانتظار قليلاً.',
    technicalMessage: 'System overload or high latency detected',
    retryable: true,
    shouldAlert: true,
    httpStatus: 503,
  },
  SYS_003: {
    code: 'SYS_003',
    category: 'system',
    severity: 'critical',
    userMessage: 'تعذر معالجة الطلب بسبب مشكلة داخلية، يرجى المحاولة لاحقاً.',
    technicalMessage: 'Internal service error - see logs for details',
    retryable: false,
    shouldAlert: true,
    httpStatus: 500,
  },

  // ═══════════════════════════════════════════════════════════════
  // 🔐  أخطاء أمنية (SEC_xxx)
  // ═══════════════════════════════════════════════════════════════
  SEC_001: {
    code: 'SEC_001',
    category: 'security',
    severity: 'warning',
    userMessage: 'لقد تجاوزت عدد المحاولات المسموحة، يرجى الانتظار قليلاً.',
    technicalMessage: 'Rate limit exceeded for operation',
    retryable: false,
    shouldAlert: true,
    httpStatus: 429,
  },
  SEC_002: {
    code: 'SEC_002',
    category: 'security',
    severity: 'critical',
    userMessage: 'تم حظر طلبك مؤقتاً لحماية النظام.',
    technicalMessage: 'Security rate limiter rejected request - possible attack',
    retryable: false,
    shouldAlert: true,
    httpStatus: 429,
  },
  SEC_003: {
    code: 'SEC_003',
    category: 'security',
    severity: 'warning',
    userMessage: 'نشاط غير معتاد تم اكتشافه، يرجى التحقق من حسابك.',
    technicalMessage: 'Suspicious activity detected - possible unauthorized access',
    retryable: false,
    shouldAlert: true,
    httpStatus: 403,
  },

  // ═══════════════════════════════════════════════════════════════
  // 🔑  أخطاء المصادقة (AUTH_xxx)
  // ═══════════════════════════════════════════════════════════════
  AUTH_001: {
    code: 'AUTH_001',
    category: 'security',
    severity: 'warning',
    userMessage: 'جلسة الدخول منتهية، يرجى تسجيل الدخول مرة أخرى.',
    technicalMessage: 'JWT session expired or invalid',
    retryable: false,
    shouldAlert: true,
    httpStatus: 401,
  },
  AUTH_002: {
    code: 'AUTH_002',
    category: 'security',
    severity: 'warning',
    userMessage: 'بيانات الدخول غير صحيحة، يرجى المحاولة مرة أخرى.',
    technicalMessage: 'Invalid credentials provided',
    retryable: false,
    shouldAlert: false,
    httpStatus: 401,
  },
  AUTH_003: {
    code: 'AUTH_003',
    category: 'security',
    severity: 'warning',
    userMessage: 'صلاحيات غير كافية للوصول إلى هذا المورد.',
    technicalMessage: 'Insufficient permissions for resource access',
    retryable: false,
    shouldAlert: false,
    httpStatus: 403,
  },
  AUTH_004: {
    code: 'AUTH_004',
    category: 'security',
    severity: 'critical',
    userMessage: 'تم اكتشاف محاولة اختراق، تم قفل الحساب مؤقتاً.',
    technicalMessage: 'Multiple failed login attempts - account locked',
    retryable: false,
    shouldAlert: true,
    httpStatus: 403,
  },

  // ═══════════════════════════════════════════════════════════════
  // ⚡  أخطاء الأداء (PERF_xxx)
  // ═══════════════════════════════════════════════════════════════
  PERF_001: {
    code: 'PERF_001',
    category: 'performance',
    severity: 'warning',
    userMessage: 'نواجه بطئاً في الأداء حالياً، قد تستغرق العملية وقتاً أطول.',
    technicalMessage: 'API response time exceeded configured slow threshold',
    retryable: false,
    shouldAlert: true,
    httpStatus: 503,
  },
  PERF_002: {
    code: 'PERF_002',
    category: 'performance',
    severity: 'info',
    userMessage: 'تم رصد بطء طفيف في الأداء.',
    technicalMessage: 'Background task exceeded configured threshold',
    retryable: false,
    shouldAlert: false,
    silent: true,
    httpStatus: 200,
  },
  PERF_003: {
    code: 'PERF_003',
    category: 'performance',
    severity: 'critical',
    userMessage: 'تجاوز الطلب الحد الأقصى المسموح به للوقت، يرجى المحاولة لاحقاً.',
    technicalMessage: 'Critical timeout exceeded - operation aborted',
    retryable: true,
    shouldAlert: true,
    httpStatus: 504,
  },

  // ═══════════════════════════════════════════════════════════════
  // 🗂️  أخطاء الكاش (CACHE_xxx)
  // ═══════════════════════════════════════════════════════════════
  CACHE_001: {
    code: 'CACHE_001',
    category: 'cache',
    severity: 'info',
    userMessage: 'جاري تحديث البيانات، قد تظهر بعض المعلومات بشكل بطيء.',
    technicalMessage: 'Cache update failed, continuing with stale data',
    retryable: true,
    shouldAlert: false,
    silent: true,
    httpStatus: 200,
  },
  CACHE_002: {
    code: 'CACHE_002',
    category: 'cache',
    severity: 'warning',
    userMessage: 'تعذر تحديث البيانات المخزنة مؤقتاً، سيتم استخدام البيانات القديمة.',
    technicalMessage: 'Cache invalidation failed - stale data may be served',
    retryable: true,
    shouldAlert: false,
    silent: true,
    httpStatus: 200,
  },

  // ═══════════════════════════════════════════════════════════════
  // 🔗  أخطاء التكامل (INT_xxx)
  // ═══════════════════════════════════════════════════════════════
  INT_001: {
    code: 'INT_001',
    category: 'integration',
    severity: 'critical',
    userMessage: 'نواجه مشكلة في التواصل مع خدمة الدفع، يرجى المحاولة لاحقاً.',
    technicalMessage: 'Payment gateway connection timeout or unavailable',
    retryable: true,
    shouldAlert: true,
    httpStatus: 503,
  },
  INT_002: {
    code: 'INT_002',
    category: 'integration',
    severity: 'warning',
    userMessage: 'حدث خطأ في التواصل مع خدمة التوصيل، يرجى المحاولة مرة أخرى.',
    technicalMessage: 'Shipping service API returned an error',
    retryable: true,
    shouldAlert: true,
    httpStatus: 503,
  },
  INT_003: {
    code: 'INT_003',
    category: 'integration',
    severity: 'critical',
    userMessage: 'تعذر التواصل مع خدمة الإشعارات، سيتم إعادة المحاولة لاحقاً.',
    technicalMessage: 'Telegram bot API request failed',
    retryable: true,
    shouldAlert: true,
    httpStatus: 503,
  },
  INT_004: {
    code: 'INT_004',
    category: 'integration',
    severity: 'warning',
    userMessage: 'فشل في تحميل الملف، يرجى المحاولة مرة أخرى.',
    technicalMessage: 'B2 upload operation failed',
    retryable: true,
    shouldAlert: true,
    httpStatus: 500,
  },

  // ═══════════════════════════════════════════════════════════════
  // ✅  أخطاء التحقق (VAL_xxx)
  // ═══════════════════════════════════════════════════════════════
  VAL_001: {
    code: 'VAL_001',
    category: 'validation',
    severity: 'warning',
    userMessage: 'يوجد خطأ في البيانات المدخلة، يرجى تصحيحها والمحاولة مرة أخرى.',
    technicalMessage: 'Invalid input data provided',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },
  VAL_002: {
    code: 'VAL_002',
    category: 'validation',
    severity: 'warning',
    userMessage: 'البريد الإلكتروني غير صحيح، يرجى إدخال بريد إلكتروني صالح.',
    technicalMessage: 'Email format validation failed',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },
  VAL_003: {
    code: 'VAL_003',
    category: 'validation',
    severity: 'warning',
    userMessage: 'رقم الهاتف غير صحيح، يرجى إدخال رقم هاتف صالح.',
    technicalMessage: 'Phone number validation failed',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },
  VAL_004: {
    code: 'VAL_004',
    category: 'validation',
    severity: 'warning',
    userMessage: 'السعر المطلوب غير صالح، يرجى التحقق من القيمة المدخلة.',
    technicalMessage: 'Invalid price value provided',
    retryable: false,
    shouldAlert: false,
    httpStatus: 400,
  },

  // ═══════════════════════════════════════════════════════════════
  // 🔇  أخطاء صامتة (SILENT_xxx) - للتجميع والتحليل فقط
  // ═══════════════════════════════════════════════════════════════
  SILENT_001: {
    code: 'SILENT_001',
    category: 'system',
    severity: 'info',
    userMessage: '',
    technicalMessage: 'Silent system event logged for monitoring',
    retryable: false,
    shouldAlert: false,
    silent: true,
    httpStatus: 200,
  },
  SILENT_002: {
    code: 'SILENT_002',
    category: 'performance',
    severity: 'info',
    userMessage: '',
    technicalMessage: 'Silent performance metric recorded',
    retryable: false,
    shouldAlert: false,
    silent: true,
    httpStatus: 200,
  },
};

// ============================================================
// 🔍 Helper Functions
// ============================================================

/**
 * الحصول على تكوين كود الخطأ
 */
export function getErrorCodeConfig(code: string): ErrorCodeConfig | undefined {
  return ERROR_CODES[code];
}

/**
 * التحقق من صحة كود الخطأ
 */
export function isValidErrorCode(code: string): boolean {
  return code in ERROR_CODES;
}

/**
 * الحصول على قائمة بجميع الأكواد حسب الفئة
 */
export function getErrorCodesByCategory(category: ErrorCategory): string[] {
  return Object.keys(ERROR_CODES).filter(
    (code) => ERROR_CODES[code].category === category
  );
}

/**
 * الحصول على قائمة بجميع الأكواد حسب درجة الخطورة
 */
export function getErrorCodesBySeverity(severity: ErrorSeverity): string[] {
  return Object.keys(ERROR_CODES).filter(
    (code) => ERROR_CODES[code].severity === severity
  );
}

/**
 * الحصول على الأكواد الصامتة فقط
 */
export function getSilentErrorCodes(): string[] {
  return Object.keys(ERROR_CODES).filter(
    (code) => ERROR_CODES[code].silent === true
  );
}

/**
 * الحصول على الأكواد التي تتطلب تنبيهاً
 */
export function getAlertableErrorCodes(): string[] {
  return Object.keys(ERROR_CODES).filter(
    (code) => ERROR_CODES[code].shouldAlert === true
  );
}

/**
 * ✅ التحقق من تناسق تكوين كود الخطأ (Validation)
 * 
 * يُستخدم في الاختبارات أو عند بدء التشغيل للتأكد من أن كل الأكواد صحيحة
 */
export function validateErrorCodeConfig(code: string, config: ErrorCodeConfig): string[] {
  const errors: string[] = [];

  // التحقق من تطابق الـ code
  if (config.code !== code) {
    errors.push(`Code mismatch: key is '${code}' but config.code is '${config.code}'`);
  }

  // التحقق من userMessage (ما ينفعش يكون فارغ إلا لو silent)
  if (!config.silent && (!config.userMessage || config.userMessage.trim() === '')) {
    errors.push(`Non-silent error '${code}' must have a userMessage`);
  }

  // التحقق من technicalMessage
  if (!config.technicalMessage || config.technicalMessage.trim() === '') {
    errors.push(`Error '${code}' must have a technicalMessage`);
  }

  // التحقق من httpStatus
  if (config.httpStatus !== undefined) {
    if (config.httpStatus < 100 || config.httpStatus > 599) {
      errors.push(`Error '${code}' has invalid httpStatus: ${config.httpStatus}`);
    }
    // Critical errors ماينفعش يكونوا 2xx
    if (config.severity === 'critical' && config.httpStatus >= 200 && config.httpStatus < 300) {
      errors.push(`Critical error '${code}' should not have 2xx httpStatus`);
    }
  }

  // التحقق من silent + shouldAlert consistency
  if (config.silent && config.shouldAlert) {
    errors.push(`Error '${code}' is silent but shouldAlert is true (contradiction)`);
  }

  return errors;
}

/**
 * ✅ التحقق من جميع الأكواد (يُستخدم في الاختبارات)
 */
export function validateAllErrorCodes(): { valid: boolean; errors: Record<string, string[]> } {
  const allErrors: Record<string, string[]> = {};
  let isValid = true;

  for (const [code, config] of Object.entries(ERROR_CODES)) {
    const errors = validateErrorCodeConfig(code, config);
    if (errors.length > 0) {
      allErrors[code] = errors;
      isValid = false;
    }
  }

  return { valid: isValid, errors: allErrors };
}