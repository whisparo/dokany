// src/lib/telegram/handlers/name-step.ts
import type { D1Database } from '@cloudflare/workers-types'; 
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; 
import { saveSession } from '../memory';

interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database }; 
}

export async function handleNameStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 0️⃣ حارس الأمان الصارم: لو مش خطوة الـ name أو مفيش جلسة، اخرج فوراً لمنع التداخل مع التليفون
  if (!ctx.session || ctx.session.step !== 'name') {
    return { reply: '', session: ctx.session }; 
  }

  const name = ctx.message ? ctx.message.trim() : '';

  // تخطي الأوامر العامة
  if (name === 'رجوع' || name === '/start' || name === 'إلغاء') {
    return { reply: '', session: ctx.session }; 
  }

  // 1️⃣ حارس التحقق من صحة الاسم (تأكيد إنه مش رقم هاتف ناتج عن تداخل التليجرام)
  // لو الاسم بيبدأ بـ + أو عبارة عن أرقام فقط، ده معناه تداخل من خطوة الهاتف
  const isPhoneNumber = /^\+?[0-9\s\-]{7,20}$/.test(name);

  if (name.length < 2 || name.length > 40 || isPhoneNumber) {
    return {
      reply: '❌ يرجى إدخال اسم شخصي صحيح (وليس رقماً أو رمزاً)، لندعوك به في لوحة التحكم:',
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
      session: ctx.session,
    };
  }

  const db = getDb(ctx.env);

  // 2️⃣ تحديث الداتابيز بأمان
  try {
    if (ctx.telegramUserId) {
      await db
        .update(users)
        .set({ name: name, updatedAt: new Date() }) 
        .where(eq(users.id, String(ctx.telegramUserId)));
      console.log(`✅ [NameStep] Updated user name to: ${name} in DB`);
    }
  } catch (error) {
    console.error('❌ [NameStep] Failed to update name in DB:', error);
  }

  // 3️⃣ نقل الجلسة بشكل صريح لخطوة المتجر مع الحفاظ على البيانات السابقة
  const nextSession = {
    ...ctx.session,
    step: 'store' as const, 
    name: name,          
  };

  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [NameStep] Session saved successfully for next step: store`);
  } catch (error) {
    console.error('❌ [NameStep] Failed to save session to memory:', error);
  }

  // 4️⃣ الرد والانتقال
  return {
    reply: `🎯 تشرفنا بك يا مهندس ${name}.\n\n🏪 الآن، ما هو الاسم الذي تحب أن تطلقه على متجرك؟ (مثال: متجر موضة):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: nextSession,
  };
}