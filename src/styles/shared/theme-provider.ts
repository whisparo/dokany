/* src/styles/shared/theme-provider.ts */
// ============================================================
// 📄  المسار: src/styles/shared/theme-provider.ts
// 📦  الوظيفة: جلب الثيم من D1/KV مع آلية إبطال الكاش
// 🔒  المبدأ: Edge KV للقراءة السريعة (0ms) + D1 كمصدر أساسي
// ============================================================

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Theme } from '../types';
import { parseTheme } from './validators/theme.schema';
import { resolveTheme, type InheritanceResult } from './theme-inheritance';

// ============================================================
// 🎨 الثيم الافتراضي كـ Fallback لحماية المحرك من الانهيار
// ============================================================
const DEFAULT_FALLBACK_THEME: Theme = {
  id: 'default',
  name: 'Default Storefront Theme',
  version: '1.0.0',
  slug: 'default',
  updatedAt: Date.now(),
  colors: {
    primary: { main: '#6366f1', light: '#818cf8', dark: '#4f46e5', contrastText: '#ffffff' },
    secondary: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed', contrastText: '#ffffff' },
    success: { main: '#10b981', light: '#34d399', dark: '#059669', contrastText: '#ffffff' },
    warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706', contrastText: '#ffffff' },
    danger: { main: '#ef4444', light: '#f87171', dark: '#dc2626', contrastText: '#ffffff' },
    info: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8', contrastText: '#ffffff' },
    background: { default: '#ffffff', paper: '#f8fafc', elevated: '#ffffff' },
    text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af', hint: '#9ca3af' },
    border: { subtle: '#e5e7eb', strong: '#d1d5db', glow: '#6366f1' },
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
    fontFamilyArabic: 'Cairo, sans-serif',
    fontSize: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
    fontWeight: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.75 },
  },
  spacing: { unit: 4, xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px', '3xl': '64px', '4xl': '80px' },
  radius: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '24px', full: '9999px' },
  shadows: { xs: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none', '2xl': 'none', glow: 'none' },
  motion: { fast: '150ms', base: '200ms', slow: '300ms', extraSlow: '500ms' },
  button: { borderRadius: '8px', padding: { small: '8px', medium: '12px', large: '16px' } },
  card: { borderRadius: '12px', shadow: '0 4px 6px rgba(0,0,0,0.07)', padding: '24px' },
  layout: { maxWidth: '1280px', containerPadding: '16px', headerHeight: '64px', footerHeight: '80px', sidebarWidth: '280px' },
};

// ============================================================
// 📦  الأنواع
// ============================================================

export interface ThemeProviderEnv {
  DB: D1Database;
  THEME_KV?: KVNamespace;
}

export interface ThemeProviderOptions {
  cacheTTL?: number;
  maxInheritanceDepth?: number;
  validateBeforeSave?: boolean;
  debug?: boolean;
}

export interface ThemeFetchResult {
  theme: Theme | null;
  source: 'kv' | 'd1' | 'fallback' | 'none';
  cached: boolean;
  latencyMs: number;
  version: number;
  inheritance?: InheritanceResult;
}

export interface ThemeSaveResult {
  success: boolean;
  themeId: string;
  savedToD1: boolean;
  savedToKV: boolean;
  cacheInvalidated: boolean;
}

// ============================================================
// 🚀  مزود الثيم الرئيسي
// ============================================================

export class ThemeProvider {
  private readonly env: ThemeProviderEnv;
  private readonly options: Required<ThemeProviderOptions>;

  constructor(env: ThemeProviderEnv, options: ThemeProviderOptions = {}) {
    this.env = env;
    this.options = {
      cacheTTL: options.cacheTTL ?? 3600,
      maxInheritanceDepth: options.maxInheritanceDepth ?? 10,
      validateBeforeSave: options.validateBeforeSave ?? true,
      debug: options.debug ?? false,
    };
  }

  // ============================================================
  // 📖  عمليات القراءة (Read Operations)
  // ============================================================

