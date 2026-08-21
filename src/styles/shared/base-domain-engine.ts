/* styles/shared/base-domain-engine.ts */
// ============================================================
// 📄  المسار: styles/shared/base-domain-engine.ts
// 🎼  الوظيفة: الكلاس الأساسي لجميع محركات البيئات (Domain Engines)
// 🔒  المبدأ: فصل المشترك عن الخاص - كل Domain يرث هذا الكلاس ويضيف خاصيته
// ============================================================

import type {
  Theme,
  DomainEngine,
  StorefrontContext,
  BuilderContext,
  AdminContext,
  MiniAppContext,
} from '../types';

import { ThemeProvider, type ThemeProviderEnv } from './theme-provider';
import { generateCSSVariables, type CSSVarsOptions } from './css-vars-generator';
import { resolveTheme, type InheritanceResult } from './theme-inheritance';

// ============================================================
// 📦  الأنواع
// ============================================================

/**
 * سياق موحد لجميع البيئات (نستخدم Union Type)
 * يسمح للمحرك باستقبال أي نوع من السياق
 */
export type AnyContext =
  | StorefrontContext
  | BuilderContext
  | AdminContext
  | MiniAppContext
  | Record<string, unknown>;

/**
 * خيارات المحرك الأساسي
 */
export interface BaseEngineOptions {
  /** اسم المحرك (للتصحيح) */
  name: string;
  /** إصدار المحرك */
  version?: string;
  /** إعدادات CSS Variables */
  cssVarsOptions?: CSSVarsOptions;
  /** إعدادات التوريث */
  inheritanceOptions?: {
    maxDepth?: number;
  };
  /** هل يتم تسجيل العمليات؟ */
  debug?: boolean;
}

/**
 * نتيجة توليد CSS من المحرك
 */
export interface EngineRenderResult {
  /** نص CSS الكامل للحقن */
  css: string;
  /** الثيم المستخدم */
  theme: Theme;
  /** نتيجة التوريث (إن وجد) */
  inheritance?: InheritanceResult;
  /** المتغيرات المُولَّدة */
  variables: Record<string, string>;
  /** زمن المعالجة بالمللي ثانية */
  durationMs: number;
}

// ============================================================
// 🎼  الكلاس الأساسي (Abstract Base Class)
// ============================================================

export abstract class BaseDomainEngine<
  T extends Theme = Theme,
  C extends AnyContext = AnyContext,
