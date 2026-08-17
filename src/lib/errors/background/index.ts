// lib/errors/background/index.ts
// الإصدار: 1.0.0
// الدور: البوابة الرئيسية للمعالجات الخلفية والتنفيذيّات الدورية (QStash Cron Jobs)

// ═══════════════════════════════════════════════════════════════
// 1️⃣ معالج قائمة انتظار الأخطاء (Main Batch Processor)
// ═══════════════════════════════════════════════════════════════
export {
  processErrorQueue,
  processErrorQueueHandler,
  reprocessFailedErrors,
  cleanupOldErrors,
} from './processor';

export type {
  ProcessorEnv,
  ProcessedErrorResult,
  BatchProcessResult,
  ProcessorOptions,
} from './processor';

// ═══════════════════════════════════════════════════════════════
// 2️⃣ التقرير اليومي للأخطاء الصامتة (Silent Errors Daily Digest)
// ═══════════════════════════════════════════════════════════════
export {
  generateSilentDigest,
  silentDigestHandler,
} from './silent-digest';

export type {
  SilentDigestResult,
  SilentCodeBreakdown,
  SilentDigestOptions,
} from './silent-digest';