  async getTheme(themeId: string): Promise<ThemeFetchResult> {
    const start = performance.now();

    const kvResult = await this.getFromKV(themeId);
    if (kvResult) {
      return {
        theme: kvResult,
        source: 'kv',
        cached: true,
        latencyMs: performance.now() - start,
        version: kvResult.updatedAt,
      };
    }

    const d1Result = await this.getFromD1(themeId);
    if (d1Result) {
      this.warmCache(themeId, d1Result).catch(() => {});

      const resolved = await this.resolveWithInheritance(d1Result);

      return {
        theme: resolved.theme,
        source: 'd1',
        cached: false,
        latencyMs: performance.now() - start,
        version: d1Result.updatedAt,
        inheritance: resolved,
      };
    }

    // 🎯 Fallback: إذا تعذر العثور على الثيم المطلوبة وكان اسمها 'default' أو لم يتم العثور عليها بالـ D1
    if (themeId === 'default' || !themeId) {
      return {
        theme: DEFAULT_FALLBACK_THEME,
        source: 'fallback',
        cached: false,
        latencyMs: performance.now() - start,
        version: DEFAULT_FALLBACK_THEME.updatedAt,
      };
    }

    return {
      theme: null,
      source: 'none',
      cached: false,
      latencyMs: performance.now() - start,
      version: 0,
    };
  }

  async getThemeBySlug(slug: string): Promise<ThemeFetchResult> {
    const theme = await this.getBySlugFromD1(slug);
    if (!theme) {
      if (slug === 'default') {
        return {
          theme: DEFAULT_FALLBACK_THEME,
          source: 'fallback',
          cached: false,
          latencyMs: 0,
          version: DEFAULT_FALLBACK_THEME.updatedAt,
        };
      }
      return {
        theme: null,
        source: 'none',
        cached: false,
        latencyMs: 0,
        version: 0,
      };
    }

    return this.getTheme(theme.id);
  }

