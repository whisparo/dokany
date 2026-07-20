// src/lib/auth.ts

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/lib/db/db'; 
import * as schema from '@/lib/db/schema'; // 👈 استيراد الـ Schema الكاملة
import { users } from '@/lib/db/schema/users';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';

interface CloudflareWorkerEnv {
  DB: D1Database;
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

async function verifyTelegramHash(data: Record<string, string | undefined>, botToken: string): Promise<boolean> {
  if (!data.hash || !data.auth_date) return false;

  const authDate = parseInt(data.auth_date, 10);
  if (Math.floor(Date.now() / 1000) - authDate > 86400) return false;

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

const globalEnv = (typeof process !== 'undefined' ? process.env : {}) as unknown as CloudflareWorkerEnv;

// 1. جلب instance من الـ Database مع ربط الـ Schema الموحد
const db = getDb({ DB: globalEnv.DB });

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite', 
    schema: schema, // 👈 التمرير المباشر لكائن الـ Schema بيغذي Better-Auth بالتايبات المظبوطة
  }),
  
  baseURL: globalEnv.BETTER_AUTH_URL || globalEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  providers: [
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

          // 🎯 استخدام db المجهزة بالـ Schema بدون إعادة استدعاء متكرر
          const localDb = getDb({ DB: globalEnv.DB });

          const user = await localDb.query.users.findFirst({
            where: eq(users.telegramId, input.telegramId),
          });

          let finalUser = user;

          if (!finalUser) {
            const fullName = `${input.first_name || ''} ${input.last_name || ''}`.trim() || input.username || 'مستخدم تليجرام';
            
            const newUser = await localDb.insert(users).values({
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
            }).returning();

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

          const user = await localDb.query.users.findFirst({
            where: eq(users.phoneNumber, input.phone),
          });

          if (!user || !user.backupPin || user.status !== 'active') {
            return null;
          }

          // تم استبدال bcrypt بـ Web Crypto / bcrypt-ts المتوافق مع Edge Runtime
          const bcrypt = await import('bcrypt-ts');
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