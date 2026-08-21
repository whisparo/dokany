// ============================================================
// 📄  المسار: styles/storefront/storefront.ts
// 🛍️  الوظيفة: محرك متجر العميل (Adapter + Orchestrator)
// 🔒  المبدأ: كل شيء يخص المتجر في ملف واحد، يرث BaseDomainEngine
// ============================================================

import type { Theme, StorefrontContext } from '../types';
import { BaseDomainEngine } from '../shared/base-domain-engine';
import type { ThemeProviderEnv } from '../shared/theme-provider';
import type { EngineRenderResult } from '../shared/base-domain-engine';
import { resolveTheme } from '../shared/theme-inheritance';

// استيراد أنماط المتجر الثابتة (كـ String)
import storefrontCSS from './storefront.css?inline';

// ============================================================
// 🎼  محرك المتجر (Storefront Engine)
// ============================================================

/**
 * 🛍️  محرك متجر العميل
 */
export class StorefrontEngine extends BaseDomainEngine<Theme, StorefrontContext> {
  /** اسم المحرك (للتصحيح) */
  public readonly name = 'StorefrontEngine';
  /** إصدار المحرك */
  public readonly version = '1.0.0';

  /**
   * @param env - بيئة Cloudflare (تحتوي على D1 و KV)
   * @param options - خيارات إضافية (اختياري)
   */
  constructor(env: ThemeProviderEnv, options?: { debug?: boolean }) {
    super(env, {
      name: 'StorefrontEngine',
      version: '1.0.0',
      debug: options?.debug ?? false,
      cssVarsOptions: {
        prefix: 'store',
        separator: '-',
        includeComments: options?.debug ?? false,
      },
    });
  }

  // ============================================================
  // 🔄  تنفيذ الدوال المجردة من BaseDomainEngine
  // ============================================================

  /**
   * تحويل الثيم إلى CSS Variables الخاصة بالمتجر
   */
  transform(theme: Theme, context: StorefrontContext): Record<string, string> {
    const baseVars = this.buildThemeVars(theme, context);

    // ═══════════════════════════════════════════════════════════════
    // 🛍️  إضافة متغيرات خاصة بالمتجر فقط (مع حماية Optional Chaining)
    // ═══════════════════════════════════════════════════════════════

    // 1️⃣  متغيرات خاصة بالبطاقات
    baseVars['--store-card-hover-transform'] = 'translateY(-4px)';
    baseVars['--store-card-hover-shadow'] = '0 10px 15px rgba(0,0,0,0.1)';

    // 2️⃣  متغيرات خاصة بالأزرار في المتجر
    baseVars['--store-btn-primary-hover'] = theme.colors?.primary?.dark ?? '#4f46e5';
    baseVars['--store-btn-secondary-hover'] = theme.colors?.secondary?.dark ?? '#7c3aed';
    baseVars['--store-btn-radius'] = theme.button?.borderRadius ?? '8px';

    // 3️⃣  متغيرات خاصة بالشبكة (Grid)
    baseVars['--store-grid-gap'] = theme.spacing?.lg ?? '24px';
    baseVars['--store-grid-min-width'] = '220px';

    // 4️⃣  متغيرات خاصة بالرأس (Header)
    baseVars['--store-header-bg'] = theme.colors?.background?.paper ?? '#f8fafc';
    baseVars['--store-header-shadow'] = '0 1px 3px rgba(0,0,0,0.05)';

    // 5️⃣  متغيرات خاصة بالتذييل (Footer)
    baseVars['--store-footer-bg'] = theme.colors?.background?.elevated ?? '#f1f5f9';

    // 6️⃣  متغيرات خاصة بالـ Cart
    baseVars['--store-cart-bg'] = theme.colors?.background?.paper ?? '#ffffff';
    baseVars['--store-cart-shadow'] = '0 20px 25px rgba(0,0,0,0.1)';

    // 7️⃣  متغيرات خاصة بالـ Checkout
    baseVars['--store-checkout-section-bg'] = theme.colors?.background?.paper ?? '#ffffff';
    baseVars['--store-checkout-section-radius'] = theme.card?.borderRadius ?? '12px';

    // 8️⃣  دعم RTL
    const isRTL = ['ar', 'fa', 'he'].includes(context.locale);
    baseVars['--store-direction'] = isRTL ? 'rtl' : 'ltr';
    baseVars['--store-text-align'] = isRTL ? 'right' : 'left';

    // 9️⃣  وضع المعاينة (Preview Mode)
    if (context.previewMode) {
      const mainColor = theme.colors?.primary?.main ?? '#6366f1';
      const contrastText = theme.colors?.primary?.contrastText ?? '#ffffff';
      baseVars['--store-preview-border'] = `2px dashed ${mainColor}`;
      baseVars['--store-preview-badge-bg'] = mainColor;
      baseVars['--store-preview-badge-text'] = contrastText;
    }

    // 🔟  إضافة أي متغيرات مخصصة من الثيم (custom)
    if (theme.custom && typeof theme.custom === 'object') {
      for (const [key, value] of Object.entries(theme.custom)) {
        if (typeof value === 'string' || typeof value === 'number') {
          baseVars[`--store-custom-${key}`] = String(value);
        }
      }
    }

    return baseVars;
  }

