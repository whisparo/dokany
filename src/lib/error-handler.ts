// src/lib/error-handler.ts

import { SystemError } from '@/lib/errors/types';

/**
 * 🛠️ دالة موحدة لمعالجة واستخراج رسائل الأخطاء الموجهة للمستخدم في الـ Server Actions والـ UI
 */
export function handleActionError(error: unknown): string {
  if (error instanceof Error) {
    // 1️⃣ فحص أخطاء الـ Rate Limit القادمة بصيغة JSON
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.code === 'RATE_LIMITED') {
        const seconds = parsed.retryAfter || 60;
        const minutes = Math.ceil(seconds / 60);
        
        return seconds >= 60
          ? `لقد تجاوزت الحد المسموح. يرجى الانتظار لمدة ${minutes} دقيقة ثم المحاولة مجدداً.`
          : `لقد تجاوزت الحد المسموح. يرجى الانتظار لمدة ${seconds} ثانية ثم المحاولة مجدداً.`;
      }
    } catch {
      // ليس خطأ JSON، يستمر مع الفحوصات التالية
    }

    // 2️⃣ فحص أخطاء النظام المصنفة (SystemError) من الدستور
    if (error instanceof SystemError && error.userMessage) {
      return error.userMessage;
    }

    // 3️⃣ إذا كانت هناك رسالة عادية صريحة للخطأ
    if (error.message && !error.message.includes('{')) {
      return error.message;
    }
  }

  // 4️⃣ الرسالة الافتراضية العامة لحماية النظام من تسريب أي تفاصيل تقنية
  return 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.';
}