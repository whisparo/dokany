//src/lib/alerts/channels/telegram-errors.ts

import type { Env } from '@/lib/env';
import type { AlertEvent, AlertEventType, IAlertChannel } from '../types';
import { TelegramFormatter } from '../formatters/telegram-formatter';

export class TelegramErrorsChannel implements IAlertChannel {
  readonly name = 'telegram-errors' as const;

  async send<T extends AlertEventType>(event: AlertEvent<T>, env: Env): Promise<boolean> {
    const botToken = (env.ERROR_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN) as string | undefined;
    const chatId = (env.ERROR_CHANNEL_ID || env.TELEGRAM_ERROR_CHAT_ID) as string | undefined;

    if (!botToken || !chatId) {
      console.warn('⚠️ [TelegramErrorsChannel] Missing Bot Token or Chat ID');
      return false;
    }

    return this.postMessage(botToken, chatId, event);
  }

  private async postMessage<T extends AlertEventType>(
    botToken: string,
    chatId: string,
    event: AlertEvent<T>
  ): Promise<boolean> {
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
          disable_notification: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('❌ [TelegramErrorsChannel] Dispatch Failed:', error);
      return false;
    }
  }
}