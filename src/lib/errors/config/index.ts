// lib/errors/config/index.ts
// الإصدار: 1.0.0
// الدور: البوابة الرئيسية لإعدادات وعتبات نظام إدارة الأخطاء والأداء

// ═══════════════════════════════════════════════════════════════
// 1️⃣ إعدادات عتبات الأداء (Performance Thresholds)
// ═══════════════════════════════════════════════════════════════
export {
  DEFAULT_THRESHOLDS,
  getThresholdForPath,
  getThresholdForPathWithInfo,
  getPathsByPrefix,
  getPathsByPriority,
  hasCustomThreshold,
  mergeThresholds,
  setThresholdForPath,
  removeThresholdForPath,
  getThresholdsJSON,
  getThresholdsSummary,
} from './thresholds';

export type {
  RouteThreshold,
  PerformanceThresholdsConfig,
} from './thresholds';