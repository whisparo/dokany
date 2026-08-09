// src/features/auth/actions/login.actions.ts
'use server';

import { enforceRateLimit } from '@/lib/rate-limit-client';
import { handleActionError } from '@/lib/error-handler';

export async function loginWithMagicLink(email: string) {
  try {
    // 🛡️ 1. تطبيق الحماية باستخدام استراتيجية magic_link (3 طلبات/ساعة لكل IP)
    await enforceRateLimit({
      action: 'magic_link',
    });

    // ... كود إرسال الـ magic link الخاص بك هنا ...

    return { success: true, message: 'تم إرسال رابط التسجيل إلى بريدك الإلكتروني' };

  } catch (err: unknown) {
    console.error('Magic Link Login Error:', err);

    // 🛠️ 2. معالجة موحدة لكل أنواع الأخطاء من خلال handleActionError
    return {
      success: false,
      error: handleActionError(err),
    };
  }
}