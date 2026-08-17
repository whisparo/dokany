// lib/errors/adapters/telegram.adapter.ts
// الإصدار: 1.0.0
// الدور: محول بيانات التليجرام (Telegram Adapter) - ربط الأخطاء بأجهزة التنبيه عبر TelegramClient

import type { SystemError } from '../core';
import {
  TelegramClient,
  type TelegramEnvBindings,
  type TelegramSendResult,
  getTelegramClient,
  formatErrorForTelegram,
  formatIncidentSummary,
  type TelegramInlineButton,
} from '../clients';

export interface TelegramAdapterOptions {
  /** رابط لوحة التحكم لإضافته للزر المباشر داخل الرسالة */
  dashboardUrl?: string;
  /** تضمين الـ Stack Trace داخل الرسالة (افتراضي: false في الإنتاج) */
  includeStack?: boolean;
}

export class TelegramAdapter {
  private client: TelegramClient;
  private options: TelegramAdapterOptions;

  constructor(env: TelegramEnvBindings, options: TelegramAdapterOptions = {}) {
    this.client = getTelegramClient(env);
    this.options = options;
  }

  /**
   * إرسال خطأ مفرط (SystemError) إلى القناة المناسبة عبر التليجرام
   */
  async notifyError(
    error: SystemError,
    customOptions?: TelegramAdapterOptions
  ): Promise<TelegramSendResult> {
    // 1. التحقق من أن الخطأ ليس صامتاً ويحتاج لتنبيه
    if (error.isSilent() || !error.shouldAlert) {
      return {
        success: true,
        chatId: 'skipped',
        errorMessage: 'Error marked as silent or alert disabled',
      };
    }

    const includeStack = customOptions?.includeStack ?? this.options.includeStack ?? false;
    const dashboardUrl = customOptions?.dashboardUrl ?? this.options.dashboardUrl;

    // 2. تجهيز نص الرسالة وتنسيقها
    const formattedMessage = formatErrorForTelegram(error, includeStack);

    // 3. بناء الأزرار المخصصة (Inline Buttons)
    const buttons: TelegramInlineButton[] = [];

    if (dashboardUrl) {
      buttons.push({
        text: '🔍 فتح في اللوحة',
        url: `${dashboardUrl}?correlationId=${encodeURIComponent(error.correlationId)}`,
      });
    }

    // 4. توجيه الرسالة حسب الـ Severity
    switch (error.severity) {
      case 'critical':
        return await this.client.sendCritical(formattedMessage, { buttons });

      case 'warning':
        return await this.client.sendWarning(formattedMessage, { buttons });

      case 'info':
      default:
        return await this.client.sendDigest(formattedMessage, { buttons });
    }
  }

  /**
   * إرسال ملخص حوادث (Incident Summary / Batch Alert)
   */
  async notifyIncident(incidentData: {
    code: string;
    category: string;
    severity: string;
    count: number;
    firstTimestamp: string;
    lastTimestamp: string;
    storeId?: string;
    correlationId?: string;
  }): Promise<TelegramSendResult> {
    const formattedSummary = formatIncidentSummary(incidentData);

    const buttons: TelegramInlineButton[] = [];
    if (this.options.dashboardUrl) {
      buttons.push({
        text: '📊 مراجعة Incident',
        url: `${this.options.dashboardUrl}/incidents?code=${encodeURIComponent(incidentData.code)}`,
      });
    }

    if (incidentData.severity === 'critical') {
      return await this.client.sendCritical(formattedSummary, { buttons });
    }

    return await this.client.sendWarning(formattedSummary, { buttons });
  }

  /**
   * معرفة حالة الـ Circuit Breaker للعميل
   */
  getStatus() {
    return this.client.getStatus();
  }
}

/**
 * Helper function لإنشاء الـ Adapter بسهولة
 */
export function createTelegramAdapter(
  env: TelegramEnvBindings,
  options?: TelegramAdapterOptions
): TelegramAdapter {
  return new TelegramAdapter(env, options);
}