  /**
   * الحصول على الـ CSS الثابت للمتجر
   */
  protected getStaticCSS(): string {
    return storefrontCSS;
  }

  /**
   * الحصول على بادئة CSS Variables
   */
  protected getCSSPrefix(): string {
    return 'store';
  }

  // ============================================================
  // 🚀  دوال خاصة بالمتجر (إضافية)
  // ============================================================

  async renderWithDetails(context: StorefrontContext): Promise<EngineRenderResult> {
    return super.renderWithDetails(context);
  }

  async getStorefrontStatus(context: StorefrontContext): Promise<{
    name: string;
    version: string;
    storeSlug: string;
    locale: string;
    previewMode: boolean;
    themeId: string;
    hasInheritance: boolean;
    cacheSource: string;
  }> {
    const baseStatus = await this.getStatus(context);
    return {
      ...baseStatus,
      storeSlug: context.storeSlug,
      locale: context.locale,
      previewMode: context.previewMode ?? false,
    };
  }

  /**
   * معاينة الثيم (للمطورين)
   */
  // داخل storefront.ts - تعديل دالة previewTheme

async previewTheme(theme: Theme, context: StorefrontContext): Promise<string> {
  let previewTheme = theme;

  if (theme.extends) {
    try {
      // 1. جلب الثيم الأب مسبقاً عبر async/await
      const parentResult = await this.themeProvider.getTheme(theme.extends);
      
      if (parentResult.theme) {
        // 2. خريطة بالثيمات المحملة لتمريرها بشكل Synchronous
        const loadedThemes = new Map<string, Theme>();
        loadedThemes.set(theme.extends, parentResult.theme);

        // 3. دالة Sync مطابقة للـ Signature المطلوب
        const getParentSync = (id: string): Theme | null => {
          return loadedThemes.get(id) ?? null;
        };

        const inheritance = resolveTheme(theme, getParentSync, {
          maxDepth: this.inheritanceOptions.maxDepth,
          debug: this.debug,
        });

        previewTheme = inheritance.theme;
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`[StorefrontEngine] Preview inheritance error:`, error);
      }
    }
  }

  const vars = this.transform(previewTheme, context);
  const varsResult = this.generateCSSVars(vars);

  return `${varsResult}\n\n${storefrontCSS}`;
}

  // ============================================================
  // 🧩  دوال داخلية مساعدة
  // ============================================================

  private generateCSSVars(vars: Record<string, string>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(vars)) {
      const formattedKey = key.startsWith('--') ? key : `--${key}`;
      lines.push(`  ${formattedKey}: ${value};`);
    }

    return `:root {\n${lines.join('\n')}\n}`;
  }
}

// ============================================================
// 🏭  مصنع المحرك (Factory) & Export
// ============================================================

export function createStorefrontEngine(
  env: ThemeProviderEnv,
  options?: { debug?: boolean }
): StorefrontEngine {
  return new StorefrontEngine(env, options);
}

export async function renderStorefront(
  env: ThemeProviderEnv,
  context: StorefrontContext,
  options?: { debug?: boolean }
): Promise<string> {
  const engine = createStorefrontEngine(env, options);
  return engine.render(context);
}

export async function renderStorefrontWithDetails(
  env: ThemeProviderEnv,
  context: StorefrontContext,
  options?: { debug?: boolean }
): Promise<EngineRenderResult> {
  const engine = createStorefrontEngine(env, options);
  return engine.renderWithDetails(context);
}

export async function previewStorefrontTheme(
  env: ThemeProviderEnv,
  theme: Theme,
  context: StorefrontContext,
  options?: { debug?: boolean }
): Promise<string> {
  const engine = createStorefrontEngine(env, options);
  return engine.previewTheme(theme, context);
}

const storefrontEngineExport = {
  StorefrontEngine,
  createStorefrontEngine,
  renderStorefront,
  renderStorefrontWithDetails,
  previewStorefrontTheme,
};

export default storefrontEngineExport;