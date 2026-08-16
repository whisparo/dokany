// src/lib/telegram/handlers/niche-step.ts

import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import type { D1Database } from '@cloudflare/workers-types';
import { createStore } from './create-store';
import { extractCountryCode, CODE_TO_GEO } from './onboarding-helpers';
import { saveSession } from '../memory';
import { getDb } from '@/lib/db';

interface SecureHandlerContext extends HandlerContext {
  env: { 
    DB: D1Database;
    NEXT_PUBLIC_APP_URL?: string;
    TELEGRAM_BOT_TOKEN?: string; // 👈 إضافة التوكن للـ Interface
  };
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
  
  const isWaitingForCustom = currentStoreName.startsWith('__custom__::');

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

  if (isWaitingForCustom) {
    selectedNiche = input;
  }

  if (!selectedNiche) {
    return {
      reply: '❌ عذراً، يرجى اختيار تخصص مدعوم من الأزرار، أو اختر "تخصص آخر" واكتبه بنفسك:',
      session: ctx.session,
    };
  }

  let realStoreName = isWaitingForCustom
    ? currentStoreName.replace('__custom__::', '')
    : currentStoreName;

  if (!realStoreName || realStoreName.trim() === '') {
    realStoreName = ctx.session?.name ? `متجر ${ctx.session.name}` : 'متجري الإلكتروني';
  }

  if (!ctx.env?.DB) {
    console.error('❌ [handleNicheStep] Critical Fatal: DB is missing from env');
    return {
      reply: '❌ عذراً، النظام غير جاهز حالياً لمعالجة الطلبات. يرجى إرسال /start مجدداً بعد دقيقة.',
      session: ctx.session,
    };
  }

  try {
    const merchantName = ctx.session?.name || 'تاجرنا العزيز';

    // 🟢 التعديل الرئيسي: تمرير ctx.env كبارامتر ثالث هنا!
    const result = await createStore(
      ctx.env.DB, 
      {
        phone: ctx.session?.phone || '',
        name: ctx.session?.name || '',
        storeName: realStoreName,
        telegramUserId: ctx.telegramUserId,
      },
      ctx.env // 👈 تم التمرير هنا
    );

    const countryCode = extractCountryCode(ctx.session?.phone || '');
    const geoInfo = CODE_TO_GEO[countryCode] || { country: 'غير محدد', currency: 'العملة المحلية' };

    const baseUrl = ctx.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.dokany.workers.dev';
    const storeUrl = result.url || `${baseUrl}/${result.slug}`;
    const magicDashboardUrl = result.dashboardLink || `${baseUrl}/ar/dashboard?store=${result.storeId}`;

    return {
      reply: `🎉 مبروك يا ${merchantName}! تم إنشاء متجرك بنجاح وتخصيصه على نشاط [${selectedNiche}].\n\n🏪 **اسم المتجر:** ${realStoreName}\n🌍 **الدولة:** ${geoInfo.country}\n🪙 **العملة:** ${geoInfo.currency}\n\n🚀 **رابط دخول لوحة التحكم المباشر:**\n${magicDashboardUrl}\n\n🌍 **رابط المتجر:**\n${storeUrl}`,
      
      persistentButtons: [
        [{ text: '🎛️ لوحة التحكم', value: '🎛️ لوحة التحكم' }]
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