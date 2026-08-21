/* src/styles/types.ts */
// ============================================================
// 📄  المسار: src/styles/types.ts
// 📜  الوظيفة: العقود المركزية - تعريفات الأنواع الأساسية
// 🔒  المبدأ: المصدر الوحيد للحقيقة لجميع أنواع النظام
// ============================================================

// ============================================================
// 🎨  وحدات الألوان (Composable Color Interfaces)
// ============================================================

/**
 * لوحة ألوان متكاملة
 * @property main - اللون الرئيسي
 * @property light - النسخة الفاتحة
 * @property dark - النسخة الغامقة
 * @property contrastText - النص المتوافق مع التباين
 */
export interface ColorPalette {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

/**
 * نظام الألوان الكامل
 */
export interface ColorSystem {
  primary: ColorPalette;
  secondary: ColorPalette;
  success: ColorPalette;
  warning: ColorPalette;
  danger: ColorPalette;
  info: ColorPalette;
  background: {
    default: string;
    paper: string;
    elevated: string;
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
    hint: string;
  };
  border: {
    subtle: string;
    strong: string;
    glow: string;
  };
}

// ============================================================
// 📝  وحدات الطباعة (Typography Interfaces)
// ============================================================

/**
 * مقياس الطباعة الكامل
 */
export interface TypographyScale {
  /** خطوط النظام (لاتيني) */
  fontFamily: string;
  /** خطوط النظام (عربي) */
  fontFamilyArabic: string;
  /** أحجام الخطوط */
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
  };
  /** أوزان الخطوط */
  fontWeight: {
    light: number;
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  /** ارتفاعات السطر */
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

// ============================================================
// 📐  وحدات الأبعاد والحركة (Layout, Spacing & Motion)
// ============================================================

/**
 * نظام المسافات
 */
export interface SpacingSystem {
  /** الوحدة الأساسية (بالـ px) */
  unit: number;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
  '4xl': string;
}

/**
 * نظام أنصاف الأقطار
 */
export interface RadiusSystem {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  full: string;
}

/**
 * نظام الظلال
 */
export interface ShadowSystem {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  glow: string;
}

/**
 * نظام الحركة والسرعات
 */
export interface MotionSystem {
  fast: string;
  base: string;
  slow: string;
  extraSlow: string;
}

// ============================================================
// 🎨  الثيم الرئيسي (Theme Core Interface)
// ============================================================

/**
 * 🌟  الثيم الكامل للنظام
 */
export interface Theme {
  // الهوية
  id: string;
  name: string;
  version: string;
  slug: string;

  // 🔄  التوريث (Theme Inheritance)
  extends?: string;
  overrides?: DeepPartial<Omit<Theme, 'id' | 'name' | 'version' | 'slug' | 'extends' | 'overrides'>>;

  // الأنظمة البصرية
  colors: ColorSystem;
  typography: TypographyScale;
  spacing: SpacingSystem;
  radius: RadiusSystem;
  shadows: ShadowSystem;
  motion: MotionSystem;

  // الأزرار
  button: {
    borderRadius: string;
    padding: {
      small: string;
      medium: string;
      large: string;
    };
  };

  // البطاقات
  card: {
    borderRadius: string;
    shadow: string;
    padding: string;
  };

  // التخطيط العام
  layout: {
    maxWidth: string;
    containerPadding: string;
    headerHeight: string;
    footerHeight: string;
    sidebarWidth: string;
  };

  // ⏱️  بيانات التحكم (للكاش والإبطال)
  updatedAt: number;

  // التخصيص المفتوح (Custom Extensions)
  custom?: Record<string, unknown>;
}

// ============================================================
// 🎯  أنواع السياق لكل بيئة (Type-Safe Contexts)
// ============================================================

/**
 * سياق متجر العميل (Storefront)
 */
export interface StorefrontContext {
  storeSlug: string;
  locale: string;
  userAgent?: string;
  previewMode?: boolean;
}

/**
 * سياق محرر المتجر (Store Builder)
 */
export interface BuilderContext {
  storeId: string;
  merchantId: string;
  draftThemeId?: string;
}

/**
 * سياق لوحة تحكم التاجر (Admin Dashboard)
 */
export interface AdminContext {
  storeId: string;
  merchantId: string;
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
}

/**
 * سياق تطبيق تليجرام الميني (Mini-App)
 */
export interface MiniAppContext {
  storeSlug: string;
  telegramUserId: string;
  telegramTheme: {
    bg_color: string;
    text_color: string;
    hint_color: string;
    link_color: string;
    button_color: string;
    button_text_color: string;
  };
}

// ============================================================
// 🎼  واجهات الـ Domain Engine (Adapter + Orchestrator)
// ============================================================

/**
 * 🎼  الـ Domain Engine (يجمع بين الـ Adapter والـ Orchestrator)
 */
export interface DomainEngine<T extends Theme = Theme, C = unknown> {
  readonly name: string;
  readonly version: string;

  transform(theme: T, context: C): Record<string, string>;
  getTheme(context: C): Promise<T> | T;
  render(context: C): Promise<string>;
  updateTheme(identifier: string, newTheme: DeepPartial<T>): Promise<void>;
}

// ============================================================
// 🧩  أنواع مساعدة (Helper Types)
// ============================================================

/**
 * الثيم الجزئي العميق (لـ overrides)
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ThemeKey = keyof Theme;
export type ThemeValue = Theme[keyof Theme];
export type ResolvedTheme = Omit<Theme, 'extends' | 'overrides'>;

// ============================================================
// 📦  تصدير عام
// ============================================================

const typesExport = {};
export default typesExport;