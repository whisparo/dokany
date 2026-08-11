// src/lib/auth.ts

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema/users';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { Redis } from '@upstash/redis';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit';

// ============================================================
// 🔒 تعريف البيئة المدعومة بشكل صارم
// ============================================================

export interface AuthEnv {
  DB: D1Database;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

interface TelegramInput {
  telegramId: string;
  hash: string;
  auth_date: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

interface PinInput {
  phone: string;
  pin: string;
}

interface AuthUserResult {
  id: string;
  name: string;
  email: string;
  image?: string;
}

// ============================================================
// 🔐 Web Crypto PBKDF2 Helpers (Edge-Native & Fast)
// ============================================================

/**
  توليد Hash آمن للـ PIN باستخدام PBKDF2 بدلاً من bcrypt
 */
export async function hashPin(pin: string, providedSalt?: Uint8Array<ArrayBuffer>): Promise<string> {
  const encoder = new TextEncoder();
  // تحديد النوع صراحة ليكون Uint8Array<ArrayBuffer>
  const salt: Uint8Array<ArrayBuffer> = providedSalt || globalThis.crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt, // أصبح الآن متوافقاً تماماً مع BufferSource
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashHex = Array.from(new Uint8Array(derivedKey))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `pbkdf2:${saltHex}:${hashHex}`;
}

/**
 * التحقق من صحة الـ PIN بشكل آمن ومقاوم للـ Timing Attacks في بيئة Edge
 */
async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;

  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;

    const [, saltHex, originalHashHex] = parts;
    const saltMatch = saltHex.match(/.{1,2}/g);
    if (!saltMatch) return false;

    // تحويل البيانات صراحة لـ Uint8Array<ArrayBuffer>
    const salt = new Uint8Array(new ArrayBuffer(saltMatch.length));
    saltMatch.forEach((byte, i) => {
      salt[i] = parseInt(byte, 16);
    });

    const computedHash = await hashPin(pin, salt);
    const computedHashHex = computedHash.split(':')[2];

    if (computedHashHex.length !== originalHashHex.length) return false;

    const encoder = new TextEncoder();
    const computedBuf = encoder.encode(computedHashHex);
    const originalBuf = encoder.encode(originalHashHex);

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      computedBuf,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify', 'sign']
    );

    return await globalThis.crypto.subtle.verify('HMAC', cryptoKey, computedBuf, originalBuf);
  }

  return false;
}

// ============================================================
// 🔐 دوال التحقق من تليجرام (مُؤمنة ضد Timing Attacks)
// ============================================================

async function verifyTelegramHash(
  data: Record<string, string | undefined>,
  botToken: string
): Promise<boolean> {
  if (!data.hash || !data.auth_date) return false;

  const authDate = parseInt(data.auth_date, 10);
  // صلاحية الـ Hash هي 24 ساعة فقط (86400 ثانية)
  if (isNaN(authDate) || Math.floor(Date.now() / 1000) - authDate > 86400) return false;

  const checkData: Record<string, string> = {};
  Object.keys(data).forEach((key) => {
    if (key !== 'hash' && data[key] !== undefined && data[key] !== '') {
      checkData[key] = String(data[key]);
    }
  });

  const sortedKeys = Object.keys(checkData).sort();
  const dataString = sortedKeys.map((k) => `${k}=${checkData[k]}`).join('\n');
  const encoder = new TextEncoder();

  // 1. حساب Secret Key عبر Web Crypto API المتوافق مع Edge
  const secretKeyBuffer = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(botToken)
  );

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secretKeyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify', 'sign']
  );

  // 2. تحويل الـ Received Hash إلى Uint8Array لمقارنتها ذرياً
  const hashHex = data.hash;
  if (hashHex.length !== 64) return false;

  const byteMatches = hashHex.match(/.{1,2}/g);
  if (!byteMatches) return false;

  const receivedSignature = new Uint8Array(byteMatches.map((byte) => parseInt(byte, 16)));

  // 3. استخدام Web Crypto verify لمنع Timing Attacks
  return await globalThis.crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    receivedSignature,
    encoder.encode(dataString)
  );
}

// ============================================================
// 🧠 مُنشئ الـ Auth
// ============================================================

