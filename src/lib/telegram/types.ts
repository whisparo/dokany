// src/lib/telegram/types.ts

/**
 * حالة جلسة التسجيل (Onboarding)
 */
export interface OnboardingSession {
  /** الخطوة الحالية في عملية التسجيل (🎯 تم إضافة email هنا) */
  step: 'phone' | 'name' | 'store' | 'email' | 'niche' | 'completed';
  /** رقم الهاتف (بعد إدخاله) */
  phone?: string;
  /** اسم المستخدم (بعد إدخاله) */
  name?: string;
  /** اسم المتجر (بعد إدخاله) */
  storeName?: string;
  /** 📧 البريد الإلكتروني (🎯 تم إضافته لأمان الحساب والـ Magic Links) */
  email?: string;
  /** عدد محاولات إدخال التخصص (للحد من التكرار) */
  nicheAttempts?: number;
}

/**
 * مرادف لـ OnboardingSession (للتوافق مع الكود القديم)
 */
export type SessionData = OnboardingSession;

/**
 * زر داخل لوحة Telegram أو واجهة الويب
 */
export interface ButtonItem {
  /** النص المعروض على الزر */
  text: string;
  /** البيانات التي ترسل عند الضغط (callback) */
  callback_data?: string;
  /** رابط URL عند الضغط */
  url?: string;
  /** قيمة مخصصة (للاستخدام الداخلي) */
  value?: string;
  /** أي خصائص إضافية */
  [key: string]: string | number | boolean | undefined;
}

/**
 * صف من الأزرار (يدعم عدة أزرار في صف واحد)
 */
export type ButtonRow = ButtonItem[];

/**
 * السياق المرسل إلى معالج (Handler) في Telegram Bot أو Web
 */
export interface HandlerContext {
  /** المنصة (تيليجرام أو ويب) */
  platform: 'telegram' | 'web';
  /** المعرف الخارجي للمستخدم (chat_id في تيليجرام) */
  externalId: string;
  /** نص الرسالة المرسلة */
  message: string;
  /** بيانات جهة الاتصال (إذا تم مشاركتها) */
  contact?: {
    phone_number: string;
    first_name?: string;
    last_name?: string;
    user_id?: number;
  };
  /** معرف المستخدم في تيليجرام (رقم) */
  telegramUserId?: number;
  /** الجلسة الحالية للمستخدم */
  session: OnboardingSession;
}

/**
 * نتيجة معالجة الطلب من قبل الـ Handler
 */
export interface HandlerResult {
  /** الرد النصي الذي سيرسل للمستخدم */
  reply: string;
  /** أزرار تفاعلية (تظهر مرة واحدة) */
  buttons?: ButtonRow[];
  /** أزرار دائمة (تظهر في كل رسالة) */
  persistentButtons?: ButtonRow[];
  /** تحديث جزئي للجلسة (إذا لزم الأمر) */
  session?: Partial<OnboardingSession>;
  /** إجراء إضافي (مثل 'create_store') */
  action?: string;
}