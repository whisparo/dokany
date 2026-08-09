//src/workers/rate-limiter/src/strategies.ts

export interface Strategy {
  perIp: number;          // عدد الطلبات لكل IP في النافذة الزمنية
  perUser?: number;       // عدد الطلبات للمستخدم المسجل
  perStore?: number;      // عدد الطلبات للمتجر الواحد
  globalLimit?: number;   // حد أقصى شامل للخدمة في النافذة (حماية من الـ Exhaustion)
  windowMs: number;       // حجم النافذة الزمنية بالملي ثانية
  description: string;
}

export const STRATEGIES: Record<string, Strategy> = {
  // 🔐 1. مسارات حساسة جداً (Authentication & Security)
  login: {
    perIp: 5,             // 5 محاولات لكل IP في الدقيقة
    perUser: 10,
    windowMs: 60000,      // دقيقة
    description: 'Login attempts',
  },

  'auth:register': {
    perIp: 3,             // 3 محاولات تسجيل حساب جديد كل 5 دقائق
    windowMs: 300000,     // 5 دقائق
    description: 'Account registration attempts',
  },

  magic_link: {
    perIp: 3,             // 3 طلبات رابط سري في الساعة
    perUser: 5,
    windowMs: 3600000,    // ساعة
    description: 'Magic link requests',
  },

  pin_attempt: {
    perIp: 5,             // 5 محاولات PIN فاشلة
    windowMs: 900000,     // 15 دقيقة
    description: 'PIN code verification',
  },

  // 💰 2. عمليات تجارية وطلبات الشراء (Checkout & Orders)
  checkout: {
    perIp: 15,            // 15 محاولة الشراء لكل IP بالدقيقة
    perUser: 30,
    perStore: 300,        // 300 عملية شراء كحد أقصى للمتجر في الدقيقة
    windowMs: 60000,
    description: 'Checkout and payment submission',
  },

  add_to_cart: {
    perIp: 40,
    perUser: 100,
    windowMs: 60000,
    description: 'Add to cart actions',
  },

  // 🛍️ 3. تصفح الواجهة والمتجر (Storefront Operations)
  'storefront:read': {
    perIp: 200,           // سماح عالي لتصفح الصور والمنتجات
    perUser: 400,
    perStore: 3000,       // ضغط التصفح العام للمتجر
    windowMs: 60000,      // دقيقة
    description: 'Browsing store products and catalog',
  },

  // 📊 4. استعلامات الـ API والـ Dashboard
  api_call: {
    perIp: 100,
    perUser: 300,
    perStore: 500,
    windowMs: 60000,
    description: 'General API calls',
  },

  // 🤖 5. Telegram Webhooks & Bots
  telegram_webhook: {
    perIp: 1500,          // تلجرام يرسل من سيرفرات مركزية
    perStore: 300,        // حماية المتجر الواحد من إغراق البوتات
    windowMs: 60000,
    description: 'Telegram bot incoming webhooks',
  },

  // 📤 6. رفع الملفات والصور (Media Uploads)
  upload: {
    perIp: 10,
    perUser: 30,
    windowMs: 60000,
    description: 'File and image upload operations',
  },

  // 📈 7. التقارير والتحليلات (Analytics)
  analytics: {
    perIp: 30,
    perUser: 60,
    perStore: 150,
    windowMs: 60000,
    description: 'Analytics and dashboard reporting queries',
  },

  // 🔓 8. الاستراتيجية الافتراضية
  default: {
    perIp: 60,
    perUser: 120,
    windowMs: 60000,
    description: 'Default rate limit for unspecified actions',
  },
};

/**
 * دالة جلب الاستراتيجية المناسبة مع التحقق من الـ Aliases
 */
export function getStrategy(action: string): Strategy {
  return STRATEGIES[action] || STRATEGIES.default;
}