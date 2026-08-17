// lib/errors/health/index.ts
// الإصدار: 1.0.1
// الدور: التصدير الموحد لمسارات المراقبة والفحص (Ping & Health & Readiness)

export {
  handlePing,
  pingResponse,
  pingLight,
  healthCheck,
  uptimeResponse,
  type PingResponse,
  type HealthCheckItem,
} from './ping';

export {
  checkReadiness,
  readinessHandler,
  nextReadinessHandler,
  type ServiceCheck,
  type ReadinessResponse,
  type ReadinessOptions,
} from './readiness';