// lib/errors/index.ts
// الإصدار: 2.3.0
// الدور: البوابة المباشرة الموحدة لنظام معالجة الأخطاء (Proxy Entrypoint)

import { 
  errorOrchestrator, 
  type SystemEnvironment, 
  type HandleErrorOptions 
} from './orchestrator';

// 1. تصدير الأدوات الأساسية اليومية
export { SystemError, isSystemError } from './core';
export { safeExecute } from './processing';
export { processErrorQueue } from './background/processor';

// 2. تصدير الأوركستريتور
export { errorOrchestrator, ErrorOrchestrator } from './orchestrator';

// 3. تحويل العمليات المباشرة للأوركستريتور
export async function initErrorSystem(env?: SystemEnvironment) {
  return await errorOrchestrator.init(env);
}

export async function captureException(
  error: unknown,
  env?: SystemEnvironment,
  options?: HandleErrorOptions
) {
  return await errorOrchestrator.handleException(error, env, options);
}

export async function captureMessage(
  message: string,
  env?: SystemEnvironment,
  options?: HandleErrorOptions
) {
  return await errorOrchestrator.handleMessage(message, env, options);
}

export function toApiError(error: unknown, includeDetails: boolean = false) {
  return errorOrchestrator.formatApiError(error, includeDetails);
}

export type { SystemEnvironment, HandleErrorOptions };
export default errorOrchestrator;