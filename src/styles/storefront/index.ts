// ============================================================
// 📄  المسار: styles/storefront/index.ts
// 🚪  الوظيفة: البوابة الموحدة (Storefront Gate)
// 🔒  المبدأ: نقطة تصدير واحدة لكل ما في storefront/
// ============================================================

// ============================================================
// 📦  تصدير محرك المتجر الرئيسي والدوال المساعدة
// ============================================================

export {
  StorefrontEngine,
  createStorefrontEngine,
  renderStorefront,
  renderStorefrontWithDetails,
  previewStorefrontTheme,
} from './storefront';

// ============================================================
// 📦  تصدير محتوى CSS (للاستخدام المباشر)
// ============================================================

// استيراد CSS الخام كـ String (للاستخدام في الحقن المباشر)
import storefrontCSS from './storefront.css?inline';

/** محتوى CSS الثابت للمتجر */
export { storefrontCSS as css };

/** كائن يحتوي على جميع أنماط المتجر */
export const storefront = {
  css: storefrontCSS,
  // يمكن إضافة المزيد من الأدوات المساعدة هنا لاحقاً
} as const;

// ============================================================
// 📦  تصدير افتراضي (للاستخدام السريع)
// ============================================================

import * as storefrontModule from './storefront';

const storefrontIndexExport = {
  ...storefrontModule,
  css: storefrontCSS,
  storefront,
};

export default storefrontIndexExport;