export function createAuth(env: AuthEnv) {
  const db = getDb({ DB: env.DB });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: schema,
    }),

    baseURL: env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 دقائق
      },
    },

    providers: [
      // ============================================================
      // 1. مزود تليجرام
      // ============================================================
      {
        id: 'telegram',
        name: 'Telegram',
        type: 'credentials',
        options: {
          fields: {
            telegramId: { type: 'string', required: true },
            username: { type: 'string', required: false },
            hash: { type: 'string', required: true },
            auth_date: { type: 'string', required: true },
            first_name: { type: 'string', required: false },
            last_name: { type: 'string', required: false },
            photo_url: { type: 'string', required: false },
          },
          async verify({ input }: { input: TelegramInput }): Promise<AuthUserResult | null> {
            const botToken = env.TELEGRAM_BOT_TOKEN;
            if (!botToken) return null;

            const isValid = await verifyTelegramHash(
              {
                hash: input.hash,
                auth_date: input.auth_date,
                username: input.username,
                first_name: input.first_name,
                last_name: input.last_name,
                photo_url: input.photo_url,
                id: input.telegramId,
              },
              botToken
            );

            if (!isValid || !input.telegramId) return null;

            const localDb = getDb({ DB: env.DB });

            const user = await localDb.query.users.findFirst({
              where: eq(users.telegramId, input.telegramId),
            });

            let finalUser = user;

            if (!finalUser) {
              const fullName =
                `${input.first_name || ''} ${input.last_name || ''}`.trim() ||
                input.username ||
                'مستخدم تليجرام';

              const newUser = await localDb
                .insert(users)
                .values({
                  id: crypto.randomUUID(),
                  name: fullName,
                  image: input.photo_url || null,
                  telegramId: input.telegramId,
                  telegramUsername: input.username || null,
                  telegramChatId: input.telegramId,
                  authMethod: 'telegram',
                  status: 'active',
                  isVerified: true,
                  emailVerified: false,
                  role: 'merchant',
                })
                .returning();

              finalUser = newUser[0];
            } else {
              await localDb
                .update(users)
                .set({
                  telegramChatId: input.telegramId,
                  telegramUsername: input.username || finalUser.telegramUsername,
                  image: input.photo_url || finalUser.image,
                })
                .where(eq(users.id, finalUser.id));
            }

            if (!finalUser || finalUser.status !== 'active') return null;

            return {
              id: finalUser.id,
              name: finalUser.name,
              email: finalUser.email || `${finalUser.telegramId}@telegram.local`,
              image: finalUser.image || undefined,
            };
          },
        },
      },

      // ============================================================
      // 2. مزود Backup PIN (مع حماية Rate Limiting و Web Crypto)
      // ============================================================
      {
        id: 'pin',
        name: 'Backup PIN',
        type: 'credentials',
        options: {
          fields: {
            phone: { type: 'string', required: true },
            pin: { type: 'string', required: true },
          },
          async verify({ input }: { input: PinInput }): Promise<AuthUserResult | null> {
            // ✅ حماية ضد Brute Force بـ Upstash Redis إذا أتيحت المتغيرات
            if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
              const redis = new Redis({
                url: env.UPSTASH_REDIS_REST_URL,
                token: env.UPSTASH_REDIS_REST_TOKEN,
              });
              const limitKey = buildRateLimitKey('auth', input.phone, 'pin_attempt');
              // أقصى حد: 5 محاولات فاشلة كل 15 دقيقة (900 ثانية)
              const limitCheck = await checkRateLimit(redis, limitKey, 5, 900);
              if (!limitCheck.allowed) {
                throw new Error('TOO_MANY_ATTEMPTS: يرجى الانتظار قبل محاولة إدخال الـ PIN مجدداً');
              }
            }

            const localDb = getDb({ DB: env.DB });

            const user = await localDb.query.users.findFirst({
              where: eq(users.phoneNumber, input.phone),
            });

            if (!user || !user.backupPin || user.status !== 'active') {
              return null;
            }

            // ✅ التحقق التوافق التام مع Edge باستخدام Web Crypto PBKDF2
            const isValid = await verifyPin(input.pin, user.backupPin);
            if (!isValid) return null;

            return {
              id: user.id,
              name: user.name,
              email: user.email || `${user.phoneNumber}@phone.local`,
              image: user.image || undefined,
            };
          },
        },
      },
    ],

    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
    },

    user: {
      additionalFields: {
        phoneNumber: { type: 'string', required: false },
        telegramId: { type: 'string', required: false },
        telegramUsername: { type: 'string', required: false },
        telegramChatId: { type: 'string', required: false },
        backupPin: { type: 'string', required: false },
        merchantId: { type: 'string', required: false },
        status: { type: 'string', required: false, defaultValue: 'active' },
        role: { type: 'string', required: false, defaultValue: 'merchant' },
      },
    },
  });
}