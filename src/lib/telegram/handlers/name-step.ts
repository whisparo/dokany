// src/lib/telegram/handlers/name-step.ts
import type { D1Database } from '@cloudflare/workers-types'; // 👈 استيراد النوع الصارم
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; 
import { saveSession } from '../memory';

// 🛡️ تأمين الأنواع بشكل صارم لمنع تشتت الـ Compiler
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database }; // ✅ تم التطهير من الـ any
}

export async function handleNameStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const name = ctx.message ? ctx.message.trim() : '';

  if (name === 'رجوع' || name === '/start' || name === 'إلغاء') {
    return { reply: '', session: ctx.session }; 
  }

  if (name.length < 1 || name.length > 40) {
    return {
      reply: '❌ الاسم غير صالح (يجب أن يكون بين 1 و 40 حرفاً). يرجى إدخال اسم صحيح:',
      session: ctx.session,
    };
  }

  const db = getDb(ctx.env);

  try {
    if (ctx.telegramUserId) {
      await db
        .update(users)
        .set({ name: name, updatedAt: new Date() }) // تحديث الطابع الزمني بالمرة
        .where(eq(users.id, String(ctx.telegramUserId)));
      console.log(`✅ [NameStep] Updated user name to: ${name} in DB`);
    }
  } catch (error) {
    console.error('❌ [NameStep] Failed to update name in DB:', error);
  }

  const nextSession = {
    ...ctx.session,
    step: 'store' as const, 
    name,          
  };

  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [NameStep] Session saved successfully for next step: store`);
  } catch (error) {
    console.error('❌ [NameStep] Failed to save session to memory:', error);
  }

  return {
    reply: `🎯 تشرفنا بك يا ${name}.\n\n🏪 الآن، ما هو الاسم الذي تحب أن تطلقه على متجرك؟ (مثال: متجر موضة):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: nextSession,
  };
}