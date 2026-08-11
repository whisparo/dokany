// src/lib/telegram/adapter.ts

import type { ButtonItem, OnboardingSession } from './types';
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
  telegramUserId?: number;
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
    telegramUserId: fromUser?.id,
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

    // 🎯 5️⃣ معالجة أمر إخفاء الكيبورد فوراً لمنع تعارضه مع أزرار الـ Inline التالية
    if (result.removeKeyboard) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ctx.externalId,
          text: '🔄 جاري التحديث...',
          reply_markup: { remove_keyboard: true },
        }),
      }).then(res => res.json()).then(async (data) => {
        if (data.ok && data.result?.message_id) {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ctx.externalId,
              message_id: data.result.message_id,
            }),
          });
        }
      }).catch(() => {});
    }

    // 6️⃣ إرسال الرسالة والأزرار للمستخدم
    if (result.reply) {
      await sendTelegramMessage(
        botToken,
        ctx.externalId,
        result.reply,
        result.buttons as ButtonRows,
        result.persistentButtons as ButtonRows
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
 * إرسال رسالة إلى تليجرام مع دعم إعداد الأزرار التفاعلية والكيبورد الثابت
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
  // 🎯 1. الأزرار الدائمة الثابتة أسفل الشات (مثل زر لوحة التحكم الثابت)
  if (persistentButtons && Array.isArray(persistentButtons) && persistentButtons.length > 0) {
    return {
      keyboard: (persistentButtons as ButtonItem[][]).map((row) =>
        row.map((btn) => {
          if (btn.type === 'web_app' && btn.url) {
            return { text: btn.text, web_app: { url: btn.url } };
          }
          return { text: btn.text };
        })
      ),
      resize_keyboard: true,
      one_time_keyboard: false, // 💡 يضمن عدم اختفاء الزر حتى عند الضغط عليه أو إرسال /start
    };
  }

  // 🎯 2. حالة عدم وجود أزرار
  if (!buttons || (Array.isArray(buttons) && buttons.length === 0)) {
    return undefined;
  }

  // 🎯 3. بناء الأزرار التفاعلية العادية
  if (Array.isArray(buttons)) {
    if (buttons.length > 0 && Array.isArray(buttons[0])) {
      const grid = buttons as ButtonItem[][];

      // زر مشاركة رقم الهاتف (Reply Keyboard)
      const hasContactInGrid = grid.some((row) =>
        row.some((b) => b.type === 'contact' || b.callback_data === 'share_contact')
      );

      if (hasContactInGrid) {
        return {
          keyboard: grid.map((row) =>
            row.map((btn) => ({
              text: btn.text,
              request_contact: true,
            }))
          ),
          resize_keyboard: true,
          one_time_keyboard: true, // 💡 يختفي بمجرد مشاركة الهاتف
        };
      }

      // أزرار الـ Inline العادية (مثل زر الرجوع ورابط الدخول)
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
    const hasContact = flatList.some((b) => b.type === 'contact' || b.callback_data === 'share_contact');

    if (hasContact) {
      return {
        keyboard: [
          flatList.map((b) => ({
            text: b.text,
            request_contact: true,
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