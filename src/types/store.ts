// src/types/store.ts

/**
 * ✅ توكنز الثيم الموحدة لواجهات المتاجر (Theme Tokens)
 */
export interface ThemeTokens {
  fontFamily?: string;
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
    accent?: string;
  };
}

/**
 * ✅ تعريف المتجر (Store)
 */
export interface Store {
  /** معرف فريد */
  id: string;
  
  /** اسم المتجر */
  name: string;
  
  /** Slug للـ URL */
  slug: string;
  
  /** وصف المتجر */
  description?: string;
  
  /** شعار المتجر */
  logo?: string;
  
  /** صورة البانر */
  bannerImage?: string;

  /** 🌟 توكنز التصميم الموحدة الجديدة المضافة لمعمارية الأدابترز */
  theme?: ThemeTokens;
  
  /** إعدادات المتجر القديمة (اختياري - للحفاظ على الـ Backward Compatibility) */
  settings?: {
    theme?: string;
    colors?: Record<string, string>;
    layout?: string[];
  };
  
  /** تاريخ الإنشاء */
  createdAt?: string;
  
  /** تاريخ التحديث */
  updatedAt?: string;
}