  async getMultipleThemes(themeIds: string[]): Promise<Map<string, Theme | null>> {
    const results = new Map<string, Theme | null>();

    const kvPromises = themeIds.map((id) => this.getFromKV(id));
    const kvResults = await Promise.all(kvPromises);

    const missingIds: string[] = [];

    for (let i = 0; i < themeIds.length; i++) {
      const id = themeIds[i];
      const theme = kvResults[i];
      if (theme) {
        results.set(id, theme);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      const d1Results = await this.getMultipleFromD1(missingIds);

      for (const [id, theme] of d1Results) {
        if (theme) {
          results.set(id, theme);
          this.warmCache(id, theme).catch(() => {});
        } else if (id === 'default') {
          results.set(id, DEFAULT_FALLBACK_THEME);
        } else {
          results.set(id, null);
        }
      }
    }

    return results;
  }

  // ============================================================
  // ✍️  عمليات الكتابة (Write Operations)
  // ============================================================

  async saveTheme(theme: Theme): Promise<ThemeSaveResult> {
    if (this.options.validateBeforeSave) {
      try {
        parseTheme(theme);
      } catch (error) {
        if (this.options.debug) {
          console.error('[ThemeProvider] Validation failed:', error);
        }
        throw new Error(`Invalid theme data: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let savedToD1 = false;
    try {
      await this.saveToD1(theme);
      savedToD1 = true;
    } catch (error) {
      if (this.options.debug) {
        console.error('[ThemeProvider] Failed to save to D1:', error);
      }
      throw error;
    }

    let savedToKV = false;
    let cacheInvalidated = false;

    try {
      await this.warmCache(theme.id, theme);
      savedToKV = true;
    } catch (error) {
      if (this.options.debug) {
        console.warn('[ThemeProvider] Failed to update KV cache:', error);
      }
    }

    try {
      await this.invalidateCache(theme.id);
      cacheInvalidated = true;
    } catch (error) {
      if (this.options.debug) {
        console.warn('[ThemeProvider] Failed to invalidate cache:', error);
      }
    }

    return {
      success: savedToD1,
      themeId: theme.id,
      savedToD1,
      savedToKV,
      cacheInvalidated,
    };
  }

  async updateTheme(themeId: string, updates: Partial<Theme>): Promise<ThemeSaveResult> {
    const current = await this.getTheme(themeId);
    if (!current.theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const updatedTheme: Theme = {
      ...current.theme,
      ...updates,
      updatedAt: Date.now(),
    };

    return this.saveTheme(updatedTheme);
  }

  // ============================================================
  // 🗑️  إدارة الكاش (Cache Management)
  // ============================================================

  async invalidateCache(themeId: string): Promise<void> {
    if (!this.env.THEME_KV) return;

    try {
      const key = this.getKVKey(themeId);
      await this.env.THEME_KV.delete(key);

      if (this.options.debug) {
        console.log(`[ThemeProvider] Cache invalidated for ${themeId}`);
      }
    } catch (error) {
      if (this.options.debug) {
        console.warn(`[ThemeProvider] Failed to invalidate cache for ${themeId}:`, error);
      }
      throw error;
    }
  }

  async warmCache(themeId: string, theme: Theme): Promise<void> {
    if (!this.env.THEME_KV) return;

    try {
      const key = this.getKVKey(themeId);
      const value = JSON.stringify(theme);
      await this.env.THEME_KV.put(key, value, {
        expirationTtl: this.options.cacheTTL,
      });

      if (this.options.debug) {
        console.log(`[ThemeProvider] Cache warmed for ${themeId}`);
      }
    } catch (error) {
      if (this.options.debug) {
        console.warn(`[ThemeProvider] Failed to warm cache for ${themeId}:`, error);
      }
    }
  }

  async isCacheValid(themeId: string, cachedVersion: number): Promise<boolean> {
    try {
      const current = await this.getFromD1(themeId);
      if (!current) return false;
      return current.updatedAt <= cachedVersion;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 🧩  دوال داخلية (Private Methods)
  // ============================================================

  private getKVKey(themeId: string): string {
    return `theme:${themeId}`;
  }

  private async resolveWithInheritance(theme: Theme): Promise<InheritanceResult> {
    const getParent = (_id: string): Theme | null => {
      return null;
    };

    return resolveTheme(theme, getParent, {
      maxDepth: this.options.maxInheritanceDepth,
      debug: this.options.debug,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 📦  عمليات D1 (المصدر الأساسي)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 🎯 تحسين الاستعلام للبحث بالـ ID أو الـ Slug معاً
   */
  private async getFromD1(themeId: string): Promise<Theme | null> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT * FROM store_themes WHERE id = ? OR slug = ?`
      ).bind(themeId, themeId).first();

      if (!result) return null;
      return this.parseDBRow(result as Record<string, unknown>);
    } catch (error) {
      if (this.options.debug) {
        console.error('[ThemeProvider] D1 read error:', error);
      }
      return null;
    }
  }

  private async getBySlugFromD1(slug: string): Promise<Theme | null> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT * FROM store_themes WHERE slug = ? OR id = ?`
      ).bind(slug, slug).first();

      if (!result) return null;
      return this.parseDBRow(result as Record<string, unknown>);
    } catch (error) {
      if (this.options.debug) {
        console.error('[ThemeProvider] D1 read by slug error:', error);
      }
      return null;
    }
  }

  private async getMultipleFromD1(themeIds: string[]): Promise<Map<string, Theme | null>> {
    const results = new Map<string, Theme | null>();

    if (themeIds.length === 0) return results;

    try {
      const placeholders = themeIds.map(() => '?').join(',');
      const rows = await this.env.DB.prepare(
        `SELECT * FROM store_themes WHERE id IN (${placeholders}) OR slug IN (${placeholders})`
      ).bind(...themeIds, ...themeIds).all();

      for (const row of rows.results) {
        const theme = this.parseDBRow(row as Record<string, unknown>);
        if (theme) {
          results.set(theme.id, theme);
          if (theme.slug) results.set(theme.slug, theme);
        }
      }

      for (const id of themeIds) {
        if (!results.has(id)) {
          results.set(id, null);
        }
      }
    } catch (error) {
      if (this.options.debug) {
        console.error('[ThemeProvider] D1 batch read error:', error);
      }
      for (const id of themeIds) {
        results.set(id, null);
      }
    }

    return results;
  }

  private async saveToD1(theme: Theme): Promise<void> {
    const jsonData = JSON.stringify(theme);

    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO store_themes 
       (id, slug, name, version, data, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      theme.id,
      theme.slug,
      theme.name,
      theme.version,
      jsonData,
      theme.updatedAt
    ).run();

    if (this.options.debug) {
      console.log(`[ThemeProvider] Theme saved to D1: ${theme.id}`);
    }
  }

  private parseDBRow(row: Record<string, unknown>): Theme | null {
    try {
      if (row.data && typeof row.data === 'string') {
        const parsed = JSON.parse(row.data);
        return parseTheme(parsed);
      }

      const theme: Theme = {
        id: String(row.id),
        name: String(row.name || ''),
        version: String(row.version || '1.0.0'),
        slug: String(row.slug || ''),
        updatedAt: Number(row.updated_at || Date.now()),
        colors: {
          primary: { main: '#6366f1', light: '#818cf8', dark: '#4f46e5', contrastText: '#ffffff' },
          secondary: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed', contrastText: '#ffffff' },
          success: { main: '#10b981', light: '#34d399', dark: '#059669', contrastText: '#ffffff' },
          warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706', contrastText: '#ffffff' },
          danger: { main: '#ef4444', light: '#f87171', dark: '#dc2626', contrastText: '#ffffff' },
          info: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8', contrastText: '#ffffff' },
          background: { default: '#ffffff', paper: '#f8fafc', elevated: '#ffffff' },
          text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af', hint: '#9ca3af' },
          border: { subtle: '#e5e7eb', strong: '#d1d5db', glow: '#6366f1' },
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          fontFamilyArabic: 'Cairo, sans-serif',
          fontSize: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
          fontWeight: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
          lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.75 },
        },
        spacing: { unit: 4, xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px', '3xl': '64px', '4xl': '80px' },
        radius: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '24px', full: '9999px' },
        shadows: { xs: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none', '2xl': 'none', glow: 'none' },
        motion: { fast: '150ms', base: '200ms', slow: '300ms', extraSlow: '500ms' },
        button: { borderRadius: '8px', padding: { small: '8px', medium: '12px', large: '16px' } },
        card: { borderRadius: '12px', shadow: '0 4px 6px rgba(0,0,0,0.07)', padding: '24px' },
        layout: { maxWidth: '1280px', containerPadding: '16px', headerHeight: '64px', footerHeight: '80px', sidebarWidth: '280px' },
        ...(row.extends ? { extends: String(row.extends) } : {}),
      };

      return parseTheme(theme);
    } catch (error) {
      if (this.options.debug) {
        console.error('[ThemeProvider] Failed to parse theme row:', error);
      }
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📦  عمليات KV (طبقة الكاش)
  // ═══════════════════════════════════════════════════════════════

  private async getFromKV(themeId: string): Promise<Theme | null> {
    if (!this.env.THEME_KV) return null;

    try {
      const key = this.getKVKey(themeId);
      const value = await this.env.THEME_KV.get(key);

      if (!value) return null;

      const theme = JSON.parse(value) as Theme;
      return parseTheme(theme);
    } catch (error) {
      if (this.options.debug) {
        console.warn('[ThemeProvider] KV read error:', error);
      }
      return null;
    }
  }
}

// ============================================================
// 🏭  المصنع (Factory)
// ============================================================

export function createThemeProvider(
  env: ThemeProviderEnv,
  options: ThemeProviderOptions = {}
): ThemeProvider {
  return new ThemeProvider(env, options);
}

// ============================================================
// 🛠️  دوال مساعدة للاستخدام السريع
// ============================================================

export async function getTheme(
  env: ThemeProviderEnv,
  themeId: string,
  options?: ThemeProviderOptions
): Promise<Theme | null> {
  const provider = createThemeProvider(env, options);
  const result = await provider.getTheme(themeId);
  return result.theme;
}

export async function getThemeBySlug(
  env: ThemeProviderEnv,
  slug: string,
  options?: ThemeProviderOptions
): Promise<Theme | null> {
  const provider = createThemeProvider(env, options);
  const result = await provider.getThemeBySlug(slug);
  return result.theme;
}

export async function saveTheme(
  env: ThemeProviderEnv,
  theme: Theme,
  options?: ThemeProviderOptions
): Promise<ThemeSaveResult> {
  const provider = createThemeProvider(env, options);
  return provider.saveTheme(theme);
}

export async function invalidateThemeCache(
  env: ThemeProviderEnv,
  themeId: string
): Promise<void> {
  const provider = createThemeProvider(env);
  await provider.invalidateCache(themeId);
}

const providerExport = {
  ThemeProvider,
  createThemeProvider,
  getTheme,
  getThemeBySlug,
  saveTheme,
  invalidateThemeCache,
};

export default providerExport;