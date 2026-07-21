// src/lib/telegram/adapter.ts

// 1. استيراد ButtonItem فقط من types المعتمد لمنع التكرار والتعارض
import type { ButtonItem } from './types';

// 2. تعريف الأنواع المعتمدة على ButtonItem داخل هذا الملف
export type ButtonRows = ButtonItem[] | ButtonItem[][];

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number | string };
    from?: { id: number | string };
    text?: string;
    contact?: { phone_number: string };
  };
  callback_query?: {
    data?: string;
    message?: {
      chat: { id: number | string };
      from?: { id: number | string };
    };
    from?: { id: number | string };
  };
}

export interface TelegramContext {
  platform: 'telegram';
  externalId: string;
  message: string;
  contact?: { phone_number: string };
  telegramUserId?: string;
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

  return {
    platform: 'telegram' as const,
    externalId: String(chat.id),
    message: text,
    contact: contact ? { phone_number: contact.phone_number } : undefined,
    telegramUserId: msg.from ? String(msg.from.id) : undefined,
  };
}

/**
 * معالجة الـ Update القادم من تليجرام
 */
export async function handleTelegramUpdate(
  db: unknown,
  update: TelegramUpdate,
  botToken: string
): Promise<void> {
  const ctx = telegramToContext(update);
  if (!ctx) return;

  console.log('🤖 Processing Telegram Context for Chat ID:', ctx.externalId);

  // استجابة أولية لتجربة العمل
  if (ctx.message === '/start') {
    await sendTelegramMessage(
      botToken,
      ctx.externalId,
      'أهلاً بك! مرحباً بك في الخدمة 🚀'
    );
  }
}

/**
 * إرسال رسالة إلى تليجرام مع دعم إعداد الأزرار
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
    // مصفوفة ثنائية الأبعاد (صفوف وأعمدة)
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

    // مصفوفة مسطحة (Flat Array)
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