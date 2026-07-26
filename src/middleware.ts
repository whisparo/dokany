// src/middleware.ts

/**
 * ============================================================
 * 🛡️ Middleware الموحد (Unified Middleware for Cloudflare Edge)
 * الإصدار: 4.1 (مستقر وعالي الكفاءة + دعم Root Landing Page)
 * ============================================================
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { jwtVerify } from 'jose';

// ============================================================
// 📌 تكوينات next-intl مع وجود مجلد [locale]
// ============================================================
const LOCALES = ['ar', 'en'] as const;
const DEFAULT_LOCALE = 'ar';

const i18nMiddleware = createMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // ⚡ 'always' يضمن وجود /ar أو /en للمسارات التي تمر بالـ i18n
  localePrefix: 'always',
  localeDetection: true,
});

// ============================================================
// 🛡️ المسارات المحمية وقواعد الوصول
// ============================================================
const PROTECTED_PATTERNS = [/^\/(ar|en)?\/?dashboard(\/.*)?$/, /^\/(ar|en)?\/?admin(\/.*)?$/];
const AUTH_PATTERNS = [/^\/(ar|en)?\/?auth(\/.*)?$/];

// ============================================================
// 🧠 دالة التحقق من JWT (Edge-compatible)
// ============================================================
async function verifyJWT(token: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return !!payload;
  } catch {
    return false;
  }
}

// ============================================================
// 📤 الدالة الرئيسية للميدلوير
// ============================================================
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1️⃣ استثناء الصفحة الرئيسية (Root `/`) لتعمل صفحة Engine Status بدون تحويلات لغوية
  if (pathname === '/') {
    return NextResponse.next();
  }

  // 2️⃣ استثناء الأصول الثابتة والـ APIs فوراً لأداء أسرع
  const isStatic = /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|map|json|txt|xml)$/i.test(pathname);
  const isInternal = pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname === '/health';

  if (isStatic || isInternal) {
    return NextResponse.next();
  }

  // 3️⃣ تجهيز الـ Correlation ID للتتبع
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();

  // 4️⃣ التحقق من المصادقة (Auth & JWT Verification)
  const isProtectedRoute = PROTECTED_PATTERNS.some((pattern) => pattern.test(pathname));
  const isAuthRoute = AUTH_PATTERNS.some((pattern) => pattern.test(pathname));

  const token = request.cookies.get('auth_token')?.value;
  const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
  let isAuthenticated = false;

  if (token) {
    isAuthenticated = await verifyJWT(token, JWT_SECRET);
  }

  // توجيه غير المصادقين بعيداً عن الداشبورد
  if (isProtectedRoute && !isAuthenticated) {
    const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
    const loginUrl = new URL(`/${matchLocale}/auth/login`, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // توجيه المصادقين بعيداً عن صفحات الدخول
  if (isAuthRoute && isAuthenticated) {
    const matchLocale = pathname.match(/^\/(ar|en)/)?.[1] || DEFAULT_LOCALE;
    const dashboardUrl = new URL(`/${matchLocale}/dashboard`, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // 5️⃣ تشغيل i18nMiddleware (معالجة البادئات والتحويلات للـ [locale])
  const response = i18nMiddleware(request);

  // 6️⃣ إضافة Response Headers للـ Caching والـ Debugging
  response.headers.set('x-correlation-id', correlationId);

  // تحديث الاتجاه (RTL/LTR) واللغة
  const currentLocale = request.cookies.get('NEXT_LOCALE')?.value || DEFAULT_LOCALE;
  response.headers.set('x-direction', currentLocale === 'ar' ? 'rtl' : 'ltr');
  response.headers.set('x-locale', currentLocale);

  // 7️⃣ ضبط سياسة التخزين المؤقت (Cache Strategy)
  if (pathname.includes('/dashboard')) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  } else {
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400');
  }

  return response;
}

// ============================================================
// 📌 المطابقة (Matcher)
// ============================================================
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};