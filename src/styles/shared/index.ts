// ============================================================
// 📄  المسار: styles/shared/index.ts
// 🚪  الوظيفة: البوابة الموحدة (Shared Gate)
// ============================================================

// 1️⃣  مخططات التحقق (تصدير مباشر لكل المخططات لمنع خطأ المسارات)
export * from './validators/color.schema';
export * from './validators/theme.schema';

// 2️⃣  مولد CSS Variables
export {
  generateCSSVariables,
  generateWithPrefix,
  generateCSSString,
  generateCSSMap,
  createVar,
  createVarWithFallback,
  type CSSVarsOptions,
  type CSSVarsResult,
} from './css-vars-generator';

// 3️⃣  محرك التوريث (Theme Inheritance)
export {
  resolveTheme,
  mergeThemes,
  hasCircularInheritance,
  getInheritanceChainString,
  validateInheritanceChain,
  deepMerge,
  type InheritanceOptions,
  type InheritanceResult,
} from './theme-inheritance';

// 4️⃣  مزود الثيم (Theme Provider)
export {
  ThemeProvider,
  createThemeProvider,
  getTheme,
  getThemeBySlug,
  saveTheme,
  invalidateThemeCache,
  type ThemeProviderEnv,
  type ThemeProviderOptions,
  type ThemeFetchResult,
  type ThemeSaveResult,
} from './theme-provider';

// 5️⃣  الكلاس الأساسي للمحركات (Base Domain Engine)
export {
  BaseDomainEngine,
  createBaseEngine,
  type BaseEngineOptions,
  type EngineRenderResult,
  type AnyContext,
} from './base-domain-engine';

// ============================================================
// 📦  كائن موحد للاستخدام السريع
// ============================================================

import * as colorValidators from './validators/color.schema';
import * as themeValidators from './validators/theme.schema';
import * as cssVarsGenerator from './css-vars-generator';
import * as themeInheritance from './theme-inheritance';
import * as themeProvider from './theme-provider';
import * as baseDomainEngine from './base-domain-engine';

export const Shared = {
  ...colorValidators,
  ...themeValidators,
  ...cssVarsGenerator,
  ...themeInheritance,
  ...themeProvider,
  ...baseDomainEngine,
};

export default Shared;