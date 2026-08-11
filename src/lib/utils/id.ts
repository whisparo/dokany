/**
 * 🔑 مولد المعرفات العشوائية الآمنة (Cryptographically Secure Unique Identifiers)
 */

/**
 * توليد UUID v4 آمن
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * توليد معرف قصير آمن لاستخدامات الـ Prefixes أو العينات السريعة
 * بديل آمن لـ Math.random().toString(36)
 */
export function generateShortId(length: number = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, length)
    .toUpperCase();
}