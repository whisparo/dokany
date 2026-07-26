// src/lib/telegram/handlers/onboarding-flow.ts

import type { D1Database } from '@cloudflare/workers-types'; 
import { users, stores } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { deleteSession, saveSession } from '../memory'; 
import type { HandlerContext, HandlerResult, SessionData } from '@/lib/telegram/types';
import { getDb } from '@/lib/db'; 

import { handlePhoneStep } from './phone-step';
import { handleNameStep } from './name-step';
import { handleStoreStep } from './store-step';
import { handleEmailStep } from './email-step'; 
import { handleNicheStep } from './niche-step';

const STEPS = ['phone', 'name', 'store', 'email', 'niche'] as const;
type OnboardingStep = (typeof STEPS)[number];

export interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database }; 
}

// 🎯 دالة مساعدة موحدة للبحث عن المستخدم بأي معرف تليجرام
async function findUserByTelegram(db: ReturnType<typeof getDb>, telegramUserId: string | number) {
  const strId = String(telegramUserId);
  return await db.query.users.findFirst({
    where: or(
      eq(users.id, strId),
      eq(users.telegramId, strId),
      eq(users.telegramChatId, strId)
    ),
  });
}

export async function handleOnboarding(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const db = getDb(ctx.env);

  // 🎯 جلب فوري للمستخدم من قاعدة البيانات لتأمين القرارات
  const dbUser = ctx.telegramUserId 
    ? await findUserByTelegram(db, ctx.telegramUserId)
    : null;

  // 1️⃣ لو الحساب مكتمل، تأكد أولاً إنه موجود في الداتابيز فعلياً
  if (ctx.session?.step === 'completed') {
    if (dbUser) {
      return handleGetDashboard(ctx, dbUser);
    } else {
      // لو الجلسة بتقول completed بس المستخدم مش موجود في الداتابيز، امسح الجلسة ووجّه للبدء
      await deleteSession(db, ctx.platform, ctx.externalId);
      ctx.session = { step: 'phone' };
    }
  }

  // 2️⃣ البداية الذكية المحصنة مع /start
  if (ctx.message === '/start') {
    if (dbUser) {
      // أ) فحص وجود متجر قائم
      const existingStore = await db.query.stores.findFirst({ where: eq(stores.ownerId, dbUser.id) });
      if (existingStore) {
        ctx.session = { step: 'completed' };
        await saveSession(db, ctx.platform, ctx.externalId, ctx.session);
        return handleGetDashboard(ctx, dbUser, existingStore);
      }

      // ب) فحص الخطوات المتبقية في عملية التسجيل
      if (!dbUser.name || dbUser.name.trim() === '') {
        ctx.session = { step: 'name', phone: dbUser.phoneNumber || undefined };
        await saveSession(db, ctx.platform, ctx.externalId, ctx.session);
        return handleNameStep(ctx);
      }

      if (!dbUser.email || dbUser.email.trim() === '') {
        ctx.session = { 
          step: 'email', 
          phone: dbUser.phoneNumber || undefined, 
          name: dbUser.name,
          storeName: `متجر ${dbUser.name || 'دكاني'}`
        };
        await saveSession(db, ctx.platform, ctx.externalId, ctx.session);
        return handleEmailStep(ctx);
      }

      ctx.session = { 
        step: 'store', 
        phone: dbUser.phoneNumber || undefined, 
        name: dbUser.name 
      };
      await saveSession(db, ctx.platform, ctx.externalId, ctx.session);
      return handleStoreStep(ctx);
    }

    // جـ) مستخدم جديد تماماً 🚀
    await deleteSession(db, ctx.platform, ctx.externalId);
    return {
      reply:
        '🚀 مرحباً بك في منصة دكاني! المنصة الأسرع لإنشاء متجرك الإلكتروني وإدارته بالكامل عبر تيليجرام.\n\nلبدء إنشاء متجرك في أقل من دقيقة، يرجى مشاركة رقم هاتفك عبر الزر بالأسفل أو إرساله مباشرة:',
      buttons: [[{ text: '📱 مشاركة رقم الهاتف', callback_data: 'share_contact' }]],
      session: { step: 'phone' },
    };
  }

  // 3️⃣ تأمين الـ Contact المباشر القادم من زر التليجرام
  if (ctx.contact) {
    if (dbUser && dbUser.phoneNumber) {
      console.log('⚡ [Onboarding Contact Bypass] Phone already exists in DB. Redirecting to name.');
      ctx.session = { ...ctx.session, step: 'name', phone: dbUser.phoneNumber };
      return handleNameStep(ctx);
    }
    ctx.session = { ...ctx.session, step: 'phone' };
    return handlePhoneStep(ctx);
  }

  // 4️⃣ كبسولة الـ Self-Healing
  if (!ctx.session || !ctx.session.step || Object.keys(ctx.session).length === 0) {
    console.log(`⚠️ [Onboarding] Session lost for ${ctx.externalId}, reconstructing from DB...`);
    
    if (!dbUser) {
      ctx.session = { step: 'phone' };
    } else {
      const existingStore = await db.query.stores.findFirst({ where: eq(stores.ownerId, dbUser.id) });
      
      if (existingStore) {
        ctx.session = { 
          step: 'completed', 
          phone: dbUser.phoneNumber || undefined, 
          name: dbUser.name,
          email: dbUser.email || undefined 
        };
      } else if (!dbUser.name || dbUser.name.trim() === '') {
        ctx.session = { step: 'name', phone: dbUser.phoneNumber || undefined };
      } else {
        const currentMsg = ctx.message?.trim() || '';
        const niches = ['ملابس', '👗 ملابس', 'إلكترونيات', '📱 إلكترونيات', 'تجميل', '💄 تجميل', 'مجوهرات', '💍 مجوهرات', 'أحذية', '👟 أحذية', 'اكسسوارات', '👜 اكسسوارات', 'أخرى', '📦 أخرى', '📦 تخصص آخر', 'تخصص آخر'];
        
        const isNicheClick = niches.includes(currentMsg) || currentMsg.startsWith('__custom__::');

        if (isNicheClick) {
          ctx.session = {
            step: 'niche',
            phone: dbUser.phoneNumber || undefined,
            name: dbUser.name,
            email: dbUser.email || undefined,
            storeName: `متجر ${dbUser.name || 'دكاني'}`
          };
        } else if (!dbUser.email || dbUser.email.trim() === '') {
          ctx.session = {
            step: 'email',
            phone: dbUser.phoneNumber || undefined,
            name: dbUser.name,
            storeName: `متجر ${dbUser.name || 'دكاني'}`
          };
        } else {
          ctx.session = { 
            step: 'store', 
            phone: dbUser.phoneNumber || undefined, 
            name: dbUser.name 
          };
        }
      }
    }
    
    await saveSession(db, ctx.platform, ctx.externalId, { ...ctx.session });

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

  // 5️⃣ حماية ضد الـ Race Condition
  let currentStep = ctx.session.step as OnboardingStep;

  if (dbUser && dbUser.phoneNumber && (!dbUser.name || dbUser.name.trim() === '')) {
    currentStep = 'name';
    ctx.session.step = 'name';
  }

  const step = currentStep;
  const msg = ctx.message ? ctx.message.trim() : '';

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

  // 6️⃣ التوجيه الافتراضي
  switch (step) {
    case 'phone': return handlePhoneStep(ctx);
    case 'name': return handleNameStep(ctx);
    case 'store': return handleStoreStep(ctx);
    case 'email': return handleEmailStep(ctx); 
    case 'niche': return handleNicheStep(ctx);
    default:
      return { reply: '❌ حدث خطأ في حالة التسجيل. أرسل /start للبدء من جديد.' };
  }
}

// 🎯 تحسين دالة الدخول وتمرير الـ User والـ Store المجلوبين مسبقاً لتوفير استعلامات قاعدة البيانات
export async function handleGetDashboard(
  ctx: SecureHandlerContext, 
  passedUser?: any, 
  passedStore?: any
): Promise<HandlerResult> {
  const db = getDb(ctx.env);
  
  const user = passedUser || (ctx.telegramUserId ? await findUserByTelegram(db, ctx.telegramUserId) : null);

  if (!user) {
    // 🎯 الحل الذهبي: لو مش موجود في الداتابيز، حوله لطلب الهاتف بدل إظهار رسالة خطأ صلبة
    ctx.session = { step: 'phone' };
    return {
      reply: '🚀 أهلاً بك في دكاني! يبدو أنك لم تُكمل إنشاء متجرك بعد.\n\nمن فضلك شاركنا رقم هاتفك للبدء:',
      buttons: [[{ text: '📱 مشاركة رقم الهاتف', callback_data: 'share_contact' }]],
    };
  }

  const store = passedStore || await db.query.stores.findFirst({
    where: eq(stores.ownerId, user.id),
  });

  if (!store) {
    // لو سجل بياناته بس لسه ما كملش المتجر
    ctx.session = { step: 'store', phone: user.phoneNumber || undefined, name: user.name };
    return handleStoreStep(ctx);
  }

  const loginLink = `https://www.dokany.workers.dev/dashboard?user=${user.id}&store=${store.id}`;

  return {
    reply: `🔗 أهلاً بك مجدداً! تم تجهيز رابط الدخول الخاص بك لمتجر "${store.name}":`,
    buttons: [[{ text: '🚀 افتح لوحة التحكم', url: loginLink }]],
  };
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