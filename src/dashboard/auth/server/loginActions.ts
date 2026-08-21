// src/features/auth/actions/login.actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { eq } from 'drizzle-orm';

import { safeExecute, SystemError } from '@/lib/errors';
import { getAppDb } from '@/lib/db/db';
import { users, stores } from '@/lib/db/schema';
import { loginSchema, type LoginInput } from '@/lib/validations/auth';

export async function loginAction(input: LoginInput): Promise<{
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}> {
  const validation = loginSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      message: 'بيانات غير صحيحة، يرجى التثبت من رقم الهاتف',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const { phone } = validation.data;

  return await safeExecute(async () => {
    // 🚀 استخدامgetAppDb الموحد لبيئة Cloudflare Edge
    const { db } = await getAppDb();

    const user = await db.query.users.findFirst({
      where: eq(users.phoneNumber, phone),
    });

    if (!user) {
      throw new SystemError({
        code: 'AUTH_USER_NOT_FOUND',
        userMessage: 'رقم الهاتف غير مسجل لدينا',
        technicalMessage: `Login attempt with non-existent phone: ${phone}`,
        category: 'business',
        severity: 'info',
        retryable: true,
        shouldAlert: false,
        metadata: { phone },
      });
    }

    if (user.status !== 'active') {
      throw new SystemError({
        code: 'AUTH_USER_INACTIVE',
        userMessage: 'حسابك غير نشط حالياً، يرجى التواصل مع الدعم',
        technicalMessage: `Inactive merchant login attempt: ${user.id}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { userId: user.id },
      });
    }

    const store = await db.query.stores.findFirst({
      where: eq(stores.ownerId, user.id),
    });

    if (!store) {
      throw new SystemError({
        code: 'AUTH_NO_ASSOCIATED_STORE',
        userMessage: 'لا يوجد متجر مرتبط بهذا الحساب',
        technicalMessage: `No store found for active merchant userId: ${user.id}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: true,
        metadata: { userId: user.id },
      });
    }

    const cookieStore = await cookies();

    cookieStore.set('session_user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('x-store-id', store.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    redirect('/ar/dashboard/overview');
  }).catch((error) => {
    if (isRedirectError(error)) {
      throw error;
    }
    return {
      success: false,
      message: error?.userMessage || 'حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة مجدداً',
    };
  });
}

export async function logoutAction(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.delete('session_user_id');
  cookieStore.delete('x-store-id');
  redirect('/ar/auth/login');
}