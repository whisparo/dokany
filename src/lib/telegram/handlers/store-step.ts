// src/lib/telegram/handlers/store-step.ts

import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { saveSession } from '../memory';
import { safeExecute } from '@/lib/errors/safe-executor';

interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handleStoreStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const storeName = ctx.message.trim();

  if (storeName.length < 2 || storeName.length > 50) {
    return {
      reply: '❌ اسم المتجر يجب أن يكون بين 2 و 50 حرفاً. يرجى المحاولة مرة أخرى:',
      session: ctx.session,
    };
  }

  const db = getDb(ctx.env);
  let phone = ctx.session?.phone;
  let name = ctx.session?.name;

  // استعادة البيانات المفقودة من قاعدة البيانات إذا لزم الأمر
  if ((!phone || !name) && ctx.telegramUserId) {
    console.log(`🔍 [StoreStep] Fetching missing user data for Telegram ID: ${ctx.telegramUserId}...`);

    const recoveredUserData = await safeExecute<{ phoneNumber?: string; name?: string } | null>(
      async () => {
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, String(ctx.telegramUserId)))
          .get();

        if (dbUser) {
          return {
            phoneNumber: dbUser.phoneNumber || undefined,
            name: dbUser.name || undefined,
          };
        }
        return null;
      },
      {
        fallback: null,
        context: {
          userId: String(ctx.telegramUserId),
          path: 'store_step_session_healing',
          extras: { storeName },
        },
      }
    );

    if (recoveredUserData) {
      phone = phone || recoveredUserData.phoneNumber;
      name = name || recoveredUserData.name;
    }
  }

  const nextSession = {
    ...ctx.session,
    step: 'niche' as const,
    storeName,
    phone,
    name,
  };

  // حفظ الجلسة باستخدام db
  await saveSession(db, ctx.platform, ctx.externalId, nextSession);

  return {
    reply: `🏪 متجر "${storeName}".. اسم رائع!\nأخيراً، اختر تخصص متجرك من الأزرار بالأسفل، أو اختر "تخصص آخر" واكتبه بنفسك:`,
    buttons: [
      [{ text: '👗 ملابس', value: '👗 ملابس' }, { text: '📱 إلكترونيات', value: '📱 إلكترونيات' }],
      [{ text: '💄 تجميل', value: '💄 تجميل' }, { text: '💍 مجوهرات', value: '💍 مجوهرات' }],
      [{ text: '👟 أحذية', value: '👟 أحذية' }, { text: '👜 اكسسوارات', value: '👜 اكسسوارات' }],
      [{ text: '📦 تخصص آخر', value: '📦 تخصص آخر' }],
      [{ text: '🔙 رجوع', value: 'رجوع' }],
    ],
    session: nextSession,
  };
}