import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  📐 المخططات الأساسية (Base Schemas)                      ║
// ║  📌 جميع هذه المخططات تُستخدم كـ "مدخلات مستخدم"            ║
// ╚════════════════════════════════════════════════════════════╝

export const uuidSchema = z.string().uuid('يجب أن يكون معرف UUID صالح');

/**
 * 📞 رقم الهاتف (مصري + دولي)
 * - التحقق العميق من صحة رمز الدولة يتم في الخدمة.
 * - لا يقبل null لتجنب فقدان البيانات في التحديثات الجزئية.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:01[0125][0-9]{8}|05[0-9]{8}|\+?[0-9]{10,15})$/,
    'رقم هاتف غير صالح'
  )
  .optional(); // ✅ لا .nullable()

/**
 * 🛡️ دالة مساعدة للتحقق السريع من صيغة رقم الهاتف الدولية.
 * تستخدم نفس منطق phoneSchema، لكن بدون اعتماد على Zod.
 * مفيدة للفحص السريع قبل استدعاء قاعدة البيانات.
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^\+\d{10,15}$/.test(cleaned);
}

/**
 * 💰 السعر (بالقروش) – نص رقمي آمن
 * - يُقبل كنص رقمي (string) لمنع أخطاء التقريب في JavaScript.
 * - لا يُحوَّل إلى BigInt هنا لتجنب فشل JSON.stringify.
 * - التحويل إلى BigInt للداتابيز يتم في طبقة الخدمة.
 * - الحد الأقصى: 9,999,999,999,999,999 (حوالي 100 تريليون جنيه).
 */
export const priceSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'السعر يجب أن يكون رقماً صحيحاً (بالقروش)')
  .refine((val) => {
    try {
      const amount = BigInt(val);
      // الحد الأقصى للقيمة بالجنيهات (حوالي 100 تريليون)
      const maxPrice = BigInt('9999999999999999');
      return amount >= 0 && amount <= maxPrice;
    } catch {
      return false;
    }
  }, 'السعر خارج النطاق المسموح به');
// ✅ لا يوجد .transform() هنا – الخدمة هي المسؤولة عن التحويل

/**
 * 🏷️ Slug (صيغة URL آمنة)
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug لا يمكن أن يكون فارغاً')
  .max(255, 'Slug طويل جداً')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug غير صالح');

/**
 * 📧 البريد الإلكتروني
 * - لا يقبل null لتجنب فقدان البيانات في التحديثات الجزئية.
 * - الصيغة العامة متعمدة، والتحقق العميق (MX Records) في الخدمة.
 */
export const emailSchema = z
  .string()
  .trim()
  .email('بريد إلكتروني غير صالح')
  .optional(); // ✅ لا .nullable()