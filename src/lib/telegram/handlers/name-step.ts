// src/lib/telegram/handlers/name-step.ts

import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { saveSession } from '../memory';

// ✅ توسيع الـ Context ليشمل env (الذي يحتوي على DB)
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handleNameStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const name = ctx.message.trim();

  // أوامر التنقل
  if (name === 'رجوع' || name === '/start' || name === 'إلغاء') {
    return { reply: '', session: ctx.session };
  }

  // التحقق من صحة الاسم
  if (name.length < 1 || name.length > 40) {
    return {
      reply: '❌ الاسم غير صالح (يجب أن يكون بين 1 و 40 حرفاً). يرجى إدخال اسم صحيح:',
      session: ctx.session,
    };
  }

  // ✅ الحصول على كائن Drizzle الموحد
  const db = getDb(ctx.env);

  // تحديث الاسم في جدول users (باستخدام telegramId)
  if (ctx.telegramUserId) {
    try {
      await db
        .update(users)
        .set({ name, updatedAt: new Date() })
        .where(eq(users.telegramId, String(ctx.telegramUserId)));
      console.log(`✅ [NameStep] Updated user name to: ${name} for Telegram ID: ${ctx.telegramUserId}`);
    } catch (error) {
      console.error('❌ [NameStep] Failed to update name in DB:', error);
    }
  } else {
    console.warn('⚠️ [NameStep] telegramUserId is missing in context');
  }

  // تجهيز الجلسة الجديدة
  const nextSession = {
    ...ctx.session,
    step: 'store' as const,
    name,
  };

  // ✅ حفظ الجلسة باستخدام db وتمريره كأول معامل
  await saveSession(db, ctx.platform, ctx.externalId, nextSession);

  // الرد النهائي
  return {
    reply: `🎯 تشرفنا بك يا ${name}.\n\n🏪 الآن، ما هو الاسم الذي تحب أن تطلقه على متجرك؟ (مثال: متجر موضة):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: nextSession,
  };
}