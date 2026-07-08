//src/proxy.ts (المهم حط الكود ده)

import { NextRequest, NextResponse } from 'next/server';
import { runWithContext, type RequestContext } from '@/lib/context';

export const runtime = 'edge';
// ============================================================
// 📌 الإعدادات والمسارات العامة (تستخدم Set لأداء أسرع O(1))
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

  // إعداد الـ Headers للطلب والـ الاستجابة
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  // استخراج الـ IP بدقة
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  requestHeaders.set('x-client-ip', ip);

  const userAgent = request.headers.get('user-agent') || 'unknown';
  const referer = request.headers.get('referer') || '';
  const method = request.method;

  let sessionData: { userId?: string; merchantId?: string; role?: string } = {};

  // جلب الجلسة للمسارات المحمية عبر الـ API مباشرة لتفادي الـ Node.js Drivers Node 
  // جلب الجلسة للمسارات المحمية عبر الـ API مباشرة
  if (!isPublicPath(pathname)) {
    try {
      const authUrl = new URL('/api/auth/get-session', request.url);
      const sessionRes = await fetch(authUrl.toString(), {
        headers: {
          cookie: request.headers.get('cookie') || '',
          authorization: request.headers.get('authorization') || '',
        },
      });

      if (sessionRes.ok) {
        // 💡 هنا التعديل: بنقول للـ TypeScript إن الـ JSON اللي راجع جواه كائن الـ user والبيانات بتاعته
        const session = (await sessionRes.json()) as {
          user?: {
            id: string;
            merchantId?: string | null;
            role?: string | null;
          };
        };
        
        if (session && session.user) {
          const user = session.user;
          
          sessionData = {
            userId: user.id,
            merchantId: user.merchantId || undefined,
            role: user.role || undefined,
          };

          requestHeaders.set('x-user-id', user.id);
          if (user.merchantId) requestHeaders.set('x-merchant-id', user.merchantId);
          if (user.role) requestHeaders.set('x-user-role', user.role);
        } else {
          return new NextResponse(
            JSON.stringify({ error: 'AUTH_401: Unauthorized access to protected resource' }), 
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new NextResponse(
          JSON.stringify({ error: 'AUTH_401: Unauthorized access to protected resource' }), 
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.warn(`⚠️ [Proxy] Session fetch failed for ${pathname}:`, error);
    }
  }

  // بناء سياق الـ AsyncLocalStorage
  const contextData: Partial<RequestContext> = {
    correlationId,
    userId: sessionData.userId,
    merchantId: sessionData.merchantId,
    path: pathname,
    ip,
    extras: { userAgent, referer, method, startTime, isPublic: isPublicPath(pathname) },
  };

  // تنفيذ الطلب داخل سياق الـ AsyncLocalStorage
  return runWithContext(contextData, () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // توريث الـ Headers للـ Response
    response.headers.set('x-correlation-id', correlationId);
    const duration = Date.now() - startTime;
    response.headers.set('x-response-time', `${duration}ms`);

    console.log(`[${correlationId}] ${method} ${pathname} ${response.status} - ${duration}ms - IP: ${ip}`);
    return response;
  });
}

// ============================================================
// 🧰 دوال مساعدة
// ============================================================
function generateCorrelationId(): string {
  return `pro-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export default proxy;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)'],
};