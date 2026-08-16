// lib/errors/core/sanitizer.ts
// الإصدار: 1.1.1
// الدور: تنقية البيانات الحساسة (GDPR & Security)
// المبدأ: حماية الخصوصية ومنع تسريب البيانات قبل التخزين أو التسجيل

// ============================================================
// 🔒 Sensitive Keys Storage & Lookup Optimization
// ============================================================

/**
 * قائمة بالمفاتيح الحساسة الصريحة
 * تُستخدم للبحث السريع بحجم تعقيد O(1)
 */
const SENSITIVE_KEYS_SET = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'secret',
  'cookie',
  'authorization',
  'auth',
  'credit_card',
  'card_number',
  'cvv',
  'cvc',
  'pin',
  'private_key',
  'api_key',
  'apikey',
  'bearer',
  'refresh_token',
  'access_token',
  'session_id',
  'sid',
  'stripe_signature',
]);

/**
 * التحقق من أن المفتاح حساس
 * ✅ محسّن: يحاول O(1) Exact Match أولاً، ثم يتفقد المقاطع الجزئية فقط عند الحاجة.
 */
function isSensitiveKey(key: string): boolean {
  if (!key) return false;

  const lowerKey = key.toLowerCase();
  
  // 1. Direct O(1) Lookup - الأسرع على الإطلاق
  if (SENSITIVE_KEYS_SET.has(lowerKey)) {
    return true;
  }

  // 2. Normalized O(1) Lookup (إزالة الشرطات والأرقام والرموز)
  const normalizedKey = lowerKey.replace(/[-_]/g, '');
  if (SENSITIVE_KEYS_SET.has(normalizedKey)) {
    return true;
  }

  // 3. Partial Match - كحل أخير إذا احتوى المفتاح على الكمة الحساسة كجزء منه
  for (const sensitiveKey of SENSITIVE_KEYS_SET) {
    if (lowerKey.includes(sensitiveKey)) {
      return true;
    }
  }

  return false;
}

// ============================================================
// 🎯 Core Sanitization
// ============================================================

/**
 * تنقية كائن أو مصفوفة من البيانات الحساسة (Deep Recursive Sanitization)
 * 
 * ✅ محمي من:
 * - Circular References (WeakSet)
 * - Stack Overflow (Max Depth Limit)
 * - Arrays Corruption (الحفاظ على المصفوفات كـ Arrays وليس Objects)
 * - Special Objects (Date, RegExp, Map, Set)
 */
export function sanitizeObject<T>(
  obj: T,
  options: {
    maxDepth?: number;
    visited?: WeakSet<object>;
  } = {}
): T {
  const { maxDepth = 10, visited = new WeakSet() } = options;

  // 1. القيم البدائية أو الـ null/undefined
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 2. حماية من الـ Stack Overflow (تجاوز العمق المسموح)
  if (maxDepth <= 0) {
    return '[Max Depth Exceeded]' as unknown as T;
  }

  // 3. حماية من الـ Circular References
  if (visited.has(obj as object)) {
    return '[Circular]' as unknown as T;
  }

  // 4. حماية الكائنات الخاصة (Date, RegExp)
  if (obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }

  // 5. معالجة الـ Map
  if (obj instanceof Map) {
    visited.add(obj);
    const sanitizedMap = new Map();
    for (const [key, value] of obj.entries()) {
      const stringKey = String(key);
      if (isSensitiveKey(stringKey)) {
        sanitizedMap.set(key, '[REDACTED]');
      } else {
        sanitizedMap.set(
          key,
          sanitizeObject(value, { maxDepth: maxDepth - 1, visited })
        );
      }
    }
    return sanitizedMap as unknown as T;
  }

  // 6. معالجة الـ Set
  if (obj instanceof Set) {
    visited.add(obj);
    const sanitizedSet = new Set();
    for (const value of obj.values()) {
      sanitizedSet.add(
        sanitizeObject(value, { maxDepth: maxDepth - 1, visited })
      );
    }
    return sanitizedSet as unknown as T;
  }

  // 7. معالجة المصفوفات (Arrays) - الحفاظ عليها كمصفوفة بدلاً من تحويلها لـ Object
  if (Array.isArray(obj)) {
    visited.add(obj);
    return obj.map((item) =>
      sanitizeObject(item, { maxDepth: maxDepth - 1, visited })
    ) as unknown as T;
  }

  // 8. إضافة الكائن للقائمة المزارة
  visited.add(obj as object);

  // 9. معالجة الكائنات العادية (Plain Objects)
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // إخفاء قيمة المفتاح الحساس
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    // تنقية القيم المتداخلة
    result[key] = sanitizeObject(value, {
      maxDepth: maxDepth - 1,
      visited,
    });
  }

  return result as T;
}

