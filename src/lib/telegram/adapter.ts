// src/lib/telegram/adapter.ts

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export function telegramToContext(update: any) {
  const msg = update.message || update.callback_query?.message;
  if (!msg) return null;

  const chat = msg.chat;
  const contact = msg.contact;
  const text = update.callback_query?.data || msg.text || '';

  return {
    platform: 'telegram' as const,
    externalId: String(chat.id),
    message: text,
    contact: contact ? { phone_number: contact.phone_number } : undefined,
    telegramUserId: msg.from ? String(msg.from.id) : undefined,
  };
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  buttons?: any,
  persistentButtons?: any,
): Promise<boolean> {
  try {
    const replyMarkup = buildReplyMarkup(buttons, persistentButtons);

    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
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

function buildReplyMarkup(buttons?: any, persistentButtons?: any) {
  if (persistentButtons && Array.isArray(persistentButtons) && persistentButtons.length > 0) {
    return {
      keyboard: persistentButtons.map((row: any[]) =>
        row.map((btn: any) => ({ text: btn.text }))
      ),
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  if (!buttons || (Array.isArray(buttons) && buttons.length === 0)) {
    return { remove_keyboard: true };
  }

  if (Array.isArray(buttons)) {
    // مصفوفة 2D
    if (buttons.length > 0 && Array.isArray(buttons[0])) {
      // حالة زر مشاركة جهة الاتصال (تم إصلاحها)
      if (buttons.length === 1 && buttons[0].length === 1 && buttons[0][0]?.callback_data === 'share_contact') {
        return {
          keyboard: [[{ text: buttons[0][0].text, request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        };
      }

      return {
        inline_keyboard: buttons.map((row: any[]) =>
          row.map((btn: any) => {
            if (btn.url) return { text: btn.text, url: btn.url };
            if (btn.type === 'web_app' && btn.url) {
              return { text: btn.text, web_app: { url: btn.url } };
            }
            return { text: btn.text, callback_data: btn.value || btn.callback_data };
          })
        ),
      };
    }

    // مصفوفة مسطحة
    const hasContact = buttons.some((b: any) => b.type === 'contact');
    if (hasContact) {
      return {
        keyboard: [
          buttons.map((b: any) => ({
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
        buttons.map((b: any) => {
          if (b.url) return { text: b.text, url: b.url };
          if (b.type === 'web_app' && b.url) {
            return { text: b.text, web_app: { url: b.url } };
          }
          return { text: b.text, callback_data: b.value || b.callback_data };
        }),
      ],
    };
  }

  return undefined;
}