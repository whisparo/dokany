// lib/telegram/auth.ts

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * التحقق من صحة بيانات initData القادمة من تليجرام ويب آب
 * متوافقة 100% مع الـ Edge Runtime وكلاود فلير
 */
export async function verifyTelegramInitData(initData: string, botToken: string): Promise<TelegramUser | null> {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  
  if (!hash) return null;
  urlParams.delete('hash');

  // فرز المعلمات أبجديًا (مطلوب من تليجرام)
  const sortedParams = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // تحويل النصوص لـ Buffers للـ Web Crypto API
  const encoder = new TextEncoder();
  const secretKeyBuffer = encoder.encode("WebAppData");
  const botTokenBuffer = encoder.encode(botToken);
  const dataBuffer = encoder.encode(sortedParams);

  try {
    // 1. حساب الـ Secret Key من الـ Bot Token
    const cryptoKey1 = await crypto.subtle.importKey(
      "raw",
      secretKeyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const secretKey = await crypto.subtle.sign("HMAC", cryptoKey1, botTokenBuffer);

    // 2. حساب الـ Hash النهائي ومقارنته
    const cryptoKey2 = await crypto.subtle.importKey(
      "raw",
      secretKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey2, dataBuffer);

    const computedHash = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedHash !== hash) {
      return null; // فشل التحقق
    }

    const user = urlParams.get('user');
    if (!user) return null;

    return JSON.parse(user) as TelegramUser;
  } catch (error) {
    return null;
  }
}