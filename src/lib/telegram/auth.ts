// lib/telegram/auth.ts
import { createHmac } from 'crypto';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * التحقق من صحة بيانات initData القادمة من تليجرام ويب آب
 * هذه الدالة تُستخدم في Mini App لتأكيد هوية المستخدم
 */
export function verifyTelegramInitData(initData: string, botToken: string): TelegramUser | null {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  // فرز المعلمات أبجديًا (مطلوب من تليجرام)
  const sortedParams = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

  if (computedHash !== hash) {
    return null; // فشل التحقق
  }

  const user = urlParams.get('user');
  if (!user) return null;

  try {
    return JSON.parse(user) as TelegramUser;
  } catch {
    return null;
  }
}