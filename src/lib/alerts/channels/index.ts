// src/lib/alerts/channels/index.ts

import type { Env } from '@/lib/env';
import type {
  AlertEvent,
  AlertEventType,
  ChannelResult,
  IAlertChannel,
} from '../types';
import { LoggerChannel } from './logger';
import { TelegramErrorsChannel } from './telegram-errors';
import { TelegramBusinessChannel } from './telegram-business';

/**
 * 🔀 ChannelRegistry
 * مجمع القنوات ومسؤول التوزيع الموازي
 */
export class ChannelRegistry {
  private channels: Map<string, IAlertChannel> = new Map();

  constructor() {
    // تسجيل القنوات الأساسية المنفصلة
    this.registerChannel(new LoggerChannel());
    this.registerChannel(new TelegramErrorsChannel());
    this.registerChannel(new TelegramBusinessChannel());
  }

  /**
   * تسجيل قناة إشعار جديدة (يسمح بالتوسع مستقبلاً)
   */
  registerChannel(channel: IAlertChannel): void {
    this.channels.set(channel.name, channel);
  }

  /**
   * توزيع الحدث على القنوات المحددة بالتوازي
   */
  async dispatch<T extends AlertEventType>(
    event: AlertEvent<T>,
    env: Env,
    targetChannels?: string[]
  ): Promise<ChannelResult[]> {
    // تحديد القنوات المستهدفة (أو كل القنوات المسجلة افتراضياً)
    const activeChannels = Array.from(this.channels.values()).filter(
      (channel) => !targetChannels || targetChannels.includes(channel.name)
    );

    // تنفيذ الإرسال بالتوازي عالي الأداء مع معالجة حذرة للأخطاء
    const promises = activeChannels.map(async (channel): Promise<ChannelResult> => {
      try {
        const success = await channel.send(event, env);
        return { channel: channel.name, success };
      } catch (err) {
        return {
          channel: channel.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        channel: activeChannels[index].name,
        success: false,
        error: result.reason?.message || 'Promise rejected unexpectedly',
      };
    });
  }
}