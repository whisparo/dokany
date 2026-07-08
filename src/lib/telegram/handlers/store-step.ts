// src/lib/telegram/handlers/store-step.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import type { HandlerContext, HandlerResult } from '@/lib/telegram/types';
import { saveSession } from '../memory';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// استيراد أدوات الدستور الثامن لإدارة الأخطاء والـ Safe Execution
import { safeExecute } from '@/lib/errors/safe-executor';

interface SecureHandlerContext extends HandlerContext {
  d1Database?: D1Database; // حقن الـ D1Instance لامتثال الـ Edge Runtime
}

export async function handleStoreStep(ctx: SecureHandlerContext): Promise<HandlerResult> {
  const storeName = ctx.message.trim();
  
  if (storeName.length < 2 || storeName.length > 50) {
    return {
      reply: '❌ اسم المتجر يجب أن يكون بين 2 و 50 حرفاً. يرجى المحاولة مرة أخرى:',
      session: ctx.session, // نرجع الـ session الحالي لحماية تدفق الخطوة عند الخطأ الإدخالي
    };
  }

  // 1️⃣ تأمين البيانات الأساسية (الحماية من الـ Session Loss)
  let phone = ctx.session?.phone;
  let name = ctx.session?.name;

  // لو لقينهم طاروا من السيشين، بنسحبهم فوراً من قاعدة البيانات عشان نلحم الفلو
  if ((!phone || !name) && ctx.telegramUserId && ctx.d1Database) {
    console.log(`🔍 [StoreStep] Fetching missing user data from DB for Telegram ID: ${ctx.telegramUserId}...`);
    
    const db = drizzle(ctx.d1Database);

    // كبسولة الدستور الثامن لتأمين الـ Healing وجلب بيانات التاجر بسرعة وأمان
    const recoveredUserData = await safeExecute<{ phoneNumber?: string; name?: string } | null>(async () => {
      // 🧠 لقطة سنيور: البحث بـ users.telegramId وليس الـ UUID الداخلي
      const dbUser = await db.select().from(users).where(eq(users.telegramId, String(ctx.telegramUserId))).get();
      
      if (dbUser) {
        return {
          phoneNumber: dbUser.phoneNumber || undefined,
          name: dbUser.name || undefined,
        };
      }
      return null;
    }, {
      fallback: null, // Fallback آمن يضمن عدم انهيار الفلو في حالة الـ Database Timeout
      context: {
        userId: String(ctx.telegramUserId),
        path: 'store_step_session_healing',
        extras: { storeName }
      }
    });

    if (recoveredUserData) {
      phone = phone || recoveredUserData.phoneNumber;
      name = name || recoveredUserData.name;
    }
  }

  // 2️⃣ تجهيز الـ Session الجديد كامل الأركان بدون أي نقص ومطابق للتيبات
  const nextSession = {
    ...ctx.session,
    step: 'niche' as const,
    storeName,
    phone, // مأمن ومستحيل يطير
    name,  // مأمن ومستحيل يطير
  };

  // 3️⃣ الحفر الفوري في الـ Memory لمنع الـ Session Loss
  await saveSession(ctx.platform, ctx.externalId, nextSession);

  // 4️⃣ الرد الآمن على التاجر بالرد الجميل والأزرار المهيكلة لـ ButtonRow[]
  return {
    reply: `🏪 متجر "${storeName}".. اسم رائع!\nأخيراً، اختر تخصص متجرك من الأزرار بالأسفل، أو اختر "تخصص آخر" واكتبه بنفسك:`,
    buttons: [
      [{ text: '👗 ملابس', value: '👗 ملابس' }, { text: '📱 إلكترونيات', value: '📱 إلكترونيات' }],
      [{ text: '💄 تجميل', value: '💄 تجميل' }, { text: '💍 مجوهرات', value: '💍 مجوهرات' }],
      [{ text: '👟 أحذية', value: '👟 أحذية' }, { text: '👜 اكسسوارات', value: '👜 اكسسوارات' }],
      [{ text: '📦 تخصص آخر', value: '📦 تخصص آخر' }],
      [{ text: '🔙 رجوع', value: 'رجوع' }]
    ],
    session: nextSession,
  };
}