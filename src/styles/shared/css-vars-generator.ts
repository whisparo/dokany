/* src/styles/shared/css-vars-generator.ts */
// ============================================================
// 📄  المسار: src/styles/shared/css-vars-generator.ts
// ⚙️  الوظيفة: تحويل كائن Theme إلى CSS Variables String (Pure Function)
// 🔒  المبدأ: دالة نقية (Pure Function) - لا تعتمد على أي شيء خارجي
// ============================================================

// ============================================================
// 📦  الأنواع
// ============================================================

/**
 * خيارات توليد CSS Variables
 */
export interface CSSVarsOptions {
  /** بادئة للمتغيرات (مثل: 'store' → --store-primary-main) */
  prefix?: string;
  /** الفاصل بين أجزاء المسار (افتراضي: '-') */
  separator?: string;
  /** استبعاد مفاتيح معينة (لا تُولَّد لها متغيرات) */
  excludeKeys?: string[];
  /** تنسيق القيم قبل التحويل (مثلاً: تحويل الأرقام إلى px) */
  formatValue?: (value: unknown, path: string[]) => string;
  /** إضافة تعليقات للمسار (للمساعدة في التوثيق) */
  includeComments?: boolean;
}

/**
 * نتيجة توليد CSS Variables
 */
export interface CSSVarsResult {
  /** النص الكامل لـ CSS Variables */
  css: string;
  /** عدد المتغيرات المُولَّدة */
  count: number;
  /** قائمة المتغيرات المُولَّدة (للتسهيل) */
  variables: string[];
  /** خريطة المتغيرات (المفتاح → القيمة) */
  map: Record<string, string>;
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
 * تحويل القيمة إلى نص مناسب لـ CSS
 */
function defaultFormatValue(value: unknown, path: string[]): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    const pathStr = path.join('-').toLowerCase();
    if (
      pathStr.includes('spacing') ||
      pathStr.includes('unit') ||
      pathStr.includes('radius') ||
      pathStr.includes('size') ||
      pathStr.includes('width') ||
      pathStr.includes('height') ||
      pathStr.includes('padding') ||
      pathStr.includes('margin')
    ) {
      return `${value}px`;
    }
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(', ');
  }

  return String(value);
}

/**
 * دمج المسار إلى مفتاح CSS Variable
 */
function joinPath(parts: string[], prefix?: string, separator: string = '-'): string {
  const fullPath = parts.join(separator);
  return prefix ? `${prefix}${separator}${fullPath}` : fullPath;
}

/**
 * التحقق مما إذا كان المفتاح مستبعداً
 */
function isExcluded(key: string, excludeKeys?: string[]): boolean {
  if (!excludeKeys || excludeKeys.length === 0) return false;
  return excludeKeys.includes(key);
}

// ============================================================
// 🚀  الدالة الرئيسية (The Pure Generator)
// ============================================================

/**
 * 🌟  توليد CSS Variables من كائن Theme
 */
export function generateCSSVariables(
  theme: Record<string, unknown>,
  options: CSSVarsOptions = {}
): CSSVarsResult {
  const {
    prefix,
    separator = '-',
    excludeKeys = ['id', 'name', 'version', 'slug', 'extends', 'overrides', 'updatedAt', 'custom'],
    formatValue = defaultFormatValue,
    includeComments = false,
  } = options;

  const variables: string[] = [];
  const map: Record<string, string> = {};
  let count = 0;

  function traverse(
    obj: Record<string, unknown>,
    path: string[] = []
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (isExcluded(key, excludeKeys)) {
        continue;
      }

      const currentPath = [...path, key];

      if (isObject(value)) {
        traverse(value as Record<string, unknown>, currentPath);
      } else {
        const varName = joinPath(currentPath, prefix, separator);
        const formattedValue = formatValue(value, currentPath);
        const comment = includeComments ? ` /* ${currentPath.join(' → ')} */` : '';

        variables.push(`  --${varName}: ${formattedValue};${comment}`);
        map[varName] = formattedValue;
        count++;
      }
    }
  }

  traverse(theme);

  const css = variables.length > 0
    ? `:root {\n${variables.join('\n')}\n}`
    : '';

  return {
    css,
    count,
    variables,
    map,
  };
}

// ============================================================
// 🚀  دوال مساعدة للاستخدام السريع
// ============================================================

export function generateWithPrefix(
  theme: Record<string, unknown>,
  prefix: string,
  options: Omit<CSSVarsOptions, 'prefix'> = {}
): CSSVarsResult {
  return generateCSSVariables(theme, { ...options, prefix });
}

export function generateCSSString(
  theme: Record<string, unknown>,
  options: CSSVarsOptions = {}
): string {
  return generateCSSVariables(theme, options).css;
}

export function generateCSSMap(
  theme: Record<string, unknown>,
  options: CSSVarsOptions = {}
): Record<string, string> {
  return generateCSSVariables(theme, options).map;
}

export function createVar(varName: string): string {
  return `var(--${varName})`;
}

export function createVarWithFallback(varName: string, fallback: string): string {
  return `var(--${varName}, ${fallback})`;
}

// ============================================================
// 📦  تصدير عام
// ============================================================

const generatorExport = {
  generateCSSVariables,
  generateWithPrefix,
  generateCSSString,
  generateCSSMap,
  createVar,
  createVarWithFallback,
};

export default generatorExport;