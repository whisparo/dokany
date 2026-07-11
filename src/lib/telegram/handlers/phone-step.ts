// src/lib/telegram/handlers/phone-step.ts
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';

// 🛡️ توسيع الواجهة الصريحة لامتثال الـ Cloudflare Environment
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handlePhoneStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 1️⃣ حارس الأمان (Guard Clause): تأمين الـ telegramUserId والـ DB ومنع الـ undefined تماماً
  if (!ctx.telegramUserId || !ctx.env?.DB) {
    console.error('❌ [PhoneStep] Critical: telegramUserId or env.DB is missing from HandlerContext');
    return {
      reply: '❌ عذراً، لم نتمكن من التحقق من هويتك على تيليجرام. يرجى إعادة إرسال /start للمحاولة مجدداً.',
      session: ctx.session,
    };
  }

  // تهيئة الـ Drizzle باستخدام الـ D1 Binding الممرر لايف
  const db = drizzle(ctx.env.DB);
  const contact = ctx.contact;
  
  // تأمين جراحي لمنع الـ trim crash لو الـ message مش نصية (جاي كائن اتصال)
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

  // 3️⃣ التحقق من التكرار في قاعدة البيانات (بصيغة متوافقة مع الـ Cloudflare Worker runtime بدون .query)
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

  // 4️⃣ 🎯 بصم التاجر في الداتابيز (تطهير كامل من الـ as any وضمان توافق الأنواع)
  try {
    if (!existingUser) {
      await db.insert(users).values({
        id: String(ctx.telegramUserId),          // الـ ID الأساسي للمستخدم
        telegramId: String(ctx.telegramUserId),  // القيد المطلوب لحل مشكلة chk_auth_telegram
        phoneNumber: phone,                      // رقم الهاتف المفعل
        name: '',                                // اسم فاضي مؤقتاً لخطوة الاسم
        authMethod: 'telegram',                  // طريقة التسجيل
        updatedAt: new Date(),                   // طابع زمني نظيف متوافق مع الـ Schema
      });
      
      console.log(`🎯 [PhoneStep] New user inserted successfully to DB with ID: ${ctx.telegramUserId}`);
    }
  } catch (error) {
    console.error('❌ [PhoneStep] Failed to insert user to DB:', error);
  }

  // 5️⃣ 🚀 النجاح الصريح، الانتقال لـ name، وإخفاء كيبورد الهاتف بتمرير الـ Inline Buttons
  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    // تذكر: إرسال أزرار مخصصة (Inline Keyboard) هنا كفيل بإخفاء الـ Reply Keyboard القديم تلقائياً
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]], 
    session: { 
      step: 'name',      
      phone: phone,      
    },
  };
}