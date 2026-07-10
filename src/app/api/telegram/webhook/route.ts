// src/app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loadSession, saveSession } from '@/lib/telegram/memory';
import { handleOnboarding, handleGetDashboard, type SecureHandlerContext } from '@/lib/telegram/handlers/onboarding-flow';
import { telegramToContext, sendTelegramMessage } from '@/lib/telegram/adapter';
import type { OnboardingSession, HandlerResult } from '@/lib/telegram/types';
import type { D1Database } from '@cloudflare/workers-types';

export const runtime = 'edge';

interface TelegramUpdate {
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: {
      chat: { id: number };
      text?: string;
    };
    data?: string;
  };
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    contact?: {
      phone_number: string;
      first_name: string;
      last_name?: string;
      user_id?: number;
    };
  };
}

interface NextCloudflareRequest extends NextRequest {
  cloudflare?: {
    env: {
      DB: D1Database;
    };
  };
}

export async function POST(req: NextCloudflareRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    console.log('📥 Telegram update:', JSON.stringify(update).slice(0, 300));

    // 🌟 الحل السحري: الدمج الهجين بين سياق كلاود فلير والبيئة العالمية كـ Fallback
    const cloudflareEnv = req.cloudflare?.env || (process.env as any);
    
    // إعادة بناء كائن الـ env عشان نضمن إن الـ DB وأي متغيرات تانية (زي الـ Tokens) موجودة ومقروءة
    const env = {
      ...cloudflareEnv,
      DB: cloudflareEnv?.DB || (process.env as any)?.DB
    };

    if (!env || !env.DB) {
      console.error('❌ [Webhook Route] Critical: Cloudflare D1 binding (DB) is completely missing from environment!');
      return NextResponse.json({ ok: false, error: 'Database binding missing' }, { status: 500 });
    }

    const db = getDb(env);

    // 🌟 جلب التوكن بمرونة (سواء من السيرفر مباشرة أو من الـ context)
    const botToken = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

    // 1. معالجة callback_query (الأزرار)
    if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = String(callback.message?.chat?.id || callback.from?.id);
      const data = callback.data || '';

      await fetch(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callback.id }),
        }
      );

      const { session, timestamps } = await loadSession(db, 'telegram', chatId);

      const ctx: SecureHandlerContext = {
        platform: 'telegram',
        externalId: chatId,
        message: data,
        contact: undefined,
        telegramUserId: callback.from.id,
        session,
        env, // ممرر ومحصن بالكامل
      };

      let result: HandlerResult;
      if (data === 'get_dashboard') {
        result = await handleGetDashboard(ctx);
      } else {
        result = await handleOnboarding(ctx);
      }

      if (result.session) {
        const updatedSession: OnboardingSession = { ...session, ...result.session };
        await saveSession(db, 'telegram', chatId, updatedSession, timestamps);
      }

      const sent = await sendTelegramMessage(chatId, result.reply, result.buttons, result.persistentButtons);
      if (!sent) {
        console.error('❌ Failed to send message to chat:', chatId);
        return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // 2. معالجة الرسائل العادية (نص، contact)
    const baseCtx = telegramToContext(update);
    if (!baseCtx) {
      return NextResponse.json({ ok: true });
    }

    const { session, timestamps } = await loadSession(db, 'telegram', baseCtx.externalId);

    const enrichedCtx: SecureHandlerContext = {
      ...baseCtx,
      telegramUserId: update.message?.from?.id,
      session,
      env, // ممرر ومحصن بالكامل
    };

    // 3. التحقق من طلب خاص (get_dashboard)
    if (baseCtx.message === 'get_dashboard' || baseCtx.message === '🚀 لوحة التحكم') {
      const result = await handleGetDashboard(enrichedCtx);

      if (result.session) {
        const updatedSession: OnboardingSession = { ...session, ...result.session };
        await saveSession(db, 'telegram', baseCtx.externalId, updatedSession, timestamps);
      }

      const sent = await sendTelegramMessage(baseCtx.externalId, result.reply, result.buttons, result.persistentButtons);
      if (!sent) {
        console.error('❌ Failed to send message to chat:', baseCtx.externalId);
        return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // 4. المعالجة الافتراضية (Onboarding)
    const result = await handleOnboarding(enrichedCtx);

    if (result.session) {
      const updatedSession: OnboardingSession = { ...session, ...result.session };
      await saveSession(db, 'telegram', baseCtx.externalId, updatedSession, timestamps);
    }

    const sent = await sendTelegramMessage(baseCtx.externalId, result.reply, result.buttons, result.persistentButtons);
    if (!sent) {
      console.error('❌ Failed to send message to chat:', baseCtx.externalId);
      return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 });
    }

    console.log('✅ Message sent successfully to:', baseCtx.externalId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}