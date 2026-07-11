// src/lib/telegram/handlers/name-step.ts
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; // 👈 التعديل المعماري: استيراد المولد الموحد المتوافق مع الـ Edge
import { saveSession } from '../memory';

// تمديد الـ Interface لضمان قراءة الـ env.DB بأمان تام من الـ Context
interface SecureHandlerContext extends HandlerContext {
  env: { DB: any };
}

export async function handleNameStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // تأمين صريح لقراءة النص لمنع أي كراش غير متوقع في الـ runtime
  const name = ctx.message ? ctx.message.trim() : '';

  // 🎯 تعديل: لو كتب الأوامر العامة دي سيبه يعدي ومتحظرش الاسم عشان الـ onboarding-flow يلقطها
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

  // 🎯 التعديل المعماري: تهيئة الـ db لايف بناءً على طلب الـ Edge الحالي من getDb
  const db = getDb(ctx.env);

  // 2️⃣ 🎯 بصم الاسم في الداتابيز فوراً بناءً على الـ id الأساسي
  try {
    if (ctx.telegramUserId) {
      await db
        .update(users)
        .set({ name: name })
        .where(eq(users.id, String(ctx.telegramUserId)));
      console.log(`✅ [NameStep] Updated user name to: ${name} in DB`);
    }
  } catch (error) {
    console.error('❌ [NameStep] Failed to update name in DB:', error);
  }

  // 3️⃣ تجهيز الـ Session الجديد بالملي
  const nextSession = {
    ...ctx.session,
    step: 'store' as const, // التحويل الصريح للخطوة القادمة
    name,          
  };

  // 4️⃣ 🎯 الحفر الفوري في الـ Memory لمنع الـ Session Loss مع تمرير الـ db كـ باراميتر أول
  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [NameStep] Session saved successfully for next step: store`);
  } catch (error) {
    console.error('❌ [NameStep] Failed to save session to memory:', error);
  }

  // 5️⃣ 🚀 النجاح والانتقال لخطوة اسم المتجر بكل أمان
  return {
    reply: `🎯 تشرفنا بك يا ${name}.\n\n🏪 الآن، ما هو الاسم الذي تحب أن تطلقه على متجرك؟ (مثال: متجر موضة):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: nextSession,
  };
}