// src/worker/middleware/auth.ts

import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { eq, and, isNull } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';

export interface AuthVariables {
  userId: string;
  userRole: string;
}

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
 * 🔒 1. Auth Middleware: التحقق من التوكن وحقن userId و userRole
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!c.env.BETTER_AUTH_SECRET) {
    return c.json({ success: false, error: 'Server auth configuration error' }, 500);
  }

  try {
    // 1. فحص القائمة السوداء
    const blacklisted = await isTokenBlacklisted(token, c.env);
    if (blacklisted) {
      return c.json({ success: false, error: 'Token has been revoked' }, 401);
    }

    // 2. التحقق من التوقيع والـ Payload
    const payload = (await verify(token, c.env.BETTER_AUTH_SECRET, 'HS256')) as { sub?: string };

    if (!payload || !payload.sub) {
      return c.json({ success: false, error: 'Invalid token payload' }, 401);
    }

    const db = getDb({ DB: c.env.DB });
    const user = await db
      .select({ id: schema.users.id, role: schema.users.role, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .get();

    if (!user || user.status !== 'active') {
      return c.json({ success: false, error: 'User is inactive or deleted' }, 403);
    }

    // حقن البيانات المتوافقة مع AuthVariables
    c.set('userId', user.id);
    c.set('userRole', user.role || 'merchant');

    await next();
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
});

/**
 * 🛡️ 2. Tenant Ownership Middleware: التحقق من أن المستخدم صاحب المتجر (ownerId)
 */
export const requireStoreOwnership = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const userId = c.get('userId');

  // استخراج storeId من الـ Params أو الـ Headers أو الـ Query
  const storeId =
    c.req.param('storeId') ||
    c.req.header('x-store-id') ||
    c.req.query('storeId');

  if (!storeId) {
    return c.json({ success: false, error: 'Bad Request: Store ID context is required' }, 400);
  }

  const db = getDb({ DB: c.env.DB });

  // فحص مباشر ومحصن للنمط الصارم Drizzle TypeScript
  // يتأكد من مطابقة الـ storeId والـ ownerId وأن المتجر غير محذوف (deletedAt IS NULL)
  const store = await db
    .select({ id: schema.stores.id, ownerId: schema.stores.ownerId })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.id, storeId),
        eq(schema.stores.ownerId, userId),
        isNull(schema.stores.deletedAt)
      )
    )
    .get();

  if (!store) {
    return c.json(
      {
        success: false,
        error: 'Forbidden: You do not have permission to access or modify this store',
      },
      403
    );
  }

  await next();
});