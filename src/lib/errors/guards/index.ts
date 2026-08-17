// lib/errors/guards/index.ts
// الإصدار: 1.0.1
// الدور: المجمع الرئيسي لحراس النظام (System Guards Index)
// المبدأ: تصدير جميع أدوات الحماية (Rate Limiter, Circuit Breaker, Deduplicator)

// ═══════════════════════════════════════════════════════════════
// 1️⃣ حارس معدل الطلبات (Rate Limiter)
// ═══════════════════════════════════════════════════════════════

export {
  RateLimiter,
  getRateLimiter,
  checkRateLimit,
  peekRateLimit,
  resetRateLimit,
  withRateLimit,
  rateLimitMiddleware,
  type RateLimiterConfig,
  type RateLimitResult,
} from './rate-limiter';

// ═══════════════════════════════════════════════════════════════
// 2️⃣ حارس قطع الدائرة (Circuit Breaker)
// ═══════════════════════════════════════════════════════════════

export {
  CircuitBreaker,
  getCircuitBreaker,
  withCircuitBreaker,
  getCircuitKey,
  resetAllCircuits,
  getAllCircuitStatuses,
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitStatus,
} from './circuit-breaker';

// ═══════════════════════════════════════════════════════════════
// 3️⃣ حارس منع التكرار وتجميع الحوادث (Deduplicator)
// ═══════════════════════════════════════════════════════════════

export {
  Deduplicator,
  getDeduplicator,
  recordError,
  getIncident,
  getActiveIncidents,
  resetIncident,
  withDeduplication,
  formatIncidentSummary,
  type DeduplicatorConfig,
  type IncidentData,
  type DeduplicationResult,
} from './deduplicator';