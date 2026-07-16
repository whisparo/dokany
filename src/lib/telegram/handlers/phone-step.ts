// src/lib/telegram/handlers/phone-step.ts
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';
import { saveSession } from '../memory';
import { getDb } from '@/lib/db';

interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handlePhoneStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 0️⃣ حارس الأمان الصارم للخطوة: لو مش خطوة الـ phone اخرج فوراً لمنع التداخل
  if (ctx.session?.step && ctx.session.step !== 'phone') {
    return { reply: '', session: ctx.session };
  }

  // 🎯 1️⃣ حارس الأمان (Guard Clause)
  if (!ctx.telegramUserId || !ctx.env?.DB) {
    console.error('❌ [PhoneStep] Critical: telegramUserId or env.DB is missing');
    return {
      reply: '❌ عذراً، لم نتمكن من التحقق من هويتك. يرجى إعادة إرسال /start مجدداً.',
      session: ctx.session,
    };
  }

  const db = getDb(ctx.env);

  // 🛡️ [تعديل حاسم لمنع الـ Race Condition]: 
  // التحقق أولاً هل هذا المستخدم مسجل بالفعل وله رقم هاتف في الداتابيز؟
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, String(ctx.telegramUserId)),
  });

  if (dbUser && dbUser.phoneNumber) {
    console.log(`⚡ [PhoneStep Bypass] User ${ctx.telegramUserId} already has phone: ${dbUser.phoneNumber}. Redirecting to name step.`);
    const nextSession = { 
      step: 'name' as const,      
      phone: dbUser.phoneNumber,      
    };
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    
    // إذا كان المدخل الحالي هو الاسم (وليس رقم هاتف)، دعه يمر كـ Name مباشرة دون إظهار رسالة خطأ الهاتف!
    return {
      reply: `✅ تم تأكيد رقم هاتفك مسبقاً.\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]], 
      session: nextSession,
    };
  }

  const contact = ctx.contact;
  let phone = contact?.phone_number || (ctx.message ? ctx.message.trim() : '');

  // 2️⃣ تنظيف وتجهيز الرقم
  phone = phone.replace(/\s/g, '').replace(/[^0-9+]/g, ''); // تنظيف إضافي لمنع النصوص من التحول لأرقام وهمية
  if (phone && !phone.startsWith('+')) phone = '+' + phone;

  if (!phone || !isValidPhone(phone)) {
    return {
      reply: '❌ رقم الهاتف غير صحيح. يرجى إرسال رقم هاتف صالح أو استخدام زر "مشاركة رقم الهاتف" بالأسفل.',
      session: ctx.session,
    };
  }

  // 3️⃣ التحقق من التكرار في قاعدة البيانات للرقم الجديد
  const existingUser = await db.query.users.findFirst({
    where: eq(users.phoneNumber, phone),
  });
  
  if (existingUser && String(existingUser.id) !== String(ctx.telegramUserId)) {
    const existingStore = await db.query.stores.findFirst({
      where: eq(stores.ownerId, existingUser.id),
    });
    
    if (existingStore) {
      return {
        reply: `❌ عذراً، رقم الهاتف ${phone} مسجل لدينا بمتجر "${existingStore.name}".\nلا يمكن للرقم الواحد إنشاء أكثر من متجر.`,
        buttons: [],
        session: { step: 'phone' }, 
      };
    }
  }

  // 4️⃣ بصم التاجر في الداتابيز
  try {
    if (!dbUser) {
      await db.insert(users).values({
        id: String(ctx.telegramUserId),          
        telegramId: String(ctx.telegramUserId),  
        phoneNumber: phone,                      
        name: '',                                
        authMethod: 'telegram',                  
        updatedAt: new Date(),                   
      });
      console.log(`🎯 [PhoneStep] New user inserted with phone: ${phone}`);
    } else if (!dbUser.phoneNumber) {
      await db.update(users)
        .set({ phoneNumber: phone, updatedAt: new Date() })
        .where(eq(users.id, String(ctx.telegramUserId)));
      console.log(`🎯 [PhoneStep] Existing user updated with phone: ${phone}`);
    }
  } catch (error) {
    console.error('❌ [PhoneStep] DB Error:', error);
  }

  // 5️⃣ 🚀 تجهيز الجلسة الجديدة للانتقال لخطوة الـ name
  const nextSession = { 
    step: 'name' as const,      
    phone: phone,      
  };

  // 💾 حفظ الجلسة فوراً
  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [PhoneStep] Session saved for step: name`);
  } catch (error) {
    console.error('❌ [PhoneStep] Failed to save session:', error);
  }

  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]], 
    session: nextSession,
  };
}