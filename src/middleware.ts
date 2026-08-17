// src/middleware.ts

/**
 * ============================================================
 * 🛡️ Middleware الموحد (Unified Middleware for Cloudflare Edge)
 * الإصدار: 5.5 (دمج إدارة السياق الأخطاء مع next-intl و JWT)
 * ============================================================
 */

import { NextResponse, NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { jwtVerify } from 'jose';

// 🛡️ استيراد دوال السياق من موديول الأخطاء
import { runWithContext, createNewContext } from '@/lib/errors/core';

// 🛡️ استيراد الـ Rate Limiter Client المربوط بالـ Cloudflare Worker
import { checkRateLimit } from '@/lib/rate-limit-client';

// ============================================================
// 📌 تكوينات next-intl
// ============================================================
const LOCALES = ['ar', 'en'] as const;
const DEFAULT_LOCALE = 'ar';

const i18nMiddleware = createMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false, // السيادة للعربية
});

// ============================================================
// 🛡️ المسارات المحمية وقواعد الوصول
// ============================================================
const PROTECTED_PATTERNS = [
  /^\/(ar|en)?\/dashboard(\/.*)?$/,
  /^\/(ar|en)?\/admin(\/.*)?$/,
];
const AUTH_PATTERNS = [/^\/(ar|en)?\/auth(\/.*)?$/];

// ============================================================
// 🧠 دالة التحقق من JWT (Edge-compatible)
// ============================================================
interface JWTPayload {
  merchant_id?: string;
  store_id?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

async function verifyJWT(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: JWTPayload }> {
  try {
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret));

    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { valid: false };
    }

    return { valid: true, payload: payload as JWTPayload };
  } catch {
    return { valid: false };
  }
}

// ============================================================
// 📤 الدالة الرئيسية للميدلوير
// ============================================================
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1️⃣ استثناء استدعاءات ملفات الـ Static والـ Assets
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  // 2️⃣ تجهيز الـ Correlation ID والـ Client IP
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  // 3️⃣ التحقق من المصادقة وتجهيز بيانات المستخدم مبكراً لربطها بالسياق
  const JWT_SECRET = process.env.BETTER_AUTH_SECRET;
  const token = request.cookies.get('auth_token')?.value;

  let isAuthenticated = false;
  let userPayload: JWTPayload | undefined;

  if (token && JWT_SECRET) {
    const result = await verifyJWT(token, JWT_SECRET);
    isAuthenticated = result.valid;
    userPayload = result.payload;
  }

  const storeId =
    request.headers.get('x-store-id') ||
    (userPayload?.store_id as string | undefined);
  const userId =
    userPayload?.merchant_id ||
    (userPayload?.sub as string | undefined);

  // 4️⃣ إنشاء Request Headers جديدة وتغدية بيانات السياق
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);
  requestHeaders.set('x-client-ip', clientIp);
  if (storeId) requestHeaders.set('x-store-id', storeId);
  if (userId) requestHeaders.set('x-user-id', userId);

  // 5️⃣ إنشاء سياق الأخطاء (Error Context) للطلب
  const requestContext = createNewContext({
    correlationId,
    storeId,
    userId,
    path: pathname,
    method: request.method,
    ip: clientIp,
  });

  // 6️⃣ تنفيذ باقي منطق الـ Middleware داخل سياق الأخطاء الموحد
  return runWithContext(requestContext, async () => {
    // 🛡️ Rate Limiting لمسارات الـ Auth والـ Checkout
    const isAuthRoute = AUTH_PATTERNS.some((pattern) => pattern.test(pathname));
    const isCheckoutRoute = pathname.includes('/checkout');

    if (isAuthRoute || isCheckoutRoute) {
      try {
        const action = isAuthRoute ? 'login' : 'checkout';

        const rlResult = await checkRateLimit({
          action,
          ip: clientIp,
        });

        if (!rlResult.allowed) {
          return new NextResponse(
            JSON.stringify({
              error: 'Too many requests. Please try again later.',
              retryAfter: rlResult.retryAfter || 60,
              layer: rlResult.layer || 'global',
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(rlResult.retryAfter || 60),
                'X-RateLimit-Limit': String(rlResult.limit ?? 0),
                'X-RateLimit-Remaining': String(rlResult.remaining ?? 0),
                'X-RateLimit-Reset': String(rlResult.resetAt ?? Date.now()),
                'x-correlation-id': correlationId,
              },
            }
          );
        }
      } catch (error) {
        console.error('⚠️ Rate limiter failed, allowing request (Fail-Open):', error);
      }
    }

    // 🛡️ التحقق من بيئة JWT
    if (!JWT_SECRET) {
      console.error('🚨 BETTER_AUTH_SECRET is not defined in environment variables');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const isProtectedRoute = PROTECTED_PATTERNS.some((pattern) => pattern.test(pathname));

    // 🛡️ التحقق من الصلاحيات (Authorization - Admin Check)
    if (isProtectedRoute && isAuthenticated && userPayload) {
      const userRole = userPayload.role || 'merchant';

      if (pathname.includes('/admin') && userRole !== 'admin') {
        const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
        return NextResponse.redirect(new URL(`/${matchLocale}/403`, request.url));
      }
    }

    // 🛡️ توجيه غير المصادقين بعيداً عن الداشبورد
    if (isProtectedRoute && !isAuthenticated) {
      const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
      const loginUrl = new URL(`/${matchLocale}/auth/login`, request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 🛡️ توجيه المصادقين بعيداً عن صفحات الدخول
    if (isAuthRoute && isAuthenticated) {
      const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
      return NextResponse.redirect(new URL(`/${matchLocale}/dashboard`, request.url));
    }

    // 🌐 تشغيل i18nMiddleware مع تمرير ה- Headers المعدلة
    const modifiedRequest = new NextRequest(request, {
      headers: requestHeaders,
    });

    const response = i18nMiddleware(modifiedRequest);

    // 🏷️ إضافة Response Headers للربط والتتبع
    response.headers.set('x-correlation-id', correlationId);

    const pathLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
    response.headers.set('x-direction', pathLocale === 'ar' ? 'rtl' : 'ltr');
    response.headers.set('x-locale', pathLocale);

    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ⚙️ ضبط التخزين المؤقت (Cache-Control)
    if (pathname.includes('/dashboard') || pathname.includes('/admin')) {
      response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    } else {
      response.headers.set(
        'Cache-Control',
        'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400'
      );
    }

    return response;
  });
}

// ============================================================
// 📌 المطابقة (Matcher)
// ============================================================
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|map|json|txt|xml)$).*)',
  ],
};