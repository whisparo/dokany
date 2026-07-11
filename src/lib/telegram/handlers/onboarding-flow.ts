// src/lib/telegram/handlers/onboarding-flow.ts
import type { D1Database } from '@cloudflare/workers-types'; // 👈 استيراد النوع الصارم والأصلي لـ D1
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteSession, saveSession } from '../memory'; 
import type { HandlerContext, HandlerResult, SessionData } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; 

import { handlePhoneStep } from './phone-step';
import { handleNameStep } from './name-step';
import { handleStoreStep } from './store-step';
import { handleEmailStep } from './email-step'; 
import { handleNicheStep } from './niche-step';

// 🎯 الهيكل التتابعي الخماسي الصارم للمنصة
const STEPS = ['phone', 'name', 'store', 'email', 'niche'] as const;
type OnboardingStep = (typeof STEPS)[number];

// تأمين بيئة الـ Edge والـ Workers بالأنواع الصريحة بنسبة 100%
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database }; // 👈 وداعاً لأي any
}

export async function handleOnboarding(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // تهيئة الداتابيز لايف وبشكل موحد
  const db = getDb(ctx.env);

  // 1️⃣ لو الحساب مكتمل، ارميه على لوحة التحكم فوراً
  if (ctx.session?.step === 'completed') {
    return handleGetDashboard(ctx);
  }

  // 2️⃣ البداية الصريحة والمستقلة لإعادة التعيين
  if (ctx.message === '/start') {
    await deleteSession(db, ctx.platform, ctx.externalId);
    return {
      reply:
        '🚀 مرحباً بك في منصة دكاني! المنصة الأسرع لإنشاء متجرك الإلكتروني وإدارته بالكامل عبر تيليجرام.\n\nلبدء إنشاء متجرك في أقل من دقيقة، يرجى مشاركة رقم هاتفك عبر الزر بالأسفل أو إرساله مباشرة:',
      buttons: [[{ text: '📱 مشاركة رقم الهاتف', callback_data: 'share_contact' }]],
      session: { step: 'phone' },
    };
  }

  // 3️⃣ تأمين الـ Contact المباشر القادم من زر التليجرام
  if (ctx.contact && (!ctx.session || !ctx.session.step || ctx.session.step === 'phone')) {
    ctx.session = { ...ctx.session, step: 'phone' };
    return handlePhoneStep(ctx);
  }

  // 4️⃣ 🎯 كبسولة الـ Self-Healing الأسطورية المعدلة والمحصنة ضد التداخل
  if (!ctx.session || !ctx.session.step || Object.keys(ctx.session).length === 0) {
    console.log(`⚠️ [Onboarding] Session lost for ${ctx.externalId}, reconstructing from DB...`);
    
    const existingUser = ctx.telegramUserId 
      ? await db.query.users.findFirst({ where: eq(users.id, String(ctx.telegramUserId)) })
      : null;

    if (!existingUser) {
      ctx.session = { step: 'phone' };
    } else {
      const existingStore = await db.query.stores.findFirst({ where: eq(stores.ownerId, existingUser.id) });
      
      if (existingStore) {
        ctx.session = { 
          step: 'completed', 
          phone: existingUser.phoneNumber || undefined, 
          name: existingUser.name,
          email: existingUser.email || undefined 
        };
      } else if (!existingUser.name || existingUser.name.trim() === '') {
        ctx.session = { step: 'name', phone: existingUser.phoneNumber || undefined };
      } else {
        const currentMsg = ctx.message?.trim() || '';
        const niches = ['ملابس', '👗 ملابس', 'إلكترونيات', '📱 إلكترونيات', 'تجميل', '💄 تجميل', 'مجوهرات', '💍 مجوهرات', 'أحذية', '👟 أحذية', 'اكسسوارات', '👜 اكسسوارات', 'أخرى', '📦 أخرى', '📦 تخصص آخر', 'تخصص آخر'];
        
        const isNicheClick = niches.includes(currentMsg) || currentMsg.startsWith('__custom__::');

        if (isNicheClick) {
          ctx.session = {
            step: 'niche',
            phone: existingUser.phoneNumber || undefined,
            name: existingUser.name,
            email: existingUser.email || undefined,
            storeName: `متجر ${existingUser.name || 'دكاني'}`
          };
        } else if (!existingUser.email || existingUser.email.trim() === '') {
          ctx.session = {
            step: 'email',
            phone: existingUser.phoneNumber || undefined,
            name: existingUser.name,
            storeName: `متجر ${existingUser.name || 'دكاني'}`
          };
        } else {
          ctx.session = { 
            step: 'store', 
            phone: existingUser.phoneNumber || undefined, 
            name: existingUser.name 
          };
        }
      }
    }
    
    // حفظ الجلسة المكتشفة في الذاكرة فوراً لقفل الثغرة
    await saveSession(db, ctx.platform, ctx.externalId, { ...ctx.session });

    // 🚀 [الـ Short-Circuit السحري]: التوجيه الفوري للمعالج المختص دون النزول والخلط مع الكود السفلي
    const healedStep = ctx.session.step as OnboardingStep;
    console.log(`⚡ [Self-Healing] Forwarding message immediately to handling step: ${healedStep}`);
    switch (healedStep) {
      case 'phone': return handlePhoneStep(ctx);
      case 'name': return handleNameStep(ctx);
      case 'store': return handleStoreStep(ctx);
      case 'email': return handleEmailStep(ctx);
      case 'niche': return handleNicheStep(ctx);
    }
  }

  // الجلسة مستقرة مسبقاً، التقط الكلمة الحالية والأمر الحالي ونفذ بشكل طبيعي
  const step = ctx.session.step as OnboardingStep;
  const msg = ctx.message ? ctx.message.trim() : '';

  // 5️⃣ الأوامر والعمليات العامة
  if (msg === 'رجوع') return handleBack(ctx, step);
  if (msg === 'إلغاء') {
    await deleteSession(db, ctx.platform, ctx.externalId);
    return {
      reply: '❌ تم إلغاء عملية التسجيل بنجاح. يمكنك البدء من جديد في أي وقت بإرسال /start.',
      buttons: [],
    };
  }
  if (msg === 'مساعدة') {
    return {
      reply: `💡 دليل سريع: أنت الآن في خطوة [${step}]. اتبع التعليمات الظاهرة في الرسالة السابقة، أو اكتب "إلغاء" للتوقف.`,
    };
  }

  // 6️⃣ التوجيه الافتراضي والآمن للجلسات القائمة والمستقرة
  switch (step) {
    case 'phone':
      return handlePhoneStep(ctx);
    case 'name':
      return handleNameStep(ctx);
    case 'store':
      return handleStoreStep(ctx);
    case 'email':
      return handleEmailStep(ctx); 
    case 'niche':
      return handleNicheStep(ctx);
    default:
      return { reply: '❌ حدث خطأ في حالة التسجيل. أرسل /start للبدء من جديد.' };
  }
}

