// lib/errors/clients/telegram.ts
// الإصدار: 9.1.2 (تنظيف وتوحيد متغيرات البيئة)
// الدور: عميل التليجرام المتكامل مع Rate Limiting و Circuit Breaker
// المبدأ: إرسال آمن متوافق 100% مع بيئة Cloudflare Workers و Edge Runtime

import { SystemError } from '../core/types';
import { addBreadcrumb } from '../core/context';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

export type TelegramChannel = 'critical' | 'warning' | 'digest' | 'silent';
export type TelegramMessagePriority = 'high' | 'normal' | 'low';

export interface TelegramMessage {
  /** النص الأساسي للرسالة (يدعم HTML جاهز أو نص عادي) */
  text: string;
  /** القناة المستهدفة */
  channel: TelegramChannel;
  /** مستوى الأهمية */
  priority?: TelegramMessagePriority;
  /** معرف المحادثة (يتجاوز القناة الافتراضية) */
  chatId?: string;
  /** تعطيل إشعار الصوت */
  disableNotification?: boolean;
  /** أزرار مخصصة (Inline Keyboard) */
  buttons?: TelegramInlineButton[];
  /** هل النص تم تنسيقه بـ HTML مسبقاً؟ (افتراضي: true) */
  isPreformattedHtml?: boolean;
}

export interface TelegramInlineButton {
  text: string;
  url?: string;
  callbackData?: string;
}

export interface TelegramConfig {
  botToken: string;
  criticalChatId: string;
  warningChatId: string;
  digestChatId?: string;
  maxMessagesPerSecond?: number;
  circuitFailureThreshold?: number;
  circuitOpenDurationSeconds?: number;
  requestTimeoutMs?: number;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  chatId: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TelegramEnvBindings {
  TELEGRAM_BOT_TOKEN?: string;
  ERROR_BOT_TOKEN?: string;
  ERROR_CHANNEL_ID?: string;
  TELEGRAM_ERROR_CHAT_ID?: string;
  TELEGRAM_CRITICAL_CHAT_ID?: string;
  TELEGRAM_WARNING_CHAT_ID?: string;
  TELEGRAM_DIGEST_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_MAX_MESSAGES_PER_SECOND?: string | number;
  TELEGRAM_CIRCUIT_FAILURE_THRESHOLD?: string | number;
  TELEGRAM_CIRCUIT_OPEN_DURATION?: string | number;
  TELEGRAM_REQUEST_TIMEOUT_MS?: string | number;
}

// ═══════════════════════════════════════════════════════════════
// 🔒  Rate Limiter (Edge Safe)
// ═══════════════════════════════════════════════════════════════

class TelegramRateLimiter {
  private readonly maxPerSecond: number;
  private timestamps: number[] = [];

  constructor(maxPerSecond: number = 30) {
    this.maxPerSecond = maxPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 1000);

    if (this.timestamps.length >= this.maxPerSecond) {
      const oldest = this.timestamps[0];
      const waitMs = 1000 - (now - oldest) + 50;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 1000)));
      return this.wait();
    }

    this.timestamps.push(now);
  }

  getRemaining(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 1000);
    return Math.max(0, this.maxPerSecond - this.timestamps.length);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔌  Circuit Breaker
// ═══════════════════════════════════════════════════════════════

class TelegramCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private failureCount: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openUntil: number = 0;

  constructor(failureThreshold: number = 5, openDurationSeconds: number = 300) {
    this.failureThreshold = failureThreshold;
    this.openDurationMs = openDurationSeconds * 1000;
  }

  isAllowed(): boolean {
    const now = Date.now();

    if (this.state === 'open') {
      if (now >= this.openUntil) {
        this.state = 'half-open';
        this.failureCount = 0;
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  recordFailure(): void {
    this.failureCount++;
    if (this.state === 'half-open' || this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.openUntil = Date.now() + this.openDurationMs;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getRemainingOpenTime(): number {
    if (this.state !== 'open') return 0;
    return Math.max(0, Math.ceil((this.openUntil - Date.now()) / 1000));
  }
}

// ═══════════════════════════════════════════════════════════════
// 🤖  عميل التليجرام الرئيسي
// ═══════════════════════════════════════════════════════════════

export class TelegramClient {
  private readonly config: TelegramConfig;
  private readonly rateLimiter: TelegramRateLimiter;
  private readonly circuitBreaker: TelegramCircuitBreaker;
  private readonly apiBase: string = 'https://api.telegram.org/bot';

  constructor(config: TelegramConfig) {
    this.config = {
      maxMessagesPerSecond: 30,
      circuitFailureThreshold: 5,
      circuitOpenDurationSeconds: 300,
      requestTimeoutMs: 5000,
      ...config,
    };

    this.rateLimiter = new TelegramRateLimiter(this.config.maxMessagesPerSecond);
    this.circuitBreaker = new TelegramCircuitBreaker(
      this.config.circuitFailureThreshold,
      this.config.circuitOpenDurationSeconds
    );
  }

  async send(message: TelegramMessage): Promise<TelegramSendResult> {
    const {
      text,
      channel,
      priority = 'normal',
      chatId,
      disableNotification = priority === 'low',
      buttons = [],
      isPreformattedHtml = true,
    } = message;

    const targetChatId = chatId ?? this.getChatIdForChannel(channel);
    if (!targetChatId) {
      return {
        success: false,
        chatId: 'unknown',
        errorCode: 'NO_CHAT_ID',
        errorMessage: `No chat ID configured for channel: ${channel}`,
      };
    }

    if (!this.circuitBreaker.isAllowed()) {
      return {
        success: false,
        chatId: targetChatId,
        errorCode: 'CIRCUIT_OPEN',
        errorMessage: `Circuit open, retry after ${this.circuitBreaker.getRemainingOpenTime()} seconds`,
      };
    }

    try {
      await this.rateLimiter.wait();
    } catch (error) {
      return {
        success: false,
        chatId: targetChatId,
        errorCode: 'RATE_LIMIT_ERROR',
        errorMessage: String(error),
      };
    }

    const formattedText = isPreformattedHtml ? text : escapeHtml(text);
    const url = `${this.apiBase}${this.config.botToken}/sendMessage`;

    const payload: Record<string, unknown> = {
      chat_id: targetChatId,
      text: formattedText,
      parse_mode: 'HTML',
      disable_notification: disableNotification,
    };

    if (buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: buttons.map((btn) => [
          {
            text: btn.text,
            ...(btn.url ? { url: btn.url } : {}),
            ...(btn.callbackData ? { callback_data: btn.callbackData } : {}),
          },
        ]),
      };
    }

    // 🔍 طباعة بيانات الطلب للكشف والتنقيح
    console.log('🔍 [Telegram Fetch Debug] URL:', url);
    console.log('🔍 [Telegram Fetch Debug] Target Chat ID:', targetChatId);
    console.log('🔍 [Telegram Fetch Debug] Payload:', JSON.stringify(payload, null, 2));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
        error_code?: number;
      };

      if (!response.ok || !data.ok) {
        this.circuitBreaker.recordFailure();
        return {
          success: false,
          chatId: targetChatId,
          errorCode: String(data.error_code ?? 'UNKNOWN_ERROR'),
          errorMessage: data.description || 'Unknown error',
        };
      }

      this.circuitBreaker.recordSuccess();

      addBreadcrumb(`Telegram sent: ${channel}`, {
        chatId: targetChatId,
        messageId: data.result?.message_id,
      });

      return {
        success: true,
        messageId: data.result?.message_id,
        chatId: targetChatId,
      };
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const isAbort = error instanceof Error && error.name === 'AbortError';
      return {
        success: false,
        chatId: targetChatId,
        errorCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        errorMessage: isAbort ? 'Request timeout' : String(error),
      };
    }
  }
  async sendCritical(
    text: string,
    options: { chatId?: string; buttons?: TelegramInlineButton[] } = {}
  ): Promise<TelegramSendResult> {
    return this.send({
      text,
      channel: 'critical',
      priority: 'high',
      chatId: options.chatId,
      buttons: options.buttons,
      disableNotification: false,
      isPreformattedHtml: true,
    });
  }

  async sendWarning(
    text: string,
    options: { chatId?: string; buttons?: TelegramInlineButton[] } = {}
  ): Promise<TelegramSendResult> {
    return this.send({
      text,
      channel: 'warning',
      priority: 'normal',
      chatId: options.chatId,
      buttons: options.buttons,
      disableNotification: false,
      isPreformattedHtml: true,
    });
  }

  async sendDigest(
    text: string,
    options: { chatId?: string; buttons?: TelegramInlineButton[] } = {}
  ): Promise<TelegramSendResult> {
    return this.send({
      text,
      channel: 'digest',
      priority: 'low',
      chatId: options.chatId,
      buttons: options.buttons,
      disableNotification: true,
      isPreformattedHtml: true,
    });
  }

  private getChatIdForChannel(channel: TelegramChannel): string | undefined {
    switch (channel) {
      case 'critical':
        return this.config.criticalChatId;
      case 'warning':
        return this.config.warningChatId;
      case 'digest':
      case 'silent':
        return this.config.digestChatId || this.config.criticalChatId;
      default:
        return undefined;
    }
  }

  getStatus(): {
    circuitState: 'closed' | 'open' | 'half-open';
    remainingMessages: number;
    remainingOpenTime: number;
  } {
    return {
      circuitState: this.circuitBreaker.getState(),
      remainingMessages: this.rateLimiter.getRemaining(),
      remainingOpenTime: this.circuitBreaker.getRemainingOpenTime(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭  المصنع (Factory - Worker Safe)
// ═══════════════════════════════════════════════════════════════

export function createTelegramClientFromEnv(env: TelegramEnvBindings): TelegramClient {
  // 1. التوكن الموحد
  const botToken = env.ERROR_BOT_TOKEN;

  // 2. قناة الأخطاء الموحدة
  const criticalChatId =
    env.ERROR_CHANNEL_ID ||
    env.TELEGRAM_ERROR_CHAT_ID ||
    env.TELEGRAM_CRITICAL_CHAT_ID;

  // 3. الفحص المبكر
  if (!botToken) {
    throw new Error('ERROR_BOT_TOKEN is required for Error Tracking System');
  }
  if (!criticalChatId) {
    throw new Error('ERROR_CHANNEL_ID (or TELEGRAM_ERROR_CHAT_ID) is required');
  }
  // 4. تعيين باقي القنوات لتقرأ من القناة الرئيسية في حال عدم تحديدها
  const warningChatId =
    env.TELEGRAM_WARNING_CHAT_ID ||
    criticalChatId;

  const digestChatId =
    env.TELEGRAM_DIGEST_CHAT_ID ||
    criticalChatId;

  return new TelegramClient({
    botToken,
    criticalChatId,
    warningChatId,
    digestChatId,
    maxMessagesPerSecond: Number(env.TELEGRAM_MAX_MESSAGES_PER_SECOND) || 30,
    circuitFailureThreshold: Number(env.TELEGRAM_CIRCUIT_FAILURE_THRESHOLD) || 5,
    circuitOpenDurationSeconds: Number(env.TELEGRAM_CIRCUIT_OPEN_DURATION) || 300,
    requestTimeoutMs: Number(env.TELEGRAM_REQUEST_TIMEOUT_MS) || 5000,
  });
}

/**
 * الحصول على عميل التليجرام المرتبط بالطلب الحالي فقط
 */
export function getTelegramClient(env: TelegramEnvBindings): TelegramClient {
  return createTelegramClientFromEnv(env);
}

export async function sendCriticalError(
  env: TelegramEnvBindings,
  text: string,
  options?: { buttons?: TelegramInlineButton[] }
): Promise<TelegramSendResult> {
  return getTelegramClient(env).sendCritical(text, options);
}

export async function sendWarningError(
  env: TelegramEnvBindings,
  text: string,
  options?: { buttons?: TelegramInlineButton[] }
): Promise<TelegramSendResult> {
  return getTelegramClient(env).sendWarning(text, options);
}

export async function sendDigestError(
  env: TelegramEnvBindings,
  text: string,
  options?: { buttons?: TelegramInlineButton[] }
): Promise<TelegramSendResult> {
  return getTelegramClient(env).sendDigest(text, options);
}

// ═══════════════════════════════════════════════════════════════
// 📝  مساعدات تنسيق الرسائل (مع التنقية الأمنية)
// ═══════════════════════════════════════════════════════════════

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatErrorForTelegram(
  error: SystemError,
  includeStack: boolean = false
): string {
  const emoji = error.severity === 'critical' ? '🚨' : error.severity === 'warning' ? '⚠️' : 'ℹ️';
  const lines: string[] = [];

  lines.push(`${emoji} <b>[${escapeHtml(error.code)}]</b> ${escapeHtml(error.category.toUpperCase())}`);
  lines.push(`<b>🕒</b> ${escapeHtml(error.timestamp.toISOString())}`);
  lines.push(`<b>📦</b> <code>${escapeHtml(error.correlationId)}</code>`);

  const meta = (error.metadata || {}) as Record<string, unknown>;
  const storeId = ('storeId' in error && typeof error.storeId === 'string' ? error.storeId : undefined) || meta.storeId;

  if (storeId) {
    lines.push(`<b>🏪</b> <code>${escapeHtml(String(storeId))}</code>`);
  }

  lines.push('');
  lines.push(`<b>📌 ${escapeHtml(error.userMessage)}</b>`);

  if (includeStack && error.stack) {
    lines.push('');
    lines.push('<b>📍 Stack Trace:</b>');
    lines.push(`<pre>${escapeHtml(error.stack.slice(0, 500))}</pre>`);
  }

  if (error.metadata && Object.keys(error.metadata).length > 0) {
    lines.push('');
    lines.push('<b>📊 Details:</b>');
    for (const [key, value] of Object.entries(meta)) {
      if (key !== 'storeId' && typeof value !== 'object') {
        lines.push(`  • ${escapeHtml(key)}: ${escapeHtml(String(value))}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatIncidentSummary(data: {
  code: string;
  category: string;
  severity: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  storeId?: string;
  correlationId?: string;
}): string {
  const emoji = data.severity === 'critical' ? '🚨' : data.severity === 'warning' ? '⚠️' : 'ℹ️';
  const lines: string[] = [];

  lines.push(`${emoji} <b>Incident Report</b>`);
  lines.push(`<b>🔴 Code:</b> <code>${escapeHtml(data.code)}</code>`);
  lines.push(`<b>📂 Category:</b> ${escapeHtml(data.category)}`);
  lines.push(`<b>📦 Count:</b> ${data.count} errors in 5 minutes`);

  if (data.storeId) {
    lines.push(`<b>🏪 Store:</b> <code>${escapeHtml(data.storeId)}</code>`);
  }

  lines.push('');
  lines.push(`<b>🕒 First:</b> ${escapeHtml(data.firstTimestamp)}`);
  lines.push(`<b>🕒 Last:</b> ${escapeHtml(data.lastTimestamp)}`);

  return lines.join('\n');
}