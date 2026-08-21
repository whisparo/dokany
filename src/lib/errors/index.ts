// lib/errors/index.ts

import { 
  errorOrchestrator, 
  type SystemEnvironment, 
  type HandleErrorOptions 
} from './orchestrator';

// 1. تصدير الأدوات الأساسية والأنواع
export { SystemError, isSystemError } from './core';
export { safeExecute } from './processing';

// 2. تصدير الأوركستريتور والأنواع المباشرة
export { errorOrchestrator, ErrorOrchestrator } from './orchestrator';

// 3. تحويل جميع العمليات (Facade Layer) للـ Orchestrator

/**
 * تهيئة نظام الأخطاء عبر الأوركستريتور
 */
export async function initErrorSystem(env?: SystemEnvironment) {
  return await errorOrchestrator.init(env);
}

/**
 * التقاط استثناء لحظي وتوجيهه للأوركستريتور
 */
export async function captureException(
  error: unknown,
  env?: SystemEnvironment,
  options?: HandleErrorOptions
) {
  return await errorOrchestrator.handleException(error, env, options);
}

/**
 * التقاط رسالة نصية وتوجيهها للأوركستريتور
 */
export async function captureMessage(
  message: string,
  env?: SystemEnvironment,
  options?: HandleErrorOptions
) {
  return await errorOrchestrator.handleMessage(message, env, options);
}

/**
 * معالجة قائمة الانتظار في الخلفية (Cron Job Facade) عبر الأوركستريتور
 */
export async function processErrorQueue(
  env?: SystemEnvironment,
  options?: { batchSize?: number }
) {
  return await errorOrchestrator.processQueue(env, options);
}

/**
 * تفريغ الدفعات المعلقة من الـ KV إلى D1 في الخلفية عبر الأوركستريتور
 */
export async function processBatchFlush(
  env?: SystemEnvironment,
  options?: { batchSize?: number }
) {
  return await errorOrchestrator.processBatchFlush(env, options);
}

/**
 * صياغة استجابة API موحدة
 */
export function toApiError(error: unknown, includeDetails: boolean = false) {
  return errorOrchestrator.formatApiError(error, includeDetails);
}

export type { SystemEnvironment, HandleErrorOptions };
export default errorOrchestrator;