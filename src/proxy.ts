// src/proxy.ts

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ============================================================
// 📌 المسارات العامة (لا تحتاج مصادقة)
// ============================================================
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/webhooks',
  '/api/cron',
  '/api/telegram/webhook',
  '/_next',
  '/api/health',
];
const PUBLIC_EXACTS = new Set(['/favicon.ico', '/']);

/** التحقق مما إذا كان المسار عاماً */
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACTS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ============================================================
// 🔐 دالة التحقق من JWT (باستخدام jose)
// ============================================================
async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-change-me'
  );
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// 🧠 الـ Proxy الرئيسي
// ============================================================
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const startTime = performance.now();
  const correlationId = generateCorrelationId();

  // إنشاء Headers معدلة للطلب
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  // استخراج IP العميل
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  requestHeaders.set('x-client-ip', ip);

  requestHeaders.set('x-user-agent', request.headers.get('user-agent') || 'unknown');
  requestHeaders.set('x-start-time', String(startTime));
  requestHeaders.set('x-is-public', String(isPublicPath(pathname)));

  // ✅ للمسارات العامة: نمرر الطلب دون مصادقة مع إضافة الـ Headers
  if (isPublicPath(pathname)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  // ✅ للمسارات المحمية: التحقق من JWT
  try {
    const cookie = request.headers.get('cookie') || '';
    const authHeader = request.headers.get('authorization') || '';

    const sessionToken =
      cookie.split(';').find((c) => c.trim().startsWith('session='))?.split('=')[1]?.trim() ||
      authHeader.replace('Bearer ', '').trim();

    if (!sessionToken) {
      return unauthorizedResponse(correlationId);
    }

    const payload = await verifyJWT(sessionToken);
    if (!payload) {
      return unauthorizedResponse(correlationId);
    }

    // استخراج بيانات المستخدم
    const userId = (payload.userId || payload.sub) as string | undefined;
    const merchantId = payload.merchantId as string | undefined;
    const role = payload.role as string | undefined;

    if (!userId) {
      return unauthorizedResponse(correlationId);
    }

    // إضافة البيانات إلى الـ Headers ليستفيد منها باقي التطبيق
    requestHeaders.set('x-user-id', userId);
    if (merchantId) requestHeaders.set('x-merchant-id', merchantId);
    if (role) requestHeaders.set('x-user-role', role);
  } catch (error) {
    console.error(`❌ [Proxy] Auth error for ${pathname}:`, error);
    return unauthorizedResponse(correlationId);
  }

  // تمرير الطلب مع الـ Headers المعدلة
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-correlation-id', correlationId);

  // إضافة زمن الاستجابة (اختياري)
  const duration = performance.now() - startTime;
  response.headers.set('x-response-time', `${duration.toFixed(2)}ms`);

  // تسجيل الطلبات في بيئة التطوير فقط
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[${correlationId}] ${request.method} ${pathname} - ${duration.toFixed(2)}ms - IP: ${ip}`
    );
  }

  return response;
}

// ============================================================
// 🛡️ دوال مساعدة
// ============================================================

/** رد 401 مع رسالة موحدة */
function unauthorizedResponse(correlationId?: string): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: 'AUTH_401: Unauthorized access',
      correlationId,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      },
    }
  );
}

/** توليد معرف تتبع فريد */
function generateCorrelationId(): string {
  return `pro-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

// ✅ التصدير دون أي Route Segment Config (ممنوع في Next.js 16)
export default proxy;