// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

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
// 🧠 دالة الـ Proxy الرئيسية
// ============================================================
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  // ✅ لو المسار عام، سيب الطلب يعدي من غير معالجة
  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  // باقي منطق الـ Proxy (المصادقة، إلخ)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  // ... باقي الكود (استخراج IP، فك JWT، إلخ) ...

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('x-response-time', `${Date.now() - startTime}ms`);

  return response;
}

function generateCorrelationId(): string {
  return `pro-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

// ✅ خلاص: مفيش export const config خالص
export default proxy;