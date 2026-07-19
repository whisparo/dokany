// src/lib/auth.ts

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/lib/db/db';
import { users, sessions, accounts } from '@/lib/db/schema/users';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt-ts';

// تعريف البيئة
interface CloudflareWorkerEnv {
  DB: import('@cloudflare/workers-types').D1Database;
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

// ============================================================
// 🔐 التحقق من توقيع تليجرام
// ============================================================
async function verifyTelegramHash(data: Record<string, string | undefined>, botToken: string): Promise<boolean> {
  if (!data.hash || !data.auth_date) return false;

  const authDate = parseInt(data.auth_date, 10);
  if (Math.floor(Date.now() / 1000) - authDate > 86400) {
    return false;
  }

  const checkData: Record<string, string> = {};
  Object.keys(data).forEach((key) => {
    if (key !== 'hash' && data[key] !== undefined && data[key] !== '') {
      checkData[key] = data[key]!;
    }
  });

  const sortedKeys = Object.keys(checkData).sort();
  const dataString = sortedKeys.map(k => `${k}=${checkData[k]}`).join('\n');

  const encoder = new TextEncoder();

  const secretKeyBuffer = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(botToken)
  );

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secretKeyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(dataString)
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return calculatedHash === data.hash;
}

// ============================================================
// 🌍 البيئة
// ============================================================
const globalEnv = (typeof process !== 'undefined' ? process.env : {}) as unknown as CloudflareWorkerEnv;

// ============================================================
// 🧠 بناء الـ Auth
// ============================================================
export const auth = betterAuth({
  database: drizzleAdapter(
    getDb({ DB: globalEnv.DB }),
    {
      provider: 'sqlite',
      schema: {
        users,
        sessions,
        accounts,
      },
    }
  ),

  baseURL: globalEnv.BETTER_AUTH_URL || globalEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
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
        async verify({ input }: { input: TelegramInput }) {
          const botToken = globalEnv.TELEGRAM_BOT_TOKEN;
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

          const localDb = getDb({ DB: globalEnv.DB });

          // ✅ استخدم select بدل query.users
          const existingUsers = await localDb
            .select()
            .from(users)
            .where(eq(users.telegramId, input.telegramId))
            .limit(1);

          let finalUser = existingUsers[0];

          if (!finalUser) {
            const fullName = `${input.first_name || ''} ${input.last_name || ''}`.trim() || input.username || 'مستخدم تليجرام';

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
            email: finalUser.email || undefined,
            image: finalUser.image || undefined,
          };
        },
      },
    },

    // ============================================================
    // 2. مزود Backup PIN
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
        async verify({ input }: { input: PinInput }) {
          const localDb = getDb({ DB: globalEnv.DB });

          // ✅ استخدم select بدل query.users
          const existingUsers = await localDb
            .select()
            .from(users)
            .where(eq(users.phoneNumber, input.phone))
            .limit(1);

          const user = existingUsers[0];

          if (!user || !user.backupPin || user.status !== 'active') {
            return null;
          }

          try {
            const isValid = await bcrypt.compare(input.pin, user.backupPin);
            if (!isValid) return null;
          } catch {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email || undefined,
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