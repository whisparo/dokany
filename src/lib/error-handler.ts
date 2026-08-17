// src/lib/error-handler.ts

import { SystemError } from './errors';

interface RateLimitErrorPayload {
  code: string;
  retryAfter?: number;
}

/**
 * 🛠️ دالة موحدة لمعالجة واستخراج رسائل الأخطاء الموجهة للمستخدم في الـ Server Actions والـ UI
 */
export function handleActionError(error: unknown): string {
  // 1️⃣ أخطاء النظام المصنفة (SystemError) - أعلى أولوية
  if (error instanceof SystemError) {
    if (error.userMessage) {
      return error.userMessage;
    }
    return error.message;
  }

  if (error instanceof Error) {
    // 2️⃣ فحص أخطاء الـ Rate Limit القادمة بصيغة JSON String
    if (error.message.startsWith('{') && error.message.endsWith('}')) {
      try {
        const parsed = JSON.parse(error.message) as RateLimitErrorPayload;
        if (parsed.code === 'RATE_LIMITED') {
          const seconds = parsed.retryAfter || 60;
          const minutes = Math.ceil(seconds / 60);

          return seconds >= 60
            ? `لقد تجاوزت الحد المسموح. يرجى الانتظار لمدة ${minutes} دقيقة ثم المحاولة مجدداً.`
            : `لقد تجاوزت الحد المسموح. يرجى الانتظار لمدة ${seconds} ثانية ثم المحاولة مجدداً.`;
        }
      } catch {
        // إذا فشل الـ parse نستمر في الفحص العادي
      }
    }

    // 3️⃣ الرسائل المباشرة الواردة من أخطاء الـ Native أو الـ Throw المباشر
    if (error.message) {
      return error.message;
    }
  }

  // 4️⃣ التعامل مع الأخطاء التي تأتي كـ String مباشر
  if (typeof error === 'string') {
    return error;
  }

  // 5️⃣ الرسالة الافتراضية العامة لحماية النظام ومنع تسريب تفاصيل تقنية حساسه
  return 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.';
}