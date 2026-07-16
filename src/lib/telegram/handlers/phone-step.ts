// src/lib/telegram/handlers/phone-step.ts
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';
import { saveSession } from '../memory';
import { getDb } from '@/lib/db'; // 👈 استيراد التهيئة الموحدة لقاعدة البيانات

interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handlePhoneStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 0️⃣ حارس الأمان الصارم للخطوة: لو مش خطوة الـ phone اخرج فوراً لمنع التداخل
  if (ctx.session?.step && ctx.session.step !== 'phone') {
    return { reply: '', session: ctx.session };
  }

  // 🎯 1️⃣ حارس الأمان (Guard Clause): تأمين الـ telegramUserId والـ DB ومنع الـ undefined
  if (!ctx.telegramUserId || !ctx.env?.DB) {
    console.error('❌ [PhoneStep] Critical: telegramUserId or env.DB is missing from HandlerContext');
    return {
      reply: '❌ عذراً، لم نتمكن من التحقق من هويتك على تيليجرام. يرجى إعادة إرسال /start للمحاولة مجدداً.',
      session: ctx.session,
    };
  }

  // تهيئة الداتابيز بشكل موحد ومحمي
  const db = getDb(ctx.env);
  const contact = ctx.contact;
  
  let phone = contact?.phone_number || (ctx.message ? ctx.message.trim() : '');

  // 2️⃣ تنظيف وتجهيز الرقم
  phone = phone.replace(/\s/g, '');
  if (phone && !phone.startsWith('+')) phone = '+' + phone;

  if (!phone || !isValidPhone(phone)) {
    return {
      reply: '❌ رقم الهاتف غير صحيح. يرجى إرسال رقم هاتف صالح أو استخدام زر "مشاركة رقم الهاتف" بالأسفل.',
      session: ctx.session,
    };
  }

  // 3️⃣ التحقق من التكرار في قاعدة البيانات
  const existingUser = await db.query.users.findFirst({
    where: eq(users.phoneNumber, phone),
  });
  
  if (existingUser) {
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
    if (!existingUser) {
      await db.insert(users).values({
        id: String(ctx.telegramUserId),          
        telegramId: String(ctx.telegramUserId),  
        phoneNumber: phone,                      
        name: '',                                
        authMethod: 'telegram',                  
        updatedAt: new Date(),                   
      });
      
      console.log(`🎯 [PhoneStep] New user inserted successfully to DB with ID: ${ctx.telegramUserId}`);
    }
  } catch (error) {
    console.error('❌ [PhoneStep] Failed to insert user to DB:', error);
  }

  // 5️⃣ 🚀 تجهيز الجلسة الجديدة للانتقال لخطوة الـ name
  const nextSession = { 
    step: 'name' as const,      
    phone: phone,      
  };

  // 💾 حفظ الجلسة في الميموري/الداتابيز فوراً لمنع الـ Desync
  try {
    await saveSession(db, ctx.platform, ctx.externalId, nextSession);
    console.log(`💾 [PhoneStep] Session saved successfully for next step: name`);
  } catch (error) {
    console.error('❌ [PhoneStep] Failed to save session to memory:', error);
  }

  // 6️⃣ إرجاع رد النجاح والانتقال للخطوة التالية
  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]], 
    session: nextSession,
  };
}