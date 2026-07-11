// src/lib/telegram/handlers/phone-step.ts
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';

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

  const db = drizzle(ctx.env.DB);
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
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phone))
    .get();
  
  if (existingUser) {
    const existingStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, existingUser.id))
      .get();
    
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

  // 5️⃣ 🚀 النجاح الصريح، الانتقال لـ name
  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]], 
    session: { 
      step: 'name',      
      phone: phone,      
    },
  };
}