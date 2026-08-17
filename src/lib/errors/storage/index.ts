// lib/errors/storage/index.ts
// الإصدار: 1.0.2
// الدور: التصدير المركزي لجميع وحدات وحدة التخزين (Backblaze B2 & Redis Storage)

// ═══════════════════════════════════════════════════════════════
// 📦 1. Backblaze B2 Base Client
// ═══════════════════════════════════════════════════════════════
export {
  B2Client,
  type B2ClientOptions,
  type B2PutResult,
  type B2GetResult,
} from './b2-client';

// ═══════════════════════════════════════════════════════════════
// 📦 2. Gzip Compression Utilities
// ═══════════════════════════════════════════════════════════════
export {
  gzipCompress,
  gzipDecompress,
} from './b2-compression';

// ═══════════════════════════════════════════════════════════════
// 📦 3. B2 Storage Layer
// ═══════════════════════════════════════════════════════════════
export {
  B2Store,
  createB2StoreFromEnv,
  type B2WriteOptions,
  type B2WriteResult,
  type B2ReadOptions,
  type B2ReadResult,
} from './b2-store';

// ═══════════════════════════════════════════════════════════════
// 📦 4. Redis Queue Manager
// ═══════════════════════════════════════════════════════════════
export {
  QueueManager,
  createQueueManager,
  enqueueErrorKey,
  dequeueErrorKey,
  dequeueErrorKeys,
  getQueueLength,
  type QueueEnv,
  type QueueOptions,
  type QueueStats,
} from './queue-manager';

// ═══════════════════════════════════════════════════════════════
// 📦 5. Redis Analytics Counter
// ═══════════════════════════════════════════════════════════════
export {
  ErrorCounter,
  getRedisClient,
  createErrorCounterFromEnv,
  createDailyCounterKey,
  createIncidentKey,
  createRecentErrorsKey,
  createErrorRateKey,
  type RedisEnv,
  type RedisCounterOptions,
  type CounterUpdateResult,
  type RecentErrorEntry,
} from './redis-counter';