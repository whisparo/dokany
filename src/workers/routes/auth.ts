// src/workers/routes/auth.ts

import { Hono } from 'hono';
import { eq, and, gt } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';

export const authRouter = new Hono<{ Bindings: Env }>();

// ============================================================
// 🔒 Interfaces
// ============================================================

interface JWTPayload {
  sub: string;
  exp: number;
  iat: number;
  sid?: string;
  [key: string]: unknown;
}

interface RedisResponse {
  result: unknown;
}

// 🛡️ Telegram Auth Body Interface (Strictly Typed)
interface TelegramAuthInput {
  id: string | number;
  hash: string;
  auth_date: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  [key: string]: unknown;
}

// ============================================================
// 🔧 Helpers
// ============================================================

async function redisCommand(env: Env, command: string[]): Promise<unknown> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const data = (await res.json()) as RedisResponse;
    return data.result;
  } catch (e) {
    console.error('❌ [Redis Error]:', e);
    return null;
  }
}

async function isTokenBlacklisted(token: string, env: Env): Promise<boolean> {
  try {
    const result = await redisCommand(env, ['GET', `bl_${token}`]);
    return result !== null;
  } catch {
    return false; // Fail open to prevent auth lockouts if Redis fails
  }
}

async function blacklistToken(token: string, ttlSeconds: number, env: Env): Promise<void> {
  if (ttlSeconds <= 0) return;
  await redisCommand(env, ['SET', `bl_${token}`, 'revoked', 'EX', ttlSeconds.toString()]);
}

/**
 * التحقق من توقيع بيانات Telegram WebApp (HMAC-SHA256) مع فحص Replay Attack
 */
async function verifyTelegramWebAppData(
  initData: Record<string, string>,
  botToken: string
): Promise<boolean> {
  try {
    const { hash, auth_date, ...data } = initData;
    if (!hash || !auth_date) return false;

    // 🛡️ حماية ضد Replay Attacks: الرافعة الأقصى للطلب 24 ساعة (86400 ثانية)
    const authTimestamp = parseInt(auth_date, 10);
    const nowTimestamp = Math.floor(Date.now() / 1000);
    if (isNaN(authTimestamp) || nowTimestamp - authTimestamp > 86400) {
      console.warn('⚠️ Telegram auth_date expired or invalid');
      return false;
    }

    // بناء الـ Check String بفرز المفاتيح أبجدياً
    const checkString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    const encoder = new TextEncoder();
    
    // HMAC-SHA256("WebAppData", botToken)
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

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // HMAC-SHA256(secretKey, checkString)
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
    console.error('❌ Telegram verification error:', error);
    return false;
  }
}

/**
 * إنشاء JWT مع تسجيل الجلسة في DB
 */
async function createTokenAndSession(
  userId: string,
  env: Env,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<{ token: string; sessionId: string }> {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not configured');
  }

  const db = getDb({ DB: env.DB });
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 أيام
  const tokenFamily = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  const payload: JWTPayload = {
    sub: userId,
    sid: sessionId,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload, env.BETTER_AUTH_SECRET, 'HS256');

  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    token,
    tokenFamily,
    expiresAt,
    ipAddress: clientIp ?? null,
    userAgent: userAgent ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { token, sessionId };
}

/**
 * التحقق من JWT مع فحص الـ Blacklist وجودة الجلسة في D1
 */
async function verifyToken(token: string, env: Env): Promise<JWTPayload | null> {
  if (!env.BETTER_AUTH_SECRET) return null;

  try {
    const blacklisted = await isTokenBlacklisted(token, env);
    if (blacklisted) return null;

    const payload = (await verify(token, env.BETTER_AUTH_SECRET, 'HS256')) as JWTPayload;
    if (!payload || !payload.sub) return null;

    if (payload.sid) {
      const db = getDb({ DB: env.DB });
      const session = await db
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.id, payload.sid),
            gt(schema.sessions.expiresAt, new Date())
          )
        )
        .get();

      if (!session) return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// 🚀 Routes
// ============================================================

/**
 * POST /api/auth/telegram
 */
