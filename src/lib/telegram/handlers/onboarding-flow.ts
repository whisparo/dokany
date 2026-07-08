// src/lib/telegram/handlers/onboarding-flow.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { users, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteSession, saveSession } from '../memory'; 
import type { HandlerContext, HandlerResult, OnboardingSession } from '@/lib/telegram/types';

import { handlePhoneStep } from './phone-step';
import { handleNameStep } from './name-step';
import { handleStoreStep } from './store-step';
import { handleNicheStep } from './niche-step';

// استيراد أدوات الدستور الثامن لإدارة الأخطاء والأداء
import { safeExecute } from '@/lib/errors/safe-executor';

const STEPS = ['phone', 'name', 'store', 'niche'] as const;
type OnboardingStep = (typeof STEPS)[number];

interface SecureHandlerContext extends HandlerContext {
  d1Database?: D1Database; // حقن الـ D1Instance لامتثال الـ Edge Runtime
}

export async function handleOnboarding(ctx: SecureHandlerContext): Promise<HandlerResult> {
  // جارد فوري للتأكد من وجود قاعدة البيانات قبل بدء العمليات
  if (!ctx.d1Database) {
    console.error('❌ [Onboarding] Critical Fatal: d1Database instance is missing from HandlerContext');
    return { reply: '❌ عذراً، النظام غير جاهز حالياً لمعالجة الطلبات. أرسل /start مجدداً.' };
  }

  // 1️⃣ لو الحساب مكتمل، ارميه على لوحة التحكم فوراً
  if (ctx.session?.step === 'completed') {
    return handleGetDashboard(ctx);
  }

  // 2️⃣ البداية الصريحة
  if (ctx.message === '/start') {
    await deleteSession(ctx.platform, ctx.externalId);
    return {
      reply:
        '🚀 مرحباً بك في منصة دكاني! المنصة الأسرع لإنشاء متجرك الإلكتروني وإدارته بالكامل عبر تيليجرام.\n\nلبدء إنشاء متجرك في أقل من دقيقة، يرجى مشاركة رقم هاتفك عبر الزر بالأسفل أو إرساله مباشرة:',
      buttons: [[{ text: '📱 مشاركة رقم الهاتف', callback_data: 'share_contact' }]],
      session: { step: 'phone' },
    };
  }

  // 3️⃣ تأمين الـ Contact: يشتغل فقط لو الـ step الحالية هي فعلاً phone أو الجلسة جديدة
  if (ctx.contact && (!ctx.session || !ctx.session.step || ctx.session.step === 'phone')) {
    ctx.session = { ...ctx.session, step: 'phone' };
    return handlePhoneStep(ctx);
  }

  // 4️⃣ 🎯 الكبسولة السحرية (Self-Healing) المتوافقة مع تيبات الـ SafeExecutor المعقدة
  if (!ctx.session || !ctx.session.step || Object.keys(ctx.session).length === 0) {
    console.log(`⚠️ [Onboarding] Session lost for ${ctx.externalId}, reconstructing from DB...`);
    
    const db = drizzle(ctx.d1Database);

    // نمرر الـ Generic كـ OnboardingSession صريحة
    const healingResult = await safeExecute<OnboardingSession>(async () => {
      const existingUser = ctx.telegramUserId 
        ? await db.select().from(users).where(eq(users.telegramId, String(ctx.telegramUserId))).get()
        : null;

      if (!existingUser) {
        return { step: 'phone' };
      }

      const existingStore = await db.select().from(stores).where(eq(stores.ownerId, existingUser.id)).get();
      
      if (existingStore) {
        return { step: 'completed', phone: existingUser.phoneNumber || undefined, name: existingUser.name };
      } 
      
      if (!existingUser.name || existingUser.name.trim() === '') {
        return { step: 'name', phone: existingUser.phoneNumber || undefined };
      }

      const currentMsg = ctx.message?.trim() || '';
      const niches = ['ملابس', '👗 ملابس', 'إلكترونيات', '📱 إلكترونيات', 'تجميل', '💄 تجميل', 'مجوهرات', '💍 مجوهرات', 'أحذية', '👟 أحذية', 'اكسسوارات', '👜 اكسسوارات', 'أخرى', '📦 أخرى', '📦 تخصص آخر', 'تخصص آخر'];
      const isNicheClick = niches.includes(currentMsg) || currentMsg.startsWith('__custom__::');

      if (isNicheClick) {
        return {
          step: 'niche',
          phone: existingUser.phoneNumber || undefined,
          name: existingUser.name,
          storeName: `متجر ${existingUser.name || 'دكاني'}`
        };
      }

      return { 
        step: 'store', 
        phone: existingUser.phoneNumber || undefined, 
        name: existingUser.name 
      };
    }, {
      fallback: { step: 'phone' },
      context: {
        userId: ctx.telegramUserId ? String(ctx.telegramUserId) : undefined,
        path: 'onboarding_healing',
        extras: { externalId: ctx.externalId }
      }
    });

    // 🧠 حل لقطة الـ ctx.session: لو الـ safeExecute رجعت undefined نضمن عدم الانهيار بوضع الـ fallback هنا برضه
    ctx.session = healingResult || { step: 'phone' };
    await saveSession(ctx.platform, ctx.externalId, { ...ctx.session });
  }

  // الآن الـ step مضمونة ومستقرة تماماً
  const step = ctx.session.step as OnboardingStep;
  const msg = ctx.message.trim();

  // 5️⃣ الأوامر العامة
  if (msg === 'رجوع') return handleBack(ctx, step);
  if (msg === 'إلغاء') {
    await deleteSession(ctx.platform, ctx.externalId);
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

  // 6️⃣ توجيه آمن وصارم للصناديق المختصة بالخطوات
  switch (step) {
    case 'phone':
      return handlePhoneStep(ctx);
    case 'name':
      return handleNameStep(ctx);
    case 'store':
      return handleStoreStep(ctx);
    case 'niche':
      return handleNicheStep(ctx);
    default:
      return { reply: '❌ حدث خطأ في حالة التسجيل. أرسل /start للبدء من جديد.' };
  }
}

async function handleBack(ctx: SecureHandlerContext, currentStep: string): Promise<HandlerResult> {
  const idx = STEPS.indexOf(currentStep as OnboardingStep);

  if (idx <= 0) {
    await deleteSession(ctx.platform, ctx.externalId);
    return { reply: '❌ تم إلغاء عملية التسجيل.' };
  }

  const prevStep = STEPS[idx - 1];
  const updatedSession = { ...ctx.session, step: prevStep };

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
  const telegramUserId = ctx.telegramUserId;
  if (!telegramUserId || !ctx.d1Database) {
    return { reply: '❌ لم نتمكن من التحقق من هويتك أو الاتصال بالنظام. حاول مرة أخرى.' };
  }

  const db = drizzle(ctx.d1Database);

  const finalResult = await safeExecute<HandlerResult>(async () => {
    const user = await db.select().from(users).where(eq(users.telegramId, String(telegramUserId))).get();

    if (!user) {
      return { reply: '❌ لم نعثر على حساب مرتبط. أنشئ متجرك أولاً.' };
    }

    const store = await db.select().from(stores).where(eq(stores.ownerId, user.id)).get();

    if (!store) {
      return { reply: '❌ ليس لديك متجر بعد. أرسل /start لإنشاء واحد.' };
    }

    const loginLink = `https://dokanyy.vercel.app/dashboard?user=${user.id}&store=${store.id}`;

    return {
      reply: `🔗 تم تجهيز رابط الدخول الخاص بك لمتجر "${store.name}":`,
      buttons: [[{ text: '🚀 افتح لوحة التحكم', url: loginLink }]],
    };
  }, {
    fallback: { reply: '❌ عذراً، نواجه ضغطاً في الخوادم حالياً. يرجى كتابة /start بعد لحظات.' },
    context: {
      userId: String(telegramUserId),
      path: 'get_dashboard'
    }
  });

  // 🧠 لقطة السنيور الأخيرة: نضمن إن الريتيرن مستحيل يسرب undefined للـ HandlerResult
  return finalResult || { reply: '❌ عذراً، حدث خطأ غير متوقع في جلب لوحة التحكم.' };
}