> implements DomainEngine<T, C>
{
  public readonly name: string;
  public readonly version: string;
  protected readonly debug: boolean;

  protected themeProvider: ThemeProvider;
  protected cssVarsOptions: CSSVarsOptions;
  protected inheritanceOptions: { maxDepth: number };

  constructor(env: ThemeProviderEnv, options: BaseEngineOptions) {
    this.name = options.name;
    this.version = options.version ?? '1.0.0';
    this.debug = options.debug ?? false;

    this.themeProvider = new ThemeProvider(env, {
      cacheTTL: 3600,
      maxInheritanceDepth: options.inheritanceOptions?.maxDepth ?? 10,
      debug: this.debug,
    });

    this.cssVarsOptions = options.cssVarsOptions ?? {
      separator: '-',
      includeComments: this.debug,
    };

    this.inheritanceOptions = {
      maxDepth: options.inheritanceOptions?.maxDepth ?? 10,
    };
  }

  // ============================================================
  // 📖  الطرق العامة
  // ============================================================

  async getTheme(context: C): Promise<T> {
    const start = performance.now();

    const themeId = this.extractThemeId(context);

    if (!themeId) {
      throw new Error(`[${this.name}] Unable to extract theme ID from context`);
    }

    const result = await this.themeProvider.getTheme(themeId);

    if (!result.theme) {
      throw new Error(`[${this.name}] Theme not found: ${themeId}`);
    }

    if (this.debug) {
      const duration = performance.now() - start;
      console.log(
        `[${this.name}] Theme fetched: ${result.theme.id} ` +
        `(source: ${result.source}, latency: ${Math.round(duration)}ms)`
      );
    }

    return result.theme as T;
  }

  abstract transform(theme: T, context: C): Record<string, string>;

  async render(context: C): Promise<string> {
    const result = await this.renderWithDetails(context);
    return result.css;
  }

  async updateTheme(identifier: string, newTheme: Partial<T>): Promise<void> {
    const current = await this.themeProvider.getTheme(identifier);
    if (!current.theme) {
      throw new Error(`[${this.name}] Theme not found: ${identifier}`);
    }

    const updatedTheme: Theme = {
      ...current.theme,
      ...(newTheme as Partial<Theme>),
      updatedAt: Date.now(),
    };

    await this.themeProvider.saveTheme(updatedTheme);

    if (this.debug) {
      console.log(`[${this.name}] Theme updated: ${identifier}`);
    }
  }

  // ============================================================
  // 🚀  دوال إضافية
  // ============================================================

  async renderWithDetails(context: C): Promise<EngineRenderResult> {
    const start = performance.now();

    const theme = await this.getTheme(context);

    let inheritance: InheritanceResult | undefined;
    if (theme.extends) {
      try {
        // تجهيز كاش مؤقت لآباء الثيمات لحل مشكلة الـ Sync/Async في resolveTheme
        const themeMap = new Map<string, Theme>();
        themeMap.set(theme.id, theme);

        let currentId: string | undefined = theme.extends;
        let depth = 0;

        while (currentId && depth < this.inheritanceOptions.maxDepth) {
          const parentResult = await this.themeProvider.getTheme(currentId);
          if (!parentResult.theme) break;
          themeMap.set(parentResult.theme.id, parentResult.theme);
          currentId = parentResult.theme.extends;
          depth++;
        }

        const getParentSync = (id: string): Theme | null => {
          return themeMap.get(id) ?? null;
        };

        inheritance = resolveTheme(theme, getParentSync, {
          maxDepth: this.inheritanceOptions.maxDepth,
          debug: this.debug,
        });
      } catch (error) {
        if (this.debug) {
          console.warn(`[${this.name}] Inheritance error:`, error);
        }
      }
    }

    const themeToTransform = inheritance?.theme ?? theme;
    const vars = this.transform(themeToTransform as T, context);

    const varsResult = generateCSSVariables(vars as unknown as Record<string, unknown>, {
      ...this.cssVarsOptions,
      prefix: this.getCSSPrefix(),
    });

    const staticCSS = this.getStaticCSS();
    const css = `${varsResult.css}\n\n${staticCSS}`;

    const durationMs = performance.now() - start;

    if (this.debug) {
      console.log(
        `[${this.name}] CSS generated: ${varsResult.count} variables, ` +
        `${Math.round(durationMs)}ms`
      );
    }

    return {
      css,
      theme: themeToTransform as T,
      inheritance,
      variables: varsResult.map,
      durationMs,
    };
  }

  async getStatus(context: C): Promise<{
    name: string;
    version: string;
    themeId: string;
    hasInheritance: boolean;
    cacheSource: string;
  }> {
    const themeId = this.extractThemeId(context);
    let cacheSource = 'none';

    if (themeId) {
      try {
        const result = await this.themeProvider.getTheme(themeId);
        cacheSource = result.source;
      } catch {
        // تجاهل
      }
    }

    return {
      name: this.name,
      version: this.version,
      themeId: themeId || 'unknown',
      hasInheritance: !!(themeId && (await this.hasInheritance(themeId))),
      cacheSource,
    };
  }

  // ============================================================
  // 🧩  دوال يجب تنفيذها في الفئات الفرعية
  // ============================================================

  protected abstract getStaticCSS(): string;
  protected abstract getCSSPrefix(): string;

  // ============================================================
  // 🧩  دوال مساعدة
  // ============================================================

  /**
   * 🎯 استخراج معرف الثيم الحقيقي من الـ Context
   * الأولوية دائماً لحقل الثيم المباشر لمنع خلط اسم المتجر (storeSlug) باسم الثيم
   */
  protected extractThemeId(context: C): string | undefined {
    const ctx = context as Record<string, unknown>;

    // 1️⃣ البحث عن اسم الثيم الصريح أياً كان مسماه
    if ('theme' in ctx && typeof ctx.theme === 'string' && ctx.theme) {
      return ctx.theme;
    }

    if ('themeId' in ctx && typeof ctx.themeId === 'string' && ctx.themeId) {
      return ctx.themeId;
    }

    // 2️⃣ البحث داخل كائن storeInfo إن وجد
    if (ctx.storeInfo && typeof ctx.storeInfo === 'object') {
      const storeInfo = ctx.storeInfo as Record<string, unknown>;
      if (typeof storeInfo.theme === 'string' && storeInfo.theme) {
        return storeInfo.theme;
      }
    }

    // 3️⃣ كخيار أخير فقط استخدام الـ IDs أو الـ Slugs
    if ('storeId' in ctx && typeof ctx.storeId === 'string' && ctx.storeId) {
      return ctx.storeId;
    }

    if ('storeSlug' in ctx && typeof ctx.storeSlug === 'string' && ctx.storeSlug) {
      return ctx.storeSlug;
    }

    return 'default';
  }

  protected async hasInheritance(themeId: string): Promise<boolean> {
    try {
      const result = await this.themeProvider.getTheme(themeId);
      return !!result.theme?.extends;
    } catch {
      return false;
    }
  }

  protected postProcessVars(
    vars: Record<string, string>,
    _context: C
  ): Record<string, string> {
    return vars;
  }

  protected buildThemeVars(theme: T, context: C): Record<string, string> {
    const vars: Record<string, string> = {};

    const colors = theme.colors;
    if (colors) {
      vars['--colors-primary-main'] = colors.primary.main;
      vars['--colors-primary-light'] = colors.primary.light;
      vars['--colors-primary-dark'] = colors.primary.dark;
      vars['--colors-primary-contrast'] = colors.primary.contrastText;

      vars['--colors-secondary-main'] = colors.secondary.main;
      vars['--colors-secondary-light'] = colors.secondary.light;
      vars['--colors-secondary-dark'] = colors.secondary.dark;
      vars['--colors-secondary-contrast'] = colors.secondary.contrastText;

      vars['--colors-success-main'] = colors.success.main;
      vars['--colors-warning-main'] = colors.warning.main;
      vars['--colors-danger-main'] = colors.danger.main;

      vars['--colors-background-default'] = colors.background.default;
      vars['--colors-background-paper'] = colors.background.paper;
      vars['--colors-background-elevated'] = colors.background.elevated;

      vars['--colors-text-primary'] = colors.text.primary;
      vars['--colors-text-secondary'] = colors.text.secondary;
      vars['--colors-text-disabled'] = colors.text.disabled;
      vars['--colors-text-hint'] = colors.text.hint;

      vars['--colors-border-subtle'] = colors.border.subtle;
      vars['--colors-border-strong'] = colors.border.strong;
      vars['--colors-border-glow'] = colors.border.glow;
    }

    const typography = theme.typography;
    if (typography) {
      vars['--typography-font-family'] = typography.fontFamily;
      vars['--typography-font-family-arabic'] = typography.fontFamilyArabic;

      vars['--typography-font-size-xs'] = typography.fontSize.xs;
      vars['--typography-font-size-sm'] = typography.fontSize.sm;
      vars['--typography-font-size-md'] = typography.fontSize.md;
      vars['--typography-font-size-lg'] = typography.fontSize.lg;
      vars['--typography-font-size-xl'] = typography.fontSize.xl;
      vars['--typography-font-size-2xl'] = typography.fontSize['2xl'];

      vars['--typography-font-weight-light'] = String(typography.fontWeight.light);
      vars['--typography-font-weight-regular'] = String(typography.fontWeight.regular);
      vars['--typography-font-weight-medium'] = String(typography.fontWeight.medium);
      vars['--typography-font-weight-bold'] = String(typography.fontWeight.bold);

      vars['--typography-line-height-tight'] = String(typography.lineHeight.tight);
      vars['--typography-line-height-normal'] = String(typography.lineHeight.normal);
      vars['--typography-line-height-relaxed'] = String(typography.lineHeight.relaxed);
    }

    const spacing = theme.spacing;
    if (spacing) {
      vars['--spacing-unit'] = `${spacing.unit}px`;
      vars['--spacing-xs'] = spacing.xs;
      vars['--spacing-sm'] = spacing.sm;
      vars['--spacing-md'] = spacing.md;
      vars['--spacing-lg'] = spacing.lg;
      vars['--spacing-xl'] = spacing.xl;
    }

    const radius = theme.radius;
    if (radius) {
      vars['--radius-sm'] = radius.sm;
      vars['--radius-md'] = radius.md;
      vars['--radius-lg'] = radius.lg;
      vars['--radius-xl'] = radius.xl;
      vars['--radius-full'] = radius.full;
    }

    const button = theme.button;
    if (button) {
      vars['--button-border-radius'] = button.borderRadius;
      vars['--button-padding-small'] = button.padding.small;
      vars['--button-padding-medium'] = button.padding.medium;
      vars['--button-padding-large'] = button.padding.large;
    }

    const card = theme.card;
    if (card) {
      vars['--card-border-radius'] = card.borderRadius;
      vars['--card-shadow'] = card.shadow;
      vars['--card-padding'] = card.padding;
    }

    const layout = theme.layout;
    if (layout) {
      vars['--layout-max-width'] = layout.maxWidth;
      vars['--layout-container-padding'] = layout.containerPadding;
      vars['--layout-header-height'] = layout.headerHeight;
      vars['--layout-footer-height'] = layout.footerHeight;
    }

    return this.postProcessVars(vars, context);
  }
}

// ============================================================
// 🛠️  دوال مساعدة للاستخدام السريع
// ============================================================

export function createBaseEngine(
  env: ThemeProviderEnv,
  config: {
    name: string;
    version?: string;
    getStaticCSS: () => string;
    getCSSPrefix: () => string;
    debug?: boolean;
  }
): BaseDomainEngine {
  class CustomEngine extends BaseDomainEngine {
    protected getStaticCSS(): string {
      return config.getStaticCSS();
    }
    protected getCSSPrefix(): string {
      return config.getCSSPrefix();
    }
    transform(theme: Theme, context: AnyContext): Record<string, string> {
      return this.buildThemeVars(theme, context);
    }
  }

  return new CustomEngine(env, {
    name: config.name,
    version: config.version,
    debug: config.debug,
  });
}

// ============================================================
// 📦  تصدير عام
// ============================================================

export default BaseDomainEngine;