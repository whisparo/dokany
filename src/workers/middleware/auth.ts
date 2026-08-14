// src/worker/middleware/auth.ts

import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { eq, and, isNull } from 'drizzle-orm';
import type { AppEnv, Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export interface AuthVariables {
  user: {
    id: string;
    email: string;
    role: string;
  };
  userId: string;
  storeId?: string;
}

// 💡 نوع مخصص للميدلوير يضمن دمج Bindings مع AuthVariables صراحة
type AuthEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * 🛠️ فحص التوكن في القائمة السوداء (Redis Blacklist)
 */
async function isTokenBlacklisted(token: string, env: Env): Promise<boolean> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return false;
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/bl_${token}`, {
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
    });
    const data = (await res.json()) as { result: string | null };
    return data.result !== null;
  } catch {
    return false;
  }
}

/**
 * 🔒 Auth Middleware
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new SystemError({
      code: 'UNAUTHORIZED',
      userMessage: 'يرجى تسجيل الدخول للوصول لهذا المورد.',
      technicalMessage: 'Missing or malformed Authorization header',
      category: 'security',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: 'N/A', path: c.req.path },
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!c.env.BETTER_AUTH_SECRET) {
    console.error('❌ BETTER_AUTH_SECRET is not configured');
    throw new SystemError({
      code: 'SERVER_CONFIG_ERROR',
      userMessage: 'خطأ في إعدادات خادم الهوية.',
      technicalMessage: 'BETTER_AUTH_SECRET is missing from environment variables',
      category: 'system',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
      context: { storeId: 'N/A', path: c.req.path },
    });
  }

  try {
    if (await isTokenBlacklisted(token, c.env)) {
      throw new SystemError({
        code: 'TOKEN_REVOKED',
        userMessage: 'تم إلغاء صلاحية هذا الرمز، يرجى إعادة تسجيل الدخول.',
        technicalMessage: 'Token found in Redis revocation blacklist',
        category: 'security',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: 'N/A', path: c.req.path },
      });
    }

    const payload = (await verify(token, c.env.BETTER_AUTH_SECRET, 'HS256')) as {
      sub?: string;
      exp?: number;
    };

    if (!payload?.sub) {
      throw new SystemError({
        code: 'INVALID_TOKEN_PAYLOAD',
        userMessage: 'رمز الهوية غير صالح.',
        technicalMessage: 'JWT sub field is missing',
        category: 'security',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: 'N/A', path: c.req.path },
      });
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new SystemError({
        code: 'TOKEN_EXPIRED',
        userMessage: 'انتهت جلسة الدخول، يرجى إعادة تسجيل الدخول.',
        technicalMessage: `Token expired at timestamp ${payload.exp}`,
        category: 'security',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: 'N/A', path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });
    const user = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        status: schema.users.status,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .get();

    if (!user || user.status !== 'active') {
      throw new SystemError({
        code: 'USER_INACTIVE',
        userMessage: 'حساب المستخدم معطل أو غير موجود.',
        technicalMessage: `User '${payload.sub}' is inactive or deleted`,
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        context: { storeId: 'N/A', path: c.req.path },
      });
    }

    // ✅ التعديل لحل أخطاء c.set('userId') والأدوار غير المحددة
    c.set('userId', user.id);
    c.set('user', {
      id: user.id,
      email: user.email ?? '',
      role: user.role ?? 'merchant', // ✅ ضمان قيمة string دائماً بدون undefined
    });

    await next();
  } catch (error) {
    if (error instanceof SystemError) throw error;

    console.error('🔒 Auth middleware error:', error);
    throw new SystemError({
      code: 'AUTH_FAILED',
      userMessage: 'فشل التحقق من الهوية.',
      technicalMessage: error instanceof Error ? error.message : 'Unknown JWT verification error',
      category: 'security',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: 'N/A', path: c.req.path },
    });
  }
});

/**
 * 🛡️ Tenant Ownership Middleware
 */
export const requireStoreOwnership = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw new SystemError({
      code: 'UNAUTHORIZED',
      userMessage: 'غير مصرح للوصول.',
      technicalMessage: 'requireStoreOwnership invoked without previous requireAuth execution',
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
      context: { storeId: 'UNKNOWN', path: c.req.path },
    });
  }

  const storeId =
    c.req.param('storeId') ||
    c.req.header('x-store-id') ||
    c.req.query('storeId');

  if (!storeId) {
    throw new SystemError({
      code: 'STORE_ID_REQUIRED',
      userMessage: 'معرف المتجر مطلوب لتنفيذ هذا الإجراء.',
      technicalMessage: 'Store ID header/param/query is missing',
      category: 'validation',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: 'UNKNOWN', path: c.req.path },
    });
  }

  const db = getDb({ DB: c.env.DB });

  const store = await db
    .select({ id: schema.stores.id, ownerId: schema.stores.ownerId })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.id, storeId),
        eq(schema.stores.ownerId, user.id),
        isNull(schema.stores.deletedAt)
      )
    )
    .get();

  if (!store) {
    throw new SystemError({
      code: 'FORBIDDEN',
      userMessage: 'ليس لديك صلاحية للوصول لهذا المتجر.',
      technicalMessage: `User '${user.id}' attempted unauthorized access to store '${storeId}'`,
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
      context: { storeId, path: c.req.path },
    });
  }

  // ✅ حل خطأ c.set('storeId')
  c.set('storeId', store.id);

  await next();
});

/**
 * 🎭 Role-based Authorization Middleware Factory
 */
export const requireRole = (allowedRoles: string[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new SystemError({
        code: 'UNAUTHORIZED',
        userMessage: 'غير مصرح للوصول.',
        technicalMessage: 'requireRole invoked without requireAuth',
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: true,
        context: { storeId: 'UNKNOWN', path: c.req.path },
      });
    }

    // ✅ حل خطأ user.role قد يكون undefined
    const userRole = user.role ?? 'merchant';

    if (!allowedRoles.includes(userRole)) {
      throw new SystemError({
        code: 'FORBIDDEN_ROLE',
        userMessage: 'ليس لديك صلاحيات كافية لتنفيذ هذا الإجراء.',
        technicalMessage: `User role '${userRole}' is not in allowed roles: [${allowedRoles.join(', ')}]`,
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        // ✅ حل خطأ النوع عند إرجاع c.get('storeId')
        context: { 
          storeId: typeof c.get('storeId') === 'string' ? (c.get('storeId') as string) : 'UNKNOWN', 
          path: c.req.path 
        },
      });
    }

    await next();
  });