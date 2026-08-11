// tests/unit/security-crypto.test.ts
import { describe, it, expect } from 'vitest';

/**
 * دالة محاكاة للتحقق من توقيع Webhook القادم من بوابة الدفع باستخدام HMAC-SHA256
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // تحويل التوقيع السداسي عشري (Hex) إلى Buffer
  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  return await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payload)
  );
}

/**
 * دالة مساعدة لتوليد توقيع صحيح للتجربة
 */
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('Unit - Cryptographic Security & Webhook Integrity', () => {

  const secret = 'super-secret-webhook-key-123';
  const payload = JSON.stringify({ orderId: 'ord_9988', status: 'PAID', amount: 450 });

  it('يجب أن يقبل التوقيع الصحيح للطلب دون أي تلاعب', async () => {
    const validSignature = await generateSignature(payload, secret);
    const isValid = await verifyWebhookSignature(payload, validSignature, secret);
    
    expect(isValid).toBe(true);
  });

  it('يجب أن يرفض الطلب فوراً إذا تم التلاعب بمحتوى الـ Payload', async () => {
    const validSignature = await generateSignature(payload, secret);
    const tamperedPayload = JSON.stringify({ orderId: 'ord_9988', status: 'PAID', amount: 10 }); // تغيير المبلغ
    
    const isValid = await verifyWebhookSignature(tamperedPayload, validSignature, secret);
    
    expect(isValid).toBe(false);
  });

  it('يجب أن يرفض الطلب إذا كان مفتاح التشفير Secret غير مطابق', async () => {
    const validSignature = await generateSignature(payload, secret);
    const isValid = await verifyWebhookSignature(payload, validSignature, 'wrong-secret-key');
    
    expect(isValid).toBe(false);
  });

});