// src/lib/alerts/channels/telegram-business.ts

import type { Env } from '@/lib/env';
import type { AlertEvent, AlertEventType, IAlertChannel } from '../types';
import { TelegramFormatter } from '../formatters/telegram-formatter';

export class TelegramBusinessChannel implements IAlertChannel {
  readonly name = 'telegram-business' as const;

  async send<T extends AlertEventType>(event: AlertEvent<T>, env: Env): Promise<boolean> {
    const botToken = env.TELEGRAM_BOT_TOKEN || env.ERROR_BOT_TOKEN;
    // 🎯 يقبل TELEGRAM_CHAT_ID أو يرجع لـ TELEGRAM_ERROR_CHAT_ID لو الناقص مش موجود
    const chatId = env.TELEGRAM_CHAT_ID || env.TELEGRAM_ERROR_CHAT_ID || env.ERROR_CHANNEL_ID;

    if (!botToken || !chatId) {
      console.warn('⚠️ [TelegramBusinessChannel] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
      return false;
    }

    try {
      const formattedMessage = TelegramFormatter.format(event);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('❌ [TelegramBusinessChannel] Dispatch Failed:', error);
      return false;
    }
  }
}