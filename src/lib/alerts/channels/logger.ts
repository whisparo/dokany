// src/lib/alerts/channels/logger.ts

import type { Env } from '@/lib/env';
import type { AlertEvent, AlertEventType, IAlertChannel } from '../types';

/**
 * 🪵 LoggerChannel
 * قناة تسجيل التنبيهات في الـ Console
 */
export class LoggerChannel implements IAlertChannel {
  readonly name = 'logger' as const;

  async send<T extends AlertEventType>(
    event: AlertEvent<T>,
    _env: Env
  ): Promise<boolean> {
    try {
      const logPayload = {
        scope: 'ALERT_SYSTEM',
        id: event.id,
        type: event.type,
        severity: event.severity,
        timestamp: new Date(event.timestamp).toISOString(),
        correlationId: event.correlationId || event.id,
        payload: event.payload,
      };

      switch (event.severity) {
        case 'CRITICAL':
          console.error(`🚨 [CRITICAL_ALERT] [${event.type}]`, JSON.stringify(logPayload));
          break;
        case 'WARNING':
          console.warn(`⚠️ [WARNING_ALERT] [${event.type}]`, JSON.stringify(logPayload));
          break;
        case 'INFO':
        default:
          console.info(`ℹ️ [INFO_ALERT] [${event.type}]`, JSON.stringify(logPayload));
          break;
      }

      return true;
    } catch (err) {
      // 🛑 ممنوع نهائياً رمي SystemError هنا لتفادي الـ Infinite Loop
      console.error('[LOGGER_CHANNEL_FAILURE] Failed to emit alert log:', err);
      return false;
    }
  }
}