// src/lib/telegram/handlers/phone-step.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { isValidPhone } from './onboarding-helpers';

// استيراد أدوات الدستور الثامن لإدارة الأخطاء والأداء والـ Safe Execution
import { safeExecute } from '@/lib/errors/safe-executor';

interface SecureHandlerContext extends HandlerContext {
  d1Database?: D1Database; // حقن الـ D1Instance لامتثال الـ Edge Runtime
}

export async function handlePhoneStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // 🎯 1️⃣ حارس الأمان (Guard Clause): تأمين الـ telegramUserId والـ d1Database ومنع الـ undefined تماماً
  if (!ctx.telegramUserId || !ctx.d1Database) {
    console.error('❌ [PhoneStep] Critical Fatal: telegramUserId or d1Database is missing from HandlerContext');
    return {
      reply: '❌ عذراً، لم نتمكن من التحقق من هويتك أو الاتصال بالنظام. يرجى إعادة إرسال /start للمحاولة مجدداً.',
      session: ctx.session,
    };
  }

  const db = drizzle(ctx.d1Database);
  const contact = ctx.contact;
  let phone = contact?.phone_number || ctx.message.trim();

  // 2️⃣ تنظيف وتجهيز الرقم
  phone = phone.replace(/\s/g, '');
  if (phone && !phone.startsWith('+')) phone = '+' + phone;

  if (!phone || !isValidPhone(phone)) {
    return {
      reply: '❌ رقم الهاتف غير صحيح. يرجى إرسال رقم هاتف صالح أو استخدام زر "مشاركة رقم الهاتف" بالأسفل.',
      session: ctx.session,
    };
  }

  // 3️⃣ تنفيذ عمليات قاعدة البيانات تحت مظلة الـ Safe Executor (الحركة عند الخطأ فقط)
  const dbOperation = await safeExecute<{ existingStoreName?: string; shouldInsert: boolean }>(async () => {
    // التحقق من وجود المستخدم برقم الهاتف
    const existingUser = await db.select().from(users).where(eq(users.phoneNumber, phone)).get();
    
    if (existingUser) {
      // التحقق من وجود متجر مرتبط بهذا المستخدم
      const existingStore = await db.select().from(stores).where(eq(stores.ownerId, existingUser.id)).get();
      
      if (existingStore) {
        return { existingStoreName: existingStore.name, shouldInsert: false };
      }
      return { shouldInsert: false };
    }

    // 4️⃣ 🎯 بصم التاجر في الداتابيز بطريقة ممتثلة تماماً للسكيما
    await db.insert(users).values({
      id: String(ctx.telegramUserId),          // الـ ID الأساسي للمستخدم
      telegramId: String(ctx.telegramUserId),  // القيد المطلوب لحل مشكلة chk_auth_telegram
      phoneNumber: phone,                      // رقم الهاتف المفعل
      name: '',                                // اسم فاضي مؤقتاً لخطوة الاسم
      authMethod: 'telegram',                  // طريقة التسجيل الرسمية
      updatedAt: new Date()                    // طابع زمني نظيف ممتثل للسكيما
    });

    console.log(`🎯 [PhoneStep] New user inserted successfully to DB with ID: ${ctx.telegramUserId}`);
    return { shouldInsert: true };

  }, {
    // Fallback آمن في حالة انهيار قاعدة البيانات لحماية تدفق الجلسة
    fallback: { shouldInsert: false, existingStoreName: undefined },
    // تمرير الـ Context المهيكل طبقاً للباب الثالث في الدستور الثامن
    context: {
      userId: String(ctx.telegramUserId),
      path: 'phone_step_db_ops',
      extras: { phone }
    }
  });

  // إذا كانت النتيجة الراجعة تعني وجود متجر مسجل بالفعل، نمنعه فوراً
  if (dbOperation && dbOperation.existingStoreName) {
    return {
      reply: `❌ عذراً، رقم الهاتف ${phone} مسجل لدينا بمتجر "${dbOperation.existingStoreName}".\nلا يمكن للرقم الواحد إنشاء أكثر من متجر.`,
      buttons: [],
      session: { step: 'phone' }, 
    };
  }

  // 5️⃣ 🚀 النجاح الصريح والانتقال لـ name بكل أمان
  return {
    reply: `✅ تم تفعيل وتأكيد رقم هاتفك بنجاح (${phone}).\n\n👋 يرجى الآن إدخال اسمك الشخصي (اسم التاجر):`,
    buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
    session: { 
      step: 'name',       
      phone: phone,       
    },
  };
}