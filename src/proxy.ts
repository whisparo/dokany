// src/proxy.ts

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose'; // ✅ تثبيت jose: bun add jose
export const runtime = "edge";
// ============================================================
// 📌 المسارات العامة
// ============================================================
const PUBLIC_PREFIXES = ['/api/auth', '/api/webhooks', '/api/cron', '/api/telegram/webhook', '/_next', '/api/health'];
const PUBLIC_EXACTS = new Set(['/favicon.ico', '/']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACTS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ============================================================
// 🔐 دالة التحقق من JWT (باستخدام jose)
// ============================================================
async function verifyJWT(token: string): Promise<any> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret');
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// 🧠 دالة الـ Proxy الرئيسية
// ============================================================
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  // ✅ إضافة الـ Correlation ID إلى Headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  // استخراج الـ IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             '127.0.0.1';
  requestHeaders.set('x-client-ip', ip);

  // ✅ تمرير السياق عبر Headers
  requestHeaders.set('x-user-agent', request.headers.get('user-agent') || 'unknown');
  requestHeaders.set('x-start-time', String(startTime));
  requestHeaders.set('x-is-public', String(isPublicPath(pathname)));

  // ✅ فك الجلسة مباشرة (بدون طلب HTTP داخلي، وبدون AsyncLocalStorage)
  if (!isPublicPath(pathname)) {
    try {
      const cookie = request.headers.get('cookie') || '';
      const authHeader = request.headers.get('authorization') || '';

      // استخراج الـ token من الـ Cookie أو Authorization header
      const sessionToken = cookie.split(';').find(c => c.trim().startsWith('session='))?.split('=')[1]?.trim() ||
                           authHeader.replace('Bearer ', '').trim();

      if (sessionToken) {
        const payload = await verifyJWT(sessionToken);
        if (payload) {
          const userId = payload.userId || payload.sub;
          const merchantId = payload.merchantId;
          const role = payload.role;

          if (userId) {
            requestHeaders.set('x-user-id', userId);
            if (merchantId) requestHeaders.set('x-merchant-id', merchantId);
            if (role) requestHeaders.set('x-user-role', role);
          } else {
            return unauthorizedResponse();
          }
        } else {
          return unauthorizedResponse();
        }
      } else {
        return unauthorizedResponse();
      }
    } catch (error) {
      console.warn(`⚠️ [Proxy] Auth failed for ${pathname}:`, error);
      return unauthorizedResponse();
    }
  }

  // ✅ تنفيذ الطلب
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // ✅ توريث الـ Headers للـ Response
  response.headers.set('x-correlation-id', correlationId);
  const duration = Date.now() - startTime;
  response.headers.set('x-response-time', `${duration}ms`);

  // ✅ سجل خفيف (اختياري)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${correlationId}] ${request.method} ${pathname} - ${duration}ms - IP: ${ip}`);
  }

  return response;
}

// ============================================================
// 🛡️ دوال مساعدة
// ============================================================
function unauthorizedResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'AUTH_401: Unauthorized access' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

function generateCorrelationId(): string {
  return `pro-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

// ============================================================
// 📌 تصدير الـ Proxy و Config
// ============================================================
export default proxy;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)'],
};