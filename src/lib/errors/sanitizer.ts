// src/lib/errors/sanitizer.ts

/**
 * ============================================================
 * 🧹 المُنقي المركزي (Sanitizer)
 * الإصدار: 8.3 (المُلمع للـ Edge والأداء الصاروخي)
 * ============================================================
 */

import type { ErrorContext } from './types';

// ============================================================
// 🎯 الخيارات والإعدادات
// ============================================================

export interface SanitizeOptions {
  maskWith?: string;
  redactDeep?: boolean;
  additionalFields?: string[];
}

const MAX_TEXT_LENGTH = 10000;
const MAX_DEPTH = 5; // 🛡️ حماية الـ Edge من الـ Stack Overflow في الكائنات المتداخلة

// ============================================================
// 🔐 سجل الحقول الحساسة (Sensitive Fields Registry)
// ============================================================

const SENSITIVE_FIELDS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'apikey', 'api_key', 'token',
  'accesstoken', 'access_token', 'refreshtoken', 'refresh_token', 'jwt',
  'bearer', 'authorization', 'ssn', 'nationalid', 'national_id', 'passport',
  'creditcard', 'credit_card', 'cardnumber', 'card_number', 'cvv', 'cvc',
  'paymentmethod', 'payment_method', 'bankaccount', 'bank_account', 'iban',
  'swift', 'cookie', 'cookies', 'sessionid', 'session_id', 'session'
]);

/**
 * ⚡ تحسين Regex لعام 2026:
 * أنماط خطية ومحسنة تمنع الـ Catastrophic Backtracking في محركات V8
 */
const SENSITIVE_PATTERNS = Object.freeze([
  /(password|passwd|pwd|secret|api[_-]?key|token|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*(["']?)([^"'\s,}]+)\2/gi,
  /bearer\s+[a-zA-Z0-9\-_.]+/gi,
  /\b[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
  /cookie\s*[:=]\s*(["']?)([^"'\s,;]+)\1/gi,
]);

// ============================================================
// 🛠️ الدوال المساعدة (Internal Helpers)
// ============================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// ============================================================
// 🧹 المُنقي الرئيسي (Sanitizer)
// ============================================================

export function sanitizeContext(
  context: ErrorContext,
  options: SanitizeOptions = {}
): ErrorContext {
  const {
    maskWith = '[REDACTED]',
    redactDeep = true,
    additionalFields = [],
  } = options;

  // دمج الحقول الإضافية بكفاءة عالية بدون تكرار الـ Instance
  let sensitiveFields = SENSITIVE_FIELDS;
  if (additionalFields.length > 0) {
    sensitiveFields = new Set([...SENSITIVE_FIELDS]);
    for (let i = 0; i < additionalFields.length; i++) {
      sensitiveFields.add(additionalFields[i].toLowerCase());
    }
  }

  // تنقية الكائن بشكل آمن مع الحفاظ على الـ Immutability
  const sanitized = sanitizeObject(context, maskWith, redactDeep, 0, sensitiveFields) as ErrorContext;

  // تأمين وجود الحقول الأساسية لضمان سلامة الـ Multi-tenant والـ Tracking
  return {
    ...sanitized,
    correlationId: context.correlationId || 'unknown',
    storeId: context.storeId || 'unknown',
    breadcrumbs: sanitized.breadcrumbs || [],
  };
}

function sanitizeObject(
  obj: Record<string, unknown> | null | undefined,
  maskWith: string,
  redactDeep: boolean,
  currentDepth: number,
  sensitiveFields: Set<string>
): Record<string, unknown> {
  if (!obj || !isPlainObject(obj)) return {};
  if (currentDepth > MAX_DEPTH) return { [maskWith]: 'Max depth exceeded' };

  const result: Record<string, unknown> = {};
  const entries = Object.entries(obj);

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const lowerKey = key.toLowerCase();

    // 1. المفاتيح الحساسة المباشرة
    if (sensitiveFields.has(lowerKey)) {
      result[key] = maskWith;
      continue;
    }

    // 2. الكائنات المتداخلة
    if (isPlainObject(value)) {
      result[key] = redactDeep 
        ? sanitizeObject(value, maskWith, redactDeep, currentDepth + 1, sensitiveFields)
        : '[OBJECT_REDACTED]';
      continue;
    }

    // 3. النصوص
    if (typeof value === 'string') {
      result[key] = sanitizeText(value, maskWith);
      continue;
    }

    // 4. المصفوفات
    if (Array.isArray(value)) {
      result[key] = redactDeep 
        ? value.map((item) => {
            if (typeof item === 'string') return sanitizeText(item, maskWith);
            if (isPlainObject(item)) return sanitizeObject(item, maskWith, redactDeep, currentDepth + 1, sensitiveFields);
            return item;
          })
        : '[ARRAY_REDACTED]';
      continue;
    }

    // 5. باقي أنواع البيانات الآمنة (أرقام، قيم منطقية، إلخ)
    result[key] = value;
  }

  return result;
}

function sanitizeText(text: string | null | undefined, maskWith: string): string {
  if (!text || typeof text !== 'string') return '';

  // اقتطاع سريع للنصوص العملاقة لمنع انهيار الـ CPU
  let result = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + '... [TRUNCATED]'
    : text;

  // تنقية النصوص بالـ الأنماط المحمية
  for (let i = 0; i < SENSITIVE_PATTERNS.length; i++) {
    result = result.replace(SENSITIVE_PATTERNS[i], (match) => {
      // فحص سريع وموفر للـ Prefix بدون الحاجة لعمل مصفوفة مطابقة فرعية جديدة
      const lowerMatch = match.toLowerCase();
      if (
        lowerMatch.startsWith('password') || 
        lowerMatch.startsWith('secret') || 
        lowerMatch.startsWith('token') || 
        lowerMatch.startsWith('apikey') || 
        lowerMatch.startsWith('bearer') || 
        lowerMatch.startsWith('cookie') || 
        lowerMatch.startsWith('authorization')
      ) {
        const splitIndex = match.indexOf(':') !== -1 ? match.indexOf(':') : match.indexOf('=');
        if (splitIndex !== -1) {
          return `${match.slice(0, splitIndex + 1)} ${maskWith}`;
        }
        return `${match.split(/\s+/)[0]} ${maskWith}`;
      }
      return maskWith;
    });
  }

  return result;
}

// ============================================================
// 🎯 دوال الأمان الفولاذي والـ Safe Wrapping
// ============================================================

export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELDS.has(fieldName.toLowerCase());
}

export function sanitizeContextSafe(
  context: ErrorContext,
  options: SanitizeOptions = {}
): ErrorContext {
  try {
    return sanitizeContext(context, options);
  } catch (error) {
    // 🛡️ خط الدفاع الأخير: نرجع الكائن الأساسي بالمسارات الإلزامية لضمان سلامة الـ Type-Checking
    return {
      correlationId: context?.correlationId || 'unknown',
      storeId: context?.storeId || 'unknown',
      path: context?.path || 'unknown', // ✅ تمت إضافة الحقل الإلزامي هنا
      breadcrumbs: ['[SANITIZATION_FAILED_FALLBACK]'],
    };
  }
}