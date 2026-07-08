// src/lib/telegram/handlers/niche-step.ts

import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import type { D1Database } from '@cloudflare/workers-types';
import { createStore } from './create-store';
import { extractCountryCode, CODE_TO_GEO } from './onboarding-helpers';
import { saveSession } from '../memory';
import { getDb } from '@/lib/db';

// توسيع الـ Context لضمان تمرير الـ env من الراوتر الرئيسي
interface SecureHandlerContext extends HandlerContext {
  env: { DB: D1Database };
}

export async function handleNicheStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const input = ctx.message.trim();
  const inputLower = input.toLowerCase();

  const nicheMap: Record<string, string> = {
    'fashion': 'fashion', 'ملابس': 'fashion', '👗 ملابس': 'fashion',
    'electronics': 'electronics', 'إلكترونيات': 'electronics', '📱 إلكترونيات': 'electronics',
    'beauty': 'beauty', 'تجميل': 'beauty', '💄 تجميل': 'beauty',
    'jewelry': 'jewelry', 'مجوهرات': 'jewelry', '💍 مجوهرات': 'jewelry',
    'shoes': 'shoes', 'أحذية': 'shoes', '👟 أحذية': 'shoes',
    'accessories': 'accessories', 'اكسسوارات': 'accessories', '👜 اكسسوارات': 'accessories',
    'other': 'other', 'أخرى': 'other', '📦 أخرى': 'other', '📦 تخصص آخر': 'other'
  };

  let selectedNiche = nicheMap[inputLower];
  const currentStoreName = ctx.session?.storeName || '';
  
  // فحص هل هو معلق في خطوة انتظار كتابة النيش المخصص
  const isWaitingForCustom = currentStoreName.startsWith('__custom__::');

  // 🎯 حالة الضغط على "تخصص آخر" لأول مرة
  if (input === '📦 تخصص آخر' || input === 'تخصص آخر' || input === 'أخرى' || selectedNiche === 'other') {
    if (!isWaitingForCustom) {
      const nextSession = {
        ...ctx.session,
        step: 'niche' as const,
        storeName: `__custom__::${currentStoreName}`,
      };

      const db = getDb(ctx.env);
      await saveSession(db, ctx.platform, ctx.externalId, nextSession);

      return {
        reply: '📦 ممتاز! يرجى كتابة اسم تخصص متجرك الآن في رسالة نصية (مثال: عطور، أدوات منزلية، ألعاب):',
        buttons: [[{ text: '🔙 رجوع', value: 'رجوع' }]],
        session: nextSession,
      };
    }
  }

  // 🎯 حالة إن المستخدم كتب النيش المخصص بإيده
  if (isWaitingForCustom) {
    selectedNiche = input;
  }

  // الحماية من المدخلات العشوائية
  if (!selectedNiche) {
    return {
      reply: '❌ عذراً، يرجى اختيار تخصص مدعوم من الأزرار، أو اختر "تخصص آخر" واكتبه بنفسك:',
      session: ctx.session,
    };
  }

  // استخراج اسم المتجر النظيف
  let realStoreName = isWaitingForCustom
    ? currentStoreName.replace('__custom__::', '')
    : currentStoreName;

  // 🎯 خندق الدفاع الأخير: لو السيشين اتصفر والاسم طالع فاضي، امنعه من كسر قيد الداتابيز
  if (!realStoreName || realStoreName.trim() === '') {
    realStoreName = ctx.session?.name ? `متجر ${ctx.session.name}` : 'متجري الإلكتروني';
  }

  // خروج مبكر آمن في حالة غياب الـ DB من الـ env
  if (!ctx.env?.DB) {
    console.error('❌ [handleNicheStep] Critical Fatal: DB is missing from env');
    return {
      reply: '❌ عذراً، النظام غير جاهز حالياً لمعالجة الطلبات. يرجى إرسال /start مجدداً بعد دقيقة.',
      session: ctx.session,
    };
  }

  // إنشاء المتجر الفعلي
  try {
    const merchantName = ctx.session?.name || 'تاجرنا العزيز';

    // ✅ نمرر ctx.env.DB مباشرةً إلى createStore (كما كان يعمل سابقاً)
    const result = await createStore(ctx.env.DB, {
      phone: ctx.session?.phone || '',
      name: ctx.session?.name || '',
      storeName: realStoreName,
      telegramUserId: ctx.telegramUserId,
    });

    const countryCode = extractCountryCode(ctx.session?.phone || '');
    const geoInfo = CODE_TO_GEO[countryCode] || { country: 'غير محدد', currency: 'العملة المحلية' };

    return {
      reply: `🎉 مبروك يا ${merchantName}! تم إنشاء متجرك بنجاح وتخصيصه على نشاط [${selectedNiche}].\n\n🔗 رابط المتجر: ${result.url}\n🏪 اسم المتجر: ${realStoreName}\n🌍 الدولة: ${geoInfo.country}\n🪙 العملة: ${geoInfo.currency}\n\nاضغط على الزر بالأسفل لفتح لوحة التحكم فوراً والبدء في رفع منتجاتك.`,
      buttons: [
        [{ text: '🌍 زيارة المتجر', url: result.url }],
        [{ text: '🚀 افتح لوحة التحكم', url: result.dashboardLink }]
      ],
      persistentButtons: [
        [{ text: '🚀 لوحة التحكم', value: 'get_dashboard' }]
      ],
      session: {
        step: 'completed',
        phone: ctx.session?.phone,
        name: ctx.session?.name,
        storeName: realStoreName,
      },
      action: 'create_store',
    };
  } catch (error) {
    console.error('❌ createStore real error:', error);
    return {
      reply: '❌ عذراً، حدث خطأ غير متوقع أثناء إنشاء متجرك. يرجى إرسال /start للمحاولة مجدداً.',
      session: ctx.session,
    };
  }
}