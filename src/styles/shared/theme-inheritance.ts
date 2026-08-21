/* src/styles/shared/theme-inheritance.ts */
// ============================================================
// 📄  المسار: src/styles/shared/theme-inheritance.ts
// 🔄  الوظيفة: محرك توريث الثيمات (Deep Merge + Circular Protection)
// 🔒  المبدأ: دمج عميق مع حماية ضد التوريث الدائري
// ============================================================

import type { Theme, DeepPartial } from '../types';

// ============================================================
// 📦  الأنواع
// ============================================================

/**
 * خيارات محرك التوريث
 */
export interface InheritanceOptions {
  /** أقصى عمق مسموح للتوريث (افتراضي: 10) */
  maxDepth?: number;
  /** هل يجب تسجيل عملية الدمج في السجلات؟ */
  debug?: boolean;
}

/**
 * نتيجة عملية الدمج
 */
export interface InheritanceResult {
  /** الثيم المدمج النهائي */
  theme: Theme;
  /** سلسلة التوريث المستخدمة (من الأقدم إلى الأحدث) */
  chain: string[];
  /** عدد المستويات المدمجة */
  depth: number;
  /** هل تم تطبيق أي overrides؟ */
  hasOverrides: boolean;
}

// ============================================================
// 🛠️  الدوال المساعدة (Pure Helpers)
// ============================================================

/**
 * التحقق مما إذا كانت القيمة كائناً (مع استثناء null و arrays)
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * التحقق مما إذا كان الكائن فارغاً
 */
function isEmptyObject(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * دمج عميق (Deep Merge) مرن للكائنات مع مراعاة Type Safety
 */
export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T> | Record<string, unknown>
): T {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;

    const targetValue = (result as Record<string, unknown>)[key];

    if (isObject(value) && isObject(targetValue)) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue,
        value
      );
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * بناء سلسلة التوريث (للاستخدام في التصحيح والتحقق)
 */
function buildInheritanceChain(
  theme: Theme,
  getParent: (id: string) => Theme | null,
  visited: Set<string> = new Set()
): string[] {
  const chain: string[] = [theme.id];
  let current: Theme | null = theme;

  while (current?.extends) {
    if (visited.has(current.extends)) {
      break;
    }
    visited.add(current.extends);
    const parent = getParent(current.extends);
    if (!parent) break;
    chain.push(parent.id);
    current = parent;
  }

  return chain;
}

// ============================================================
// 🚀  محرك التوريث الرئيسي
// ============================================================

/**
 * 🌟  حلّ الثيم (تطبيق التوريث بالكامل)
 */
export function resolveTheme(
  theme: Theme,
  getParent: (id: string) => Theme | null,
  options: InheritanceOptions = {}
): InheritanceResult {
  const { maxDepth = 10, debug = false } = options;

  // 1️⃣  التحقق من وجود توريث
  if (!theme.extends) {
    return {
      theme: { ...theme },
      chain: [theme.id],
      depth: 0,
      hasOverrides: false,
    };
  }

  // 2️⃣  بناء سلسلة التوريث
  const visited = new Set<string>([theme.id]);
  const chain: Theme[] = [theme];
  let current: Theme | null = theme;

  while (current?.extends) {
    if (chain.length - 1 >= maxDepth) {
      if (debug) {
        console.warn(
          `[ThemeInheritance] Max depth (${maxDepth}) exceeded for theme ${theme.id}.`
        );
      }
      break;
    }

    if (visited.has(current.extends)) {
      throw new Error(
        `Circular inheritance detected for theme ${theme.id}: ` +
        `${[...visited, current.extends].join(' → ')}`
      );
    }

    const parent = getParent(current.extends);
    if (!parent) {
      if (debug) {
        console.warn(
          `[ThemeInheritance] Parent theme ${current.extends} not found for ${theme.id}.`
        );
      }
      break;
    }

    visited.add(parent.id);
    chain.push(parent);
    current = parent;
  }

  // 3️⃣  دمج الثيمات من الأقدم إلى الأحدث
  let merged: Theme = { ...chain[chain.length - 1] };

  for (let i = chain.length - 2; i >= 0; i--) {
    const child = chain[i];
    const overrides = child.overrides;

    // الدمج المباشر بدون إزالة الخواص بالـ Destructuring عشان نحافظ على الـ Type
    merged = deepMerge(merged, child);

    if (overrides && !isEmptyObject(overrides as Record<string, unknown>)) {
      merged = deepMerge(merged, overrides as Record<string, unknown>);
    }
  }

  // 4️⃣  إزالة حقول التوريث المؤقتة من النتيجة النهائية
  delete merged.extends;
  delete merged.overrides;

  // 5️⃣  بناء النتيجة
  const chainIds = chain.map((t) => t.id);
  const hasOverrides = chain.some((t) => t.overrides && !isEmptyObject(t.overrides as Record<string, unknown>));

  return {
    theme: merged,
    chain: chainIds,
    depth: chain.length - 1,
    hasOverrides,
  };
}

// ============================================================
// 🛠️  دوال مساعدة للاستخدام السريع
// ============================================================

export function mergeThemes(
  base: Theme,
  overrides: DeepPartial<Theme>
): Theme {
  const merged = deepMerge({ ...base }, overrides);

  delete merged.extends;
  delete merged.overrides;

  return {
    ...merged,
    id: base.id,
    name: base.name,
    version: base.version,
    slug: base.slug,
    updatedAt: base.updatedAt,
  };
}

export function hasCircularInheritance(
  themeId: string,
  parentId: string,
  getParent: (id: string) => Theme | null
): boolean {
  const visited = new Set<string>();
  let current = getParent(parentId);

  while (current) {
    if (current.id === themeId) {
      return true;
    }
    if (visited.has(current.id)) {
      return true;
    }
    visited.add(current.id);
    current = current.extends ? getParent(current.extends) : null;
  }

  return false;
}

export function getInheritanceChainString(
  theme: Theme,
  getParent: (id: string) => Theme | null
): string {
  const chain = buildInheritanceChain(theme, getParent);
  return chain.join(' → ');
}

export function validateInheritanceChain(
  theme: Theme,
  getParent: (id: string) => Theme | null,
  maxDepth: number = 10
): {
  valid: boolean;
  chain: string[];
  error?: string;
} {
  try {
    const result = resolveTheme(theme, getParent, { maxDepth, debug: false });
    return {
      valid: true,
      chain: result.chain,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      chain: [],
      error: errorMessage,
    };
  }
}

// ============================================================
// 📦  تصدير عام
// ============================================================

const inheritanceExport = {
  resolveTheme,
  mergeThemes,
  hasCircularInheritance,
  getInheritanceChainString,
  validateInheritanceChain,
  deepMerge,
};

export default inheritanceExport;