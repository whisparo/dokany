// src/lib/telegram/handlers/email-step.ts
import type { D1Database } from '@cloudflare/workers-types'; // 👈 استيراد النوع الحقيقي لـ D1
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; 
import { saveSession } from '../memory';

// 🛡️ تحديد النوع الحقيقي والصارم للـ Environment بدون any
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database }; // 👈 هنا الشغل البيور والسنيور الصح
}

export async function handleEmailStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // تأمين صريح لقراءة النص وتحويله للأحرف الصغيرة لمنع أي مشاكل
  const email = ctx.message ? ctx.message.trim().toLowerCase() : '';

  // 🎯 لو كتب الأوامر العامة دي سيبه يعدي ومتحظرش النص عشان الـ onboarding-flow يلقطها
  if (email === 'رجوع' || email === '/start' || email === 'إلغاء') {
    return { reply: '', session: ctx.session }; 
  }

  // 1️⃣ التحقق من صحة البريد الإلكتروني
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email.length > 100) {
    return {
      reply: '❌ البريد الإلكتروني غير صحيح. يرجى إدخال بريد إلكتروني صالح (مثال: name@example.com):',
      session: ctx.session,
    };
  }

  // تهيئة الـ db لايف الموحدة والمتوافقة مع سيرفر الـ Edge
  const db = getDb(ctx.env);

  // 2️⃣ 🎯 بصم البريد الإلكتروني في الداتابيز فوراً بناءً على الـ id الأساسي للتاجر
  try {
    if (ctx.telegramUserId) {
      await db
        .update(users)
        .set({ email: email, updatedAt: new Date() })
        .where(eq(users.id, String(ctx.telegramUserId)));
      console.log(`✅ [EmailStep] Updated user email to: ${email} in DB`);
    }
  } catch (error) {
    console.error('❌ [EmailStep] Failed to update email in DB:', error);
  }

  // 3️⃣ تجهيز الـ Session الجديد للخطوة القادمة (النيش) بالملي
  const nextSession = {
    ...ctx.session,
    step: 'niche' as const, 
    email,          
  };

  // 4️⃣ 🎯 الحفر الفوري في الـ Memory لمنع الـ Session Loss
  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [EmailStep] Session saved successfully for next step: niche`);
  } catch (error) {
    console.error('❌ [EmailStep] Failed to save session to memory:', error);
  }

  // 5️⃣ 🚀 النجاح والانتقال لخطوة الـ Niche بكل أمان وتقديم الخيارات للتاجر
  return {
    reply: `📧 تم حفظ بريدك الإلكتروني بنجاح.\n\n🎯 خطوتنا الأخيرة، يرجى اختيار تخصص أو مجال متجرك (النيش) من الخيارات بالأسفل لتجهيز لوحة التحكم الخاصة بك:`,
    buttons: [
      [{ text: '👗 ملابس', value: 'ملابس' }, { text: '📱 إلكترونيات', value: 'إلكترونيات' }],
      [{ text: '💄 تجميل', value: 'تجميل' }, { text: '👜 اكسسوارات', value: 'اكسسوارات' }],
      [{ text: '📦 تخصص آخر', value: 'تخصص آخر' }],
      [{ text: '🔙 رجوع', value: 'رجوع' }]
    ],
    session: nextSession,
  };
}