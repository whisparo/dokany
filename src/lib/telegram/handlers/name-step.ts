// src/lib/telegram/handlers/name-step.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { saveSession } from '../memory'; 

// بنوسع الـ HandlerContext عشان نضمن إن الـ env أو الـ d1Database ممررين ومقروئين صح
interface SecureHandlerContext extends HandlerContext {
  d1Database?: D1Database; // حقن الـ D1Instance داخل الـ Context من الـ Router الرئيسي
}

export async function handleNameStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const name = ctx.message.trim();

  // 🎯 لو كتب الأوامر العامة دي سيبه يعدي ومتحظرش الاسم عشان الـ onboarding-flow يلقطها
  if (name === 'رجوع' || name === '/start' || name === 'إلغاء') {
    return { reply: '', session: ctx.session }; 
  }

  // 1️⃣ تأمين الـ Session عند الخطأ
  if (name.length < 1 || name.length > 40) {
    return {
      reply: '❌ الاسم غير صالح (يجب أن يكون بين 1 و 40 حرفاً). يرجى إدخال اسم صحيح:',
      session: ctx.session,
    };
  }

  // 2️⃣ 🎯 تحديث الاسم في قاعدة البيانات ديناميكياً باستخدام الـ Telegram ID
  if (ctx.d1Database && ctx.telegramUserId) {
    try {
      const db = drizzle(ctx.d1Database);
      
      // 🧠 لقطة سنيور: بنحدث بناءً على الـ telegramId لأن الـ user.id هو UUID لسه ماتعملش في الخطوة دي
      await db
        .update(users)
        .set({ name: name, updatedAt: new Date() })
        .where(eq(users.telegramId, String(ctx.telegramUserId)));
        
      console.log(`✅ [NameStep] Updated user name to: ${name} in DB for Telegram ID: ${ctx.telegramUserId}`);
    } catch (error) {
      console.error('❌ [NameStep] Failed to update name in DB:', error);
    }
  } else {
    console.warn('⚠️ [NameStep] Skipping DB update: d1Database or telegramUserId is missing in context');
  }

  // 3️⃣ تجهيز الـ Session الجديد بالملي
  const nextSession = {
    ...ctx.session,
    step: 'store' as const, 
    name,          
  };

  // 4️⃣ 🎯 الحفر الفوري في الـ Memory لمنع الـ Session Loss
  await saveSession(ctx.platform, ctx.externalId, nextSession);

  // 5️⃣ 🚀 النجاح والانتقال لخطوة اسم المتجر بكل أمان
  return {
    reply: `🎯 تشرفنا بك يا ${name}.\n\n🏪 الآن، ما هو الاسم الذي تحب أن تطلقه على متجرك؟ (مثال: متجر موضة):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: nextSession,
  };
}