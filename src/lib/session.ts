// src/lib/session.ts
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';

// ============================================================
// 📌 Constants
// ============================================================

const SESSION_COOKIE_NAME = 'session_id';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ============================================================
// 🔐 Session ID Management
// ============================================================

/**
 * فحص ما إذا كان الطلب يتم عبر HTTPS
 */
function isSecureContext(c: Context): boolean {
  const url = new URL(c.req.url);
  return url.protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
}

/**
 * استخراج أو إنشاء Session ID آمن
 */
export function generateSessionId(c: Context): string {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  // إذا وجد session صالح، أرجعه
  if (sessionId && sessionId.startsWith('sess_') && sessionId.length >= 40) {
    return sessionId;
  }

  // إنشاء session جديد
  const newSessionId = `sess_${crypto.randomUUID()}`;

  // ضبط الـ Cookie بـ Security Flags
  setCookie(c, SESSION_COOKIE_NAME, newSessionId, {
    path: '/',
    httpOnly: true, // منع الوصول من JavaScript
    secure: isSecureContext(c), // التأكد التلقائي من HTTPS على Edge
    sameSite: 'Lax', // حماية من CSRF
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return newSessionId;
}

/**
 * الحصول على Session ID بدون إنشاء واحد جديد
 */
export function getSessionId(c: Context): string | undefined {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionId && sessionId.startsWith('sess_') && sessionId.length >= 40) {
    return sessionId;
  }

  return undefined;
}

/**
 * حذف Session ID (Logout/Clear)
 */
export function clearSessionId(c: Context): void {
  setCookie(c, SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    secure: isSecureContext(c),
    sameSite: 'Lax',
    maxAge: 0,
  });
}