// src/middleware.ts

/**
 * ============================================================
 * 🛡️ Middleware الموحد (Optimized for Cloudflare Edge)
 * الإصدار: 5.9 — "دكاني المتكاملة" (Production-Ready Engine)
 * ============================================================
 */

import { NextResponse, NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { jwtVerify } from 'jose';

import { createNewContext } from '@/lib/errors/core';
import { checkRateLimit } from '@/lib/rate-limit-client';
import { getSnapshotVersion } from '@/lib/cache/snapshot-edge';

// ============================================================
// 📌 التكوينات والقواعد
// ============================================================
const LOCALES = ['ar', 'en'] as const;
const DEFAULT_LOCALE = 'ar';

const i18nMiddleware = createMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false,
});

const PROTECTED_PATTERNS = [
  /^\/(ar|en)?\/dashboard(\/.*)?$/,
  /^\/(ar|en)?\/admin(\/.*)?$/,
];

const AUTH_PATTERNS = [/^\/(ar|en)?\/auth(\/.*)?$/];

const RATE_LIMITED_PATTERNS = [
  ...AUTH_PATTERNS,
  /\/checkout/,
  /\/api\/orders/,
  /\/api\/products\/[^\/]+\/update/,
  /\/api\/dashboard\/pulse/,
];

// ============================================================
// 🧠 التحقق من الـ JWT
// ============================================================
interface JWTPayload {
  merchant_id?: string;
  store_id?: string;
  role?: string;
  sub?: string;
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
// 📤 الدالة الرئيسية
// ============================================================
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1️⃣ استخراج الـ Locale من المسار مبكراً
  const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;

  // 2️⃣ إعداد الـ Headers الأساسية والتتبع
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  // 3️⃣ التحقق من نوع المسار
  const isProtectedRoute = PROTECTED_PATTERNS.some((pattern) => pattern.test(pathname));
  const isAuthRoute = AUTH_PATTERNS.some((pattern) => pattern.test(pathname));
  const isRateLimited = RATE_LIMITED_PATTERNS.some((pattern) => pattern.test(pathname));

  // 🛡️ Rate Limiting (على المسارات الحساسة)
  if (isRateLimited) {
    try {
      let action = 'default';
      if (isAuthRoute) action = 'login';
      else if (pathname.includes('/checkout')) action = 'checkout';
      else if (pathname.includes('/orders')) action = 'orders';
      else if (pathname.includes('/pulse')) action = 'sse';

      const rlResult = await checkRateLimit({ action, ip: clientIp });

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

  // 4️⃣ التحقق من الـ Auth ودعم Better Auth / Session Cookies
  const JWT_SECRET = process.env.BETTER_AUTH_SECRET;
  
  // فحص الكوكيز المتعددة لضمان التوافق مع Better Auth والـ Actions
  const token = 
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('auth_token')?.value;

  const sessionUserId = request.cookies.get('session_user_id')?.value;
  const cookieStoreId = request.cookies.get('x-store-id')?.value;

  let isAuthenticated = false;
  let userPayload: JWTPayload | undefined;

  // التحقق من الجلسة إما عبر JWT التوكن أو جلسة session_user_id المباشرة
  if (token && JWT_SECRET) {
    const result = await verifyJWT(token, JWT_SECRET);
    isAuthenticated = result.valid;
    userPayload = result.payload;
  } else if (sessionUserId) {
    isAuthenticated = true;
  }

  // 🛡️ حماية عند غياب الـ Secret لو كانت المسارات مخصصة للـ JWT
  if ((isProtectedRoute || isAuthRoute) && !JWT_SECRET && !sessionUserId) {
    console.error('🚨 BETTER_AUTH_SECRET or Session is missing!');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  // 5️⃣ إدارة التوجيهات (Redirects)
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL(`/${matchLocale}/auth/login`, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isProtectedRoute && isAuthenticated && userPayload) {
    const userRole = userPayload.role || 'merchant';
    if (pathname.includes('/admin') && userRole !== 'admin') {
      return NextResponse.redirect(new URL(`/${matchLocale}/403`, request.url));
    }
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL(`/${matchLocale}/dashboard`, request.url));
  }

  // 6️⃣ استخراج الـ Context
  const jwtStoreId = userPayload?.store_id;
  const pathStoreId = pathname.match(/\/store\/([^\/]+)/)?.[1];
  const apiStoreId = pathname.match(/\/api\/([^\/]+)\/checkout/)?.[1];
  
  const finalStoreId = jwtStoreId || cookieStoreId || pathStoreId || apiStoreId || undefined;
  const userId = userPayload?.merchant_id || userPayload?.sub || sessionUserId;

  // إنشاء سياق الأخطاء
  createNewContext({
    correlationId,
    storeId: finalStoreId,
    userId: userId || undefined,
    path: pathname,
    method: request.method,
    ip: clientIp,
  });

  // 🚨 تمرير الـ Headers إلى الـ Request الداخلي أولاً
  request.headers.set('x-correlation-id', correlationId);
  request.headers.set('x-client-ip', clientIp);
  request.headers.set('x-direction', matchLocale === 'ar' ? 'rtl' : 'ltr');
  request.headers.set('x-locale', matchLocale);
  if (finalStoreId) request.headers.set('x-store-id', finalStoreId);
  if (userId) request.headers.set('x-user-id', userId);

  // 7️⃣ تشغيل i18nMiddleware للمسارات العادية، أو NextResponse.next للـ API
  const isApiRoute = pathname.startsWith('/api');
  const response = isApiRoute ? NextResponse.next({ request }) : i18nMiddleware(request);

  // 8️⃣ تعيين الـ Response Headers (للعميل / Browser)
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('x-direction', matchLocale === 'ar' ? 'rtl' : 'ltr');
  response.headers.set('x-locale', matchLocale);
  response.headers.set('x-edge-runtime', 'cloudflare-workers');

  if (finalStoreId) response.headers.set('x-store-id', finalStoreId);
  if (userId) response.headers.set('x-user-id', userId);

  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cache Control
  const cacheControl = pathname.includes('/dashboard') || pathname.includes('/admin') || isApiRoute
    ? 'no-store, max-age=0, must-revalidate'
    : 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400';

  response.headers.set('Cache-Control', cacheControl);

  // Snapshot Version Invalidation
  if (finalStoreId) {
    try {
      const snapshotVersion = await getSnapshotVersion(finalStoreId);
      if (snapshotVersion) {
        response.headers.set('x-snapshot-version', snapshotVersion);
      }
    } catch {
      // تجاهل فشل قراءة الإصدار
    }
  }

  return response;
}

// ============================================================
// 📌 المطابقة (Matcher)
// ============================================================
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|map|json|txt|xml)$).*)',
  ],
};