authRouter.post('/auth/telegram', async (c) => {
  const rawBody = await c.req.json<TelegramAuthInput | null>().catch(() => null);

  if (!rawBody || typeof rawBody !== 'object') {
    return c.json({ success: false, code: 'INVALID_INPUT', message: 'بيانات الطلب غير صالحة' }, 400);
  }

  const telegramId = rawBody.id !== undefined && rawBody.id !== null ? String(rawBody.id) : '';
  const hash = typeof rawBody.hash === 'string' ? rawBody.hash : '';
  const authDate = rawBody.auth_date !== undefined && rawBody.auth_date !== null ? String(rawBody.auth_date) : '';

  if (!telegramId || !hash || !authDate) {
    return c.json({ success: false, code: 'INVALID_INPUT', message: 'بيانات التوثيق غير مكتملة' }, 400);
  }

  const db = getDb({ DB: c.env.DB });
  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return c.json({ success: false, code: 'SERVER_CONFIG_ERROR', message: 'معدة التليجرام غير مكتملة' }, 500);
  }

  const stringBody: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawBody)) {
    if (v !== undefined && v !== null) {
      stringBody[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  }

  const isValid = await verifyTelegramWebAppData(stringBody, botToken);
  if (!isValid) {
    return c.json({ success: false, code: 'UNAUTHORIZED', message: 'توقيع بيانات تليجرام غير صالح أو منتهي الصلاحية' }, 401);
  }

  let user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.telegramId, telegramId))
    .get();

  const firstName = typeof rawBody.first_name === 'string' ? rawBody.first_name : '';
  const lastName = typeof rawBody.last_name === 'string' ? rawBody.last_name : '';
  const username = typeof rawBody.username === 'string' ? rawBody.username : null;
  const photoUrl = typeof rawBody.photo_url === 'string' ? rawBody.photo_url : null;
  const fullName = `${firstName} ${lastName}`.trim() || username || 'مستخدم تليجرام';

  const now = new Date();
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;

  if (!user) {
    const newUserId = crypto.randomUUID();
    const merchantId = `mch_${crypto.randomUUID().slice(0, 8)}`;

    try {
      const newUser = await db
        .insert(schema.users)
        .values({
          id: newUserId,
          name: fullName,
          image: photoUrl,
          telegramId: telegramId,
          telegramUsername: username,
          telegramChatId: telegramId,
          authMethod: 'telegram',
          status: 'active',
          isVerified: true,
          emailVerified: false,
          role: 'merchant',
          merchantId: merchantId,
          lastLoginAt: now,
          lastActiveAt: now,
          lastIp: clientIp,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      user = newUser[0];

      await db.insert(schema.userStats).values({
        id: crypto.randomUUID(),
        userId: user.id,
        loginCount: 1,
        totalSessions: 1,
        lastLoginAt: now,
        firstLoginAt: now,
        lastIp: clientIp,
        updatedAt: now,
      });
    } catch {
      user = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.telegramId, telegramId))
        .get();
    }
  } else {
    await db
      .update(schema.users)
      .set({
        telegramUsername: username || user.telegramUsername,
        image: photoUrl || user.image,
        lastLoginAt: now,
        lastActiveAt: now,
        lastIp: clientIp,
        updatedAt: now,
      })
      .where(eq(schema.users.id, user.id));

    const userStatRecord = await db
      .select()
      .from(schema.userStats)
      .where(eq(schema.userStats.userId, user.id))
      .get();

    if (userStatRecord) {
      await db
        .update(schema.userStats)
        .set({
          loginCount: (userStatRecord.loginCount || 0) + 1,
          totalSessions: (userStatRecord.totalSessions || 0) + 1,
          lastLoginAt: now,
          lastIp: clientIp,
          updatedAt: now,
        })
        .where(eq(schema.userStats.userId, user.id));
    }
  }

  if (!user || user.status !== 'active') {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'الحساب غير مفعّل أو معطل' }, 403);
  }

  const userAgent = c.req.header('user-agent') || null;
  const { token } = await createTokenAndSession(user.id, c.env, clientIp, userAgent);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        merchantId: user.merchantId,
        telegramId: user.telegramId,
      },
      token,
    },
  });
});

/**
 * GET /api/auth/verify
 */
authRouter.get('/auth/verify', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, code: 'UNAUTHORIZED', message: 'رمز التوثيق غير موجود' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const db = getDb({ DB: c.env.DB });

  const payload = await verifyToken(token, c.env);
  if (!payload) {
    return c.json({ success: false, code: 'UNAUTHORIZED', message: 'رمز التوثيق غير صالح أو منتهي الصلاحية' }, 401);
  }

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .get();

  if (!user || user.status !== 'active') {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'المستخدم غير موجود أو غير مفعّل' }, 404);
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
        merchantId: user.merchantId,
      },
      exp: payload.exp,
    },
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, code: 'UNAUTHORIZED', message: 'رمز التوثيق غير موجود' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const payload = await verifyToken(token, c.env);

  if (payload) {
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await blacklistToken(token, ttl, c.env);

      if (payload.sid) {
        const db = getDb({ DB: c.env.DB });
        await db.delete(schema.sessions).where(eq(schema.sessions.id, payload.sid));
      }
    }
  }

  return c.json({ success: true, data: { message: 'تم تسجيل الخروج بنجاح' } });
});

/**
 * POST /api/auth/refresh
 */
authRouter.post('/auth/refresh', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));

  if (!body.token) {
    return c.json({ success: false, code: 'INVALID_INPUT', message: 'الرمز المطلوب غير موجود' }, 400);
  }

  const payload = await verifyToken(body.token, c.env);
  if (!payload) {
    return c.json({ success: false, code: 'UNAUTHORIZED', message: 'الرمز غير صالح أو منتهي الصلاحية' }, 401);
  }

  const ttl = payload.exp - Math.floor(Date.now() / 1000);
  const db = getDb({ DB: c.env.DB });

  if (ttl > 0) {
    await blacklistToken(body.token, ttl, c.env);
    if (payload.sid) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, payload.sid));
    }
  }

  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  const userAgent = c.req.header('user-agent') || null;

  const { token: newToken } = await createTokenAndSession(payload.sub, c.env, clientIp, userAgent);

  return c.json({
    success: true,
    data: { token: newToken },
  });
});