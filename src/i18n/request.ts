import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';

// 1️⃣ تحديد اللغات المدعومة واللغة الافتراضية
const locales = ['ar', 'en'];
const defaultLocale = 'ar';

export default getRequestConfig(async ({ requestLocale }) => {
  // استقبال الـ locale الحالي
  let locale = await requestLocale;

  // التحقق والتأكد من وجود اللغة
  if (!locale || !hasLocale(locales, locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    // استيراد الملف المباشر لضمان دمج الـ Bundling في بيئة Edge بدون أخطاء
    messages: (await import(`../messages/${locale}/common.json`)).default
  };
});