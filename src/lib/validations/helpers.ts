import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ أدوات التحقق المركزية – المعالجة الآمنة للأخطاء         ║
// ╚════════════════════════════════════════════════════════════╝

/**
 * قائمة الحقول الحساسة التي لا يجب أن تظهر أسماؤها للمستخدم.
 * تغطي الصيغ الأساسية. للصيغ المشتقة (جمع، snake_case)،
 * تُوسَّع القائمة حسب الحاجة أو تُعالج في الخدمة.
 */
const SENSITIVE_FIELDS = new Set([
  'password', 'passwords',
  'api_token', 'api_tokens',
  'admin_role', 'admin_roles',
  'secret', 'secrets',
  'token', 'tokens',
  'credentials',
]);

/**
 * تحويل مسار المصفوفة إلى صيغة مفهومة بالعربية.
 * مثال: ["items", 0, "name"] -> "items > العنصر 1 > name"
 */
function formatPath(path: (string | number)[]): string {
  const parts = path.map((p) => {
    if (typeof p === 'number') {
      return `العنصر ${p + 1}`;
    }
    return SENSITIVE_FIELDS.has(p) ? 'الحقل' : p;
  });
  return parts.join(' > ');
}

/**
 * خطأ تحقق موحد.
 * - `code` العام هو 'VALIDATION_ERROR'. للوصول إلى رمز أدق لكل حقل
 *   (مثل 'too_small', 'invalid_string')، راجع `error.errors[i].code` من Zod.
 * - يدعم `captureStackTrace` لتتبع الأخطاء في السجلات.
 * - يعرض رسائل مستخدم عربية بدون كشف تفاصيل حساسة.
 */
export class BrandoValidationError extends Error {
  public readonly errors: z.ZodIssue[];
  public readonly code = 'VALIDATION_ERROR';

  constructor(message: string, errors: z.ZodIssue[]) {
    super(message);
    this.name = 'BrandoValidationError';
    this.errors = errors;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** رسالة عربية قابلة للعرض للمستخدم النهائي */
  toUserMessage(): string {
    return this.errors
      .map((e) => {
        // تصفية أي رموز (symbols) من المسار قبل التمرير إلى formatPath
        const path = e.path.filter(
          (p): p is string | number => typeof p === 'string' || typeof p === 'number'
        );
        return `• ${formatPath(path)}: ${e.message}`;
      })
      .join('\n');
  }

  /** رسالة تقنية للمطورين (للسجلات) */
  toDevMessage(): string {
    return JSON.stringify(
      this.errors.map((e) => ({
        code: e.code,
        path: e.path,
        message: e.message,
      })),
      null,
      2
    );
  }
}

/**
 * تتحقق من المدخلات وترجع البيانات النظيفة أو ترمي BrandoValidationError.
 */
export function validateOrThrow<T extends z.ZodSchema>(
  schema: T,
  data: unknown,
  options?: {
    message?: string;
  }
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BrandoValidationError(
      options?.message || 'فشل التحقق من صحة المدخلات',
      result.error.issues
    );
  }
  return result.data;
}