// ============================================================
// 🚨 Error Sanitization
// ============================================================

/**
 * تنقية كائن الخطأ المخصص أو العام قبل التخزين أو الإرسال
 */
export function sanitizeError<T extends {
  metadata?: Record<string, unknown>;
  cause?: unknown;
  stack?: string;
  message?: string;
}>(error: T): T {
  if (!error || typeof error !== 'object') return error;

  const sanitized = { ...error };

  // تنقية metadata
  if (sanitized.metadata && typeof sanitized.metadata === 'object') {
    sanitized.metadata = sanitizeObject(sanitized.metadata);
  }

  // تنقية cause
  if (sanitized.cause) {
    if (sanitized.cause instanceof Error) {
      const causeObj: Record<string, unknown> = {
        name: sanitized.cause.name,
        message: sanitizeMessage(sanitized.cause.message),
        stack: sanitized.cause.stack,
      };

      const causeAny = sanitized.cause as unknown as Record<string, unknown>;
      if (causeAny.metadata && typeof causeAny.metadata === 'object') {
        causeObj.metadata = sanitizeObject(causeAny.metadata as Record<string, unknown>);
      }

      sanitized.cause = causeObj;
    } else if (typeof sanitized.cause === 'object') {
      sanitized.cause = sanitizeObject(sanitized.cause as Record<string, unknown>);
    }
  }

  // تنقية message
  if (sanitized.message && typeof sanitized.message === 'string') {
    sanitized.message = sanitizeMessage(sanitized.message);
  }

  return sanitized;
}

// ============================================================
// 📝 Message Sanitization (Regex Masking)
// ============================================================

/**
 * تنقية النص المباشر للمقاطع والرموز الحساسة
 */
export function sanitizeMessage(message: string): string {
  if (!message || typeof message !== 'string') return message;

  let sanitized = message;

  // 1. إخفاء البكلمات السرية الموجودة داخل روابط Connection Strings (e.g. postgres://user:password@localhost:5432/db)
  sanitized = sanitized.replace(
    /([a-zA-Z0-9+.-]+:\/\/[^:]+:)([^@]+)(@)/g,
    '$1[PASSWORD_REDACTED]$3'
  );

  // 2. إخفاء الـ Bearer tokens
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    'Bearer [TOKEN_REDACTED]'
  );

  // 3. إخفاء الـ JWT Tokens (3 أجزاء تفصلها نقطة)
  sanitized = sanitized.replace(
    /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    '[JWT_REDACTED]'
  );

  // 4. إخفاء أرقام بطاقات الائتمان (13 إلى 19 رقم)
  sanitized = sanitized.replace(
    /\b(?:\d[ -]*?){13,19}\b/g,
    '[CARD_REDACTED]'
  );

  // 5. إخفاء مفاتيح Stripe / API Keys الشهيرة (e.g. sk_live_..., pk_test_...)
  sanitized = sanitized.replace(
    /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{10,}\b/g,
    '[API_KEY_REDACTED]'
  );

  return sanitized;
}

// ============================================================
// 🔍 Utility Functions
// ============================================================

export function sanitizeForLogging<T>(obj: T): T {
  return sanitizeObject(obj);
}

export function sanitizeForStorage<T>(obj: T): T {
  return sanitizeObject(obj);
}

/**
 * فحص سريعة لمعرفة ما إذا كان الكائن يحتوى على بيانات حساسة أم لا
 */
export function hasSensitiveData(
  obj: unknown,
  visited: WeakSet<object> = new WeakSet()
): boolean {
  if (!obj || typeof obj !== 'object') return false;

  if (visited.has(obj as object)) return false;
  visited.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.some((item) => hasSensitiveData(item, visited));
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) return true;

    if (value && typeof value === 'object') {
      if (hasSensitiveData(value, visited)) return true;
    }
  }

  return false;
}

// ============================================================
// 🧪 Testing Helpers
// ============================================================

export function getSensitiveKeys(): string[] {
  return Array.from(SENSITIVE_KEYS_SET);
}

export function addSensitiveKey(key: string): void {
  if (key && typeof key === 'string') {
    SENSITIVE_KEYS_SET.add(key.toLowerCase());
  }
}