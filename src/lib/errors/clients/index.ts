// lib/errors/clients/index.ts
// الإصدار: 1.0.0
// الدور: البوابة الرئيسية للعملاء الخارجيين (Telegram, QStash) مع حماية Circuit Breaker و Rate Limiting

// ═══════════════════════════════════════════════════════════════
// 1️⃣ عميل التليجرام (Telegram Bot Client & Helpers)
// ═══════════════════════════════════════════════════════════════
export {
  TelegramClient,
  createTelegramClientFromEnv,
  getTelegramClient,
  sendCriticalError,
  sendWarningError,
  sendDigestError,
  escapeHtml,
  formatErrorForTelegram,
  formatIncidentSummary,
} from './telegram';

export type {
  TelegramChannel,
  TelegramMessagePriority,
  TelegramMessage,
  TelegramInlineButton,
  TelegramConfig,
  TelegramSendResult,
  TelegramEnvBindings,
} from './telegram';

// ═══════════════════════════════════════════════════════════════
// 2️⃣ عميل Upstash QStash (QStash Client & Scheduling Helpers)
// ═══════════════════════════════════════════════════════════════
export {
  QStashClient,
  createQStashClientFromEnv,
  getQStashClient,
  publishToQStash,
  scheduleQStash,
  publishDelayedToQStash,
  cancelQStashSchedule,
  scheduleRetry,
} from './qstash';

export type {
  QStashEnv,
  QStashPublishOptions,
  QStashPublishResult,
  QStashConfig,
} from './qstash';