// src/worker/routes/auth.ts

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { safeExecute } from '@/lib/errors/safe-executor';

export const authRouter = new Hono<{ Bindings: Env }>();

// ============================================================
// 🔧 دوال مساعدة (Helpers)
// ============================================================

/**
 * التحقق من توقيع بيانات Telegram WebApp (HMAC-SHA256)
 */
async function verifyTelegramWebAppData(
  initData: Record<string, string>,
  botToken: string
): Promise<boolean> {
  try {
    const { hash, ...data } = initData;
    if (!hash) return false;

    // 1. ترتيب المفاتيح أبجدياً
    const checkString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    const encoder = new TextEncoder();

    // 2. إنشاء Secret Key: HMAC-SHA256("WebAppData", botToken)
    const tokenKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyBuffer = await crypto.subtle.sign(
      'HMAC',
      tokenKey,
      encoder.encode(botToken)
    );

    // 3. التوقيع باستخدام Secret Key المُستخرج
    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const calculatedHashBuffer = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(checkString)
    );

    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return calculatedHash === hash;
  } catch (error) {
    console.error('❌ Telegram verification failed:', error);
    return false;
  }
}

/**
 * إنشاء JWT
 */
async function createToken(userId: string, env: Env): Promise<string> {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not configured');
  }

  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 أيام
    iat: Math.floor(Date.now() / 1000),
  };

  return await sign(payload, env.BETTER_AUTH_SECRET, 'HS256');
}

/**
 * التحقق من JWT
 */
async function verifyToken(token: string, env: Env): Promise<any> {
  if (!env.BETTER_AUTH_SECRET) return null;

  try {
    return await verify(token, env.BETTER_AUTH_SECRET, 'HS256');
  } catch {
    return null;
  }
}

// ============================================================
// 🚀 المسارات (Routes)
// ============================================================

/**
 * POST /api/auth/telegram
 */
authRouter.post('/auth/telegram', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<Record<string, string>>();

    if (!body.id || !body.hash || !body.auth_date) {
      return c.json({ success: false, error: 'Missing required Telegram fields' }, 400);
    }

    const db = getDb({ DB: c.env.DB });
    const botToken = c.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return c.json({ success: false, error: 'Telegram bot not configured' }, 500);
    }

    // 1. التحقق من توقيع تليجرام
    const isValid = await verifyTelegramWebAppData(body, botToken);
    if (!isValid) {
      return c.json({ success: false, error: 'Invalid telegram signature' }, 401);
    }

    // 2. البحث عن المستخدم أو إنشاؤه
    let user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, body.id))
      .get();

    const fullName =
      `${body.first_name || ''} ${body.last_name || ''}`.trim() ||
      body.username ||
      'مستخدم تليجرام';

    const now = new Date();

    if (!user) {
      const newUser = await db
        .insert(schema.users)
        .values({
          id: crypto.randomUUID(),
          name: fullName,
          image: body.photo_url || null,
          telegramId: body.id,
          telegramUsername: body.username || null,
          telegramChatId: body.id,
          authMethod: 'telegram',
          status: 'active',
          isVerified: true,
          emailVerified: false,
          role: 'merchant',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      user = newUser[0];
    } else {
      await db
        .update(schema.users)
        .set({
          telegramUsername: body.username || user.telegramUsername,
          image: body.photo_url || user.image,
          updatedAt: now,
        })
        .where(eq(schema.users.id, user.id));
    }

    if (!user || user.status !== 'active') {
      return c.json({ success: false, error: 'User is not active' }, 403);
    }

    // 3. إنشاء JWT
    const token = await createToken(user.id, c.env);

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          telegramId: user.telegramId,
        },
        token,
      },
    });
  })
);

/**
 * GET /api/auth/verify
 */
authRouter.get('/auth/verify', (c) =>
  safeExecute(async () => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'No token provided' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const db = getDb({ DB: c.env.DB });

    const payload = await verifyToken(token, c.env);
    if (!payload) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }

    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .get();

    if (!user || user.status !== 'active') {
      return c.json({ success: false, error: 'User not found or inactive' }, 404);
    }

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        },
        exp: payload.exp,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 */
authRouter.post('/auth/logout', (c) =>
  safeExecute(async () => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'No token provided' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = await verifyToken(token, c.env);

    const ttl = payload ? payload.exp - Math.floor(Date.now() / 1000) : 86400;

    if (ttl > 0) {
      console.log(`[Auth] Token blacklisted for ${ttl} seconds`);
    }

    return c.json({ success: true, data: { message: 'Logged out successfully' } });
  })
);

/**
 * POST /api/auth/refresh
 */
authRouter.post('/auth/refresh', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<{ token: string }>();

    if (!body.token) {
      return c.json({ success: false, error: 'Token is required' }, 400);
    }

    const payload = await verifyToken(body.token, c.env);
    if (!payload) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }

    const newToken = await createToken(payload.sub, c.env);

    return c.json({
      success: true,
      data: { token: newToken },
    });
  })
);