// lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
});

/**
 * ✅ تسجيل الدخول عبر الـ Providers مع معالجة آمنة للأخطاء
 */
export async function signInWithProvider(providerId: string, body: Record<string, unknown>) {
  // استخدام fetch العادي للتحكم الكامل في الـ Request / Response لبيئة الـ Workers
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, ...body }),
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string } = {};
    try {
      errorData = await response.json();
    } catch {
      // في حال فشل الـ parsing للـ JSON تماماً
      throw new Error('SYS_500: Invalid response format from authentication server');
    }

    // هنا بنمرر الـ Error Code المركزي لو الـ Backend بيبعته، عشان الفرونت إند يتصرف على أساسه
    const errorMessage = errorData.error || 'Authentication process failed';
    const errorCode = errorData.code ? `${errorData.code}: ` : 'AUTH_400: ';
    
    throw new Error(`${errorCode}${errorMessage}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('SYS_500: Failed to parse authentication success payload');
  }
}

/**
 * ✅ تسجيل الخروج الآمن
 */
export async function signOut() {
  return authClient.signOut();
}