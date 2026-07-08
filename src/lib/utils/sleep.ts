// src/lib/utils/sleep.ts

/**
 * تأخير تنفيذ الكود لمدة معينة
 * @param ms - عدد الملي ثانية للتأخير
 * @returns Promise يتحقق بعد انتهاء المدة
 * 
 * @example
 * // تأخير لمدة 1 ثانية
 * await sleep(1000);
 * 
 * // تأخير تصاعدي لإعادة المحاولة
 * for (let i = 0; i < 3; i++) {
 *   try {
 *     await doSomething();
 *     break;
 *   } catch {
 *     await sleep(1000 * (i + 1)); // 1s, 2s, 3s
 *   }
 * }
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}