async function handleBack(ctx: SecureHandlerContext, currentStep: string): Promise<HandlerResult> {
  const db = getDb(ctx.env);
  const idx = STEPS.indexOf(currentStep as OnboardingStep);

  if (idx <= 0) {
    await deleteSession(db, ctx.platform, ctx.externalId);
    return { reply: '❌ تم إلغاء عملية التسجيل.' };
  }

  const prevStep = STEPS[idx - 1];
  const updatedSession: SessionData = { ...ctx.session, step: prevStep };

  if (prevStep === 'niche') {
    return {
      reply: '🎯 يرجى اختيار مجال متجرك (النيش):',
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
      session: updatedSession,
    };
  }

  if (prevStep === 'email') {
    const { email, ...rest } = updatedSession;
    return {
      reply: '📧 يرجى إدخال بريدك الإلكتروني الآن (لأمان حسابك وإرسال روابط الدخول السحرية):',
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
      session: rest,
    };
  }

  if (prevStep === 'store') {
    const { storeName, nicheAttempts, ...rest } = updatedSession;
    return {
      reply: '🏪 ما هو الاسم الذي تحب أن تطلقه على متجرك؟',
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
      session: rest,
    };
  }

  if (prevStep === 'name') {
    const { name, ...rest } = updatedSession;
    return {
      reply: '👋 يرجى إدخال اسمك الشخصي (اسم التاجر):',
      buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
      session: rest,
    };
  }

  if (prevStep === 'phone') {
    const { phone, ...rest } = updatedSession;
    return {
      reply: '🚀 يرجى مشاركة رقم هاتفك عبر الزر بالأسفل أو إرساله مباشرة لبدء إنشاء المتجر:',
      buttons: [[{ text: '📱 مشاركة رقم الهاتف', callback_data: 'share_contact' }]],
      session: rest,
    };
  }

  return { reply: '❌ خطأ في الرجوع.' };
}

export async function handleGetDashboard(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const db = getDb(ctx.env);
  const telegramUserId = ctx.telegramUserId;
  if (!telegramUserId) {
    return { reply: '❌ لم نتمكن من التحقق من هويتك. حاول مرة أخرى.' };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, String(telegramUserId)),
  });

  if (!user) {
    return { reply: '❌ لم نعثر على حساب مرتبط. أنشئ متجرك أولاً.' };
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.ownerId, user.id),
  });

  if (!store) {
    return { reply: '❌ ليس لديك متجر بعد. أرسل /start لإنشاء واحد.' };
  }

  const loginLink = `https://dokany.pages.dev/dashboard?user=${user.id}&store=${store.id}`;

    return {

    reply: `🔗 تم تجهيز رابط الدخول الخاص بك لمتجر "${store.name}":`,

    buttons: [[{ text: '🚀 افتح لوحة التحكم', url: loginLink }]],

  };

}