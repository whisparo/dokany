// src/lib/telegram/handlers/phone-step.ts
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';
import { safeExecute } from '@/lib/errors/safe-executor';

// ✅ توحيد الواجهة مع البواب المركزي لامتثال الـ Cloudflare Pages Runtime
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handlePhoneStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 1️⃣ حارس الأمان المحدث والمؤمن: التحقق من الهوية وقاعدة البيانات الصريحة
  if (!ctx.telegramUserId || !ctx.env?.DB) {
    console.error('❌ [PhoneStep] Critical Fatal: telegramUserId or env.DB is missing from HandlerContext');
    return {
      reply: '❌ عذراً، لم نتمكن من التحقق من هويتك أو الاتصال بالنظام. يرجى إعادة إرسال /start للمحاولة مجدداً.',
      session: ctx.session,
    };
  }

  const db = drizzle(ctx.env.DB);
  const contact = ctx.contact;
  
  // 🛡️ تأمين جراحي: قراءة الرسالة النصية فقط لو لم يكن كائن الاتصال (Contact) متوفراً لمنع الـ trim crash
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

  // 3️⃣ تنفيذ عمليات قاعدة البيانات تحت مظلة الـ Safe Executor
  const dbOperation = await safeExecute<{ existingStoreName?: string; shouldInsert: boolean }>(async () => {
    // التحقق من وجود المستخدم برقم الهاتف
    const existingUser = await db.select().from(users).where(eq(users.phoneNumber, phone)).get();
    
    if (existingUser) {
      const existingStore = await db.select().from(stores).where(eq(stores.ownerId, existingUser.id)).get();
      if (existingStore) {
        return { existingStoreName: existingStore.name, shouldInsert: false };
      }
      return { shouldInsert: false };
    }

    // 4️⃣ 🎯 بصم التاجر في الداتابيز بطريقة ممتثلة تماماً للسكيما
    await db.insert(users).values({
      id: String(ctx.telegramUserId),          // ID التاجر الموحد
      telegramId: String(ctx.telegramUserId),  // القيد المطلوب لحل مشكلة chk_auth_telegram
      phoneNumber: phone,                      // رقم الهاتف المفعل
      name: '',                                // اسم فاضي مؤقتاً لخطوة الاسم
      authMethod: 'telegram',                  // طريقة التسجيل الرسمية
      updatedAt: new Date()                    // طابع زمني نظيف ممتثل للسكيما
    });

    console.log(`🎯 [PhoneStep] New user inserted successfully to DB with ID: ${ctx.telegramUserId}`);
    return { shouldInsert: true };

  }, {
    fallback: { shouldInsert: false, existingStoreName: undefined },
    context: {
      userId: String(ctx.telegramUserId),
      path: 'phone_step_db_ops',
      extras: { phone }
    }
  });

  if (dbOperation && dbOperation.existingStoreName) {
    return {
      reply: `❌ عذراً، رقم الهاتف ${phone} مسجل لدينا بمتجر "${dbOperation.existingStoreName}".\nلا يمكن للرقم الواحد إنشاء أكثر من متجر.`,
      buttons: [],
      session: { step: 'phone' }, 
    };
  }

  // 5️⃣ 🚀 النجاح الصريح والانتقال لـ name بكل أمان وثبات
  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: { 
      step: 'name',       
      phone: phone,       
    },
  };
}