// src/lib/telegram/adapter.ts

import type { ButtonItem, OnboardingSession, HandlerContext } from './types';
import { getSession, saveSession } from './memory';
import { handleOnboarding, type SecureHandlerContext } from './handlers/onboarding-flow';
import { getDb } from '@/lib/db';

export type ButtonRows = ButtonItem[] | ButtonItem[][];

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number | string };
    from?: { id: number };
    text?: string;
    contact?: { phone_number: string };
  };
  callback_query?: {
    data?: string;
    message?: {
      chat: { id: number | string };
      from?: { id: number };
    };
    from?: { id: number };
  };
}

export interface TelegramContext {
  platform: 'telegram';
  externalId: string;
  message: string;
  contact?: { phone_number: string };
  telegramUserId?: number; // 🎯 تعديل النوع إلى number ليتوافق تماماً مع HandlerContext
}

// ============================================================
// 🚀 الدوال المجهزة (Functions)
// ============================================================

/**
 * تحويل أوبجيكت Telegram Update إلى Context موحد داخل التطبيق
 */
export function telegramToContext(update: TelegramUpdate): TelegramContext | null {
  const msg = update.message || update.callback_query?.message;
  if (!msg) return null;

  const chat = msg.chat;
  const contact = update.message?.contact;
  const text = update.callback_query?.data || update.message?.text || '';
  
  const fromUser = update.message?.from || update.callback_query?.from;

  return {
    platform: 'telegram' as const,
    externalId: String(chat.id),
    message: text,
    contact: contact ? { phone_number: contact.phone_number } : undefined,
    telegramUserId: fromUser?.id, // 🎯 الحفاظ عليه كـ number كما هو متوقع في Types
  };
}

/**
 * معالجة الـ Update القادم من تليجرام
 */
export async function handleTelegramUpdate(
  env: { DB: any },
  update: TelegramUpdate,
  botToken: string
): Promise<void> {
  const ctx = telegramToContext(update);
  if (!ctx) return;

  const db = getDb(env);

  // 1️⃣ جلب الجلسة الحالية من قاعدة البيانات أو استخدام افتراضية
  const existingSession = await getSession(db, ctx.platform, ctx.externalId);
  const currentSession: OnboardingSession = existingSession || { step: 'phone' };

  // 2️⃣ بناء الـ SecureHandlerContext بدون أي تعارض في الأنواع
  const secureCtx: SecureHandlerContext = {
    ...ctx,
    session: currentSession,
    env,
  };

  console.log(
    `🤖 [Telegram Router] Processing update for Chat ID: ${ctx.externalId}, Step: ${secureCtx.session.step}`
  );

  try {
    // 3️⃣ استدعاء المحرك الرئيسي
    const result = await handleOnboarding(secureCtx);

    // 4️⃣ دمج التحديث الجزئي مع الجلسة الحالية لضمان إرسال OnboardingSession مكتمل لـ saveSession
    if (result.session) {
      const updatedSession: OnboardingSession = {
        ...secureCtx.session,
        ...result.session,
      };
      await saveSession(db, ctx.platform, ctx.externalId, updatedSession);
    }

    // 5️⃣ إرسال الرسالة والأزرار للمستخدم
    if (result.reply) {
      await sendTelegramMessage(
        botToken,
        ctx.externalId,
        result.reply,
        result.buttons as ButtonRows
      );
    }
  } catch (error) {
    console.error('❌ [Telegram Router Error]:', error);
    await sendTelegramMessage(
      botToken,
      ctx.externalId,
      '❌ حدث خطأ أثناء معالجة طلبك. أرسل /start للبدء من جديد.'
    );
  }
}

/**
 * إرسال رسالة إلى تليجرام مع دعم إعداد الأزرار التفاعلية
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  buttons?: ButtonRows,
  persistentButtons?: ButtonRows
): Promise<boolean> {
  try {
    const telegramApi = `https://api.telegram.org/bot${botToken}`;
    const replyMarkup = buildReplyMarkup(buttons, persistentButtons);

    const response = await fetch(`${telegramApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('❌ Telegram API Error:', response.status, responseText);
      return false;
    }

    console.log('✅ Message sent successfully to:', chatId);
    return true;
  } catch (error) {
    console.error('❌ Network/Parse Error in sendTelegramMessage:', error);
    return false;
  }
}

/**
 * بناء هيكل الأزرار المخصص لـ Telegram API
 */
function buildReplyMarkup(buttons?: ButtonRows, persistentButtons?: ButtonRows) {
  if (persistentButtons && Array.isArray(persistentButtons) && persistentButtons.length > 0) {
    return {
      keyboard: (persistentButtons as ButtonItem[][]).map((row) =>
        row.map((btn) => ({ text: btn.text }))
      ),
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  if (!buttons || (Array.isArray(buttons) && buttons.length === 0)) {
    return { remove_keyboard: true };
  }

  if (Array.isArray(buttons)) {
    if (buttons.length > 0 && Array.isArray(buttons[0])) {
      const grid = buttons as ButtonItem[][];

      if (grid.length === 1 && grid[0].length === 1 && grid[0][0]?.callback_data === 'share_contact') {
        return {
          keyboard: [[{ text: grid[0][0].text, request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        };
      }

      return {
        inline_keyboard: grid.map((row) =>
          row.map((btn) => {
            if (btn.type === 'web_app' && btn.url) {
              return { text: btn.text, web_app: { url: btn.url } };
            }
            if (btn.url) return { text: btn.text, url: btn.url };
            return { text: btn.text, callback_data: btn.value || btn.callback_data };
          })
        ),
      };
    }

    const flatList = buttons as ButtonItem[];
    const hasContact = flatList.some((b) => b.type === 'contact');

    if (hasContact) {
      return {
        keyboard: [
          flatList.map((b) => ({
            text: b.text,
            request_contact: b.type === 'contact' ? true : undefined,
          })),
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }

    return {
      inline_keyboard: [
        flatList.map((b) => {
          if (b.type === 'web_app' && b.url) {
            return { text: b.text, web_app: { url: b.url } };
          }
          if (b.url) return { text: b.text, url: b.url };
          return { text: b.text, callback_data: b.value || b.callback_data };
        }),
      ],
    };
  }

  return undefined;
}