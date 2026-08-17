// lib/errors/config/thresholds.ts
// الإصدار: 1.0.1
// الدور: إعدادات عتبات الأداء (Route-based Performance Thresholds)
// المبدأ: تكوين مركزي - قابل للتعديل دون المساس بالمنطق الأساسي

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع (Types)
// ═══════════════════════════════════════════════════════════════

/**
 * عتبات الأداء لمسار معين
 */
export interface RouteThreshold {
  /** المدة بالمللي ثانية - إذا تجاوزها الطلب، يُعتبر "بطيئاً" (يُطلق PERF_001) */
  slowThresholdMs: number;
  /** المدة بالمللي ثانية - إذا تجاوزها الطلب، يُعتبر "حرجاً" (يُطلق PERF_003) */
  criticalThresholdMs: number;
  /** وصف اختياري للمسار */
  description?: string;
  /** مستوى الأهمية (low, normal, high) - يؤثر على شدة التنبيه */
  priority?: 'low' | 'normal' | 'high';
}

/**
 * تكوين عتبات الأداء الكامل
 */
export interface PerformanceThresholdsConfig {
  /** خريطة المسارات إلى عتباتها */
  routes: Record<string, RouteThreshold>;
  /** العتبة الافتراضية (تطبق على أي مسار غير محدد) */
  default: RouteThreshold;
  /** الإصدار (للتتبع) */
  version: string;
}

// ═══════════════════════════════════════════════════════════════
// 📊  العتبات الافتراضية (Default Thresholds)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_THRESHOLDS: PerformanceThresholdsConfig = {
  version: '1.0.1',

  // العتبة الافتراضية (تطبق على أي مسار غير محدد)
  default: {
    slowThresholdMs: 1000,
    criticalThresholdMs: 2000,
    description: 'Default threshold for all routes',
    priority: 'normal',
  },

  routes: {
    // 🏠 الصفحة الرئيسية والتصفح
    '/': {
      slowThresholdMs: 800,
      criticalThresholdMs: 1500,
      description: 'Homepage and browsing',
      priority: 'normal',
    },
    '/api/products': {
      slowThresholdMs: 400,
      criticalThresholdMs: 900,
      description: 'Product listing and search',
      priority: 'high',
    },
    '/api/products/*': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Product detail and variants',
      priority: 'high',
    },
    '/api/categories': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Category listing',
      priority: 'normal',
    },
    '/api/categories/*': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Category detail',
      priority: 'normal',
    },

    // 🛒 السلة والدفع (حرجة)
    '/api/cart': {
      slowThresholdMs: 400,
      criticalThresholdMs: 800,
      description: 'Cart operations',
      priority: 'high',
    },
    '/api/cart/*': {
      slowThresholdMs: 400,
      criticalThresholdMs: 800,
      description: 'Cart item operations',
      priority: 'high',
    },
    '/api/checkout': {
      slowThresholdMs: 2000,
      criticalThresholdMs: 3500,
      description: 'Checkout and order creation (heavy)',
      priority: 'high',
    },
    '/api/checkout/*': {
      slowThresholdMs: 1500,
      criticalThresholdMs: 3000,
      description: 'Checkout sub-operations',
      priority: 'high',
    },

    // 📦 الطلبات (Orders)
    '/api/orders': {
      slowThresholdMs: 500,
      criticalThresholdMs: 1200,
      description: 'Order listing',
      priority: 'normal',
    },
    '/api/orders/*': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Order detail and status',
      priority: 'normal',
    },

    // 🔐 المصادقة (Authentication)
    '/api/auth': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Authentication operations',
      priority: 'high',
    },
    '/api/auth/login': {
      slowThresholdMs: 600,
      criticalThresholdMs: 1500,
      description: 'Login (includes hashing)',
      priority: 'high',
    },
    '/api/auth/register': {
      slowThresholdMs: 600,
      criticalThresholdMs: 1500,
      description: 'Registration (includes hashing)',
      priority: 'high',
    },
    '/api/auth/verify': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Token verification',
      priority: 'high',
    },

    // 💳 المدفوعات (Payments)
    '/api/payments': {
      slowThresholdMs: 1500,
      criticalThresholdMs: 3000,
      description: 'Payment processing (external gateway)',
      priority: 'high',
    },
    '/api/payments/*': {
      slowThresholdMs: 1000,
      criticalThresholdMs: 2500,
      description: 'Payment sub-operations',
      priority: 'high',
    },

    // 🏪 إدارة المتجر (Stores)
    '/api/stores': {
      slowThresholdMs: 500,
      criticalThresholdMs: 1200,
      description: 'Store management operations',
      priority: 'normal',
    },
    '/api/stores/*': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Store detail and settings',
      priority: 'normal',
    },

    // 📷 الميديا (Media)
    '/api/media': {
      slowThresholdMs: 800,
      criticalThresholdMs: 2000,
      description: 'Media upload and processing (heavy)',
      priority: 'low',
    },
    '/api/media/*': {
      slowThresholdMs: 600,
      criticalThresholdMs: 1500,
      description: 'Media operations',
      priority: 'low',
    },

    // 🔍 البحث (Search)
    '/api/search': {
      slowThresholdMs: 300,
      criticalThresholdMs: 800,
      description: 'Search operations',
      priority: 'high',
    },
    '/api/search/*': {
      slowThresholdMs: 300,
      criticalThresholdMs: 800,
      description: 'Search sub-operations',
      priority: 'high',
    },

    // 📊 التحليلات (Analytics)
    '/api/analytics': {
      slowThresholdMs: 1000,
      criticalThresholdMs: 2500,
      description: 'Analytics queries (heavy)',
      priority: 'low',
    },
    '/api/analytics/*': {
      slowThresholdMs: 800,
      criticalThresholdMs: 2000,
      description: 'Analytics sub-operations',
      priority: 'low',
    },

    // 🧪 الصحة والمراقبة (Health)
    '/api/health': {
      slowThresholdMs: 200,
      criticalThresholdMs: 500,
      description: 'Health and readiness checks',
      priority: 'low',
    },
    '/api/health/*': {
      slowThresholdMs: 200,
      criticalThresholdMs: 500,
      description: 'Health sub-operations',
      priority: 'low',
    },
    '/api/ping': {
      slowThresholdMs: 100,
      criticalThresholdMs: 300,
      description: 'Ping endpoint (ultra-light)',
      priority: 'low',
    },

    // 🔄 Webhooks
    '/api/webhooks': {
      slowThresholdMs: 2000,
      criticalThresholdMs: 4000,
      description: 'Webhook endpoints (external)',
      priority: 'low',
    },
    '/api/webhooks/*': {
      slowThresholdMs: 2000,
      criticalThresholdMs: 4000,
      description: 'Webhook sub-operations',
      priority: 'low',
    },

    // 🗄️ التخزين (Storage)
    '/api/storage': {
      slowThresholdMs: 800,
      criticalThresholdMs: 2000,
      description: 'Storage operations (B2)',
      priority: 'normal',
    },
    '/api/storage/*': {
      slowThresholdMs: 600,
      criticalThresholdMs: 1500,
      description: 'Storage sub-operations',
      priority: 'normal',
    },

    // 📨 الإشعارات (Notifications)
    '/api/notifications': {
      slowThresholdMs: 500,
      criticalThresholdMs: 1200,
      description: 'Notification operations (Telegram)',
      priority: 'low',
    },
    '/api/notifications/*': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Notification sub-operations',
      priority: 'low',
    },

    // 🛠️ مسارات المطورين (Admin)
    '/api/admin': {
      slowThresholdMs: 600,
      criticalThresholdMs: 1500,
      description: 'Admin operations',
      priority: 'low',
    },
    '/api/admin/*': {
      slowThresholdMs: 500,
      criticalThresholdMs: 1200,
      description: 'Admin sub-operations',
      priority: 'low',
    },

    // ⚡ WebSocket / SSE
    '/api/sse': {
      slowThresholdMs: 100,
      criticalThresholdMs: 300,
      description: 'SSE connection setup',
      priority: 'low',
    },
    '/api/sse/*': {
      slowThresholdMs: 100,
      criticalThresholdMs: 300,
      description: 'SSE sub-operations',
      priority: 'low',
    },

    // 🧪 التكاملات (Integrations)
    '/api/integrations': {
      slowThresholdMs: 1500,
      criticalThresholdMs: 3000,
      description: 'Integration endpoints (external APIs)',
      priority: 'normal',
    },
    '/api/integrations/*': {
      slowThresholdMs: 1200,
      criticalThresholdMs: 2500,
      description: 'Integration sub-operations',
      priority: 'normal',
    },

    // 🎯 البوت (Telegram Bot)
    '/api/telegram': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Telegram bot endpoints',
      priority: 'low',
    },
    '/api/telegram/*': {
      slowThresholdMs: 400,
      criticalThresholdMs: 1000,
      description: 'Telegram bot sub-operations',
      priority: 'low',
    },

    // 📋 مسارات النظام الداخلية
    '/api/internal': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Internal system endpoints',
      priority: 'normal',
    },
    '/api/internal/*': {
      slowThresholdMs: 300,
      criticalThresholdMs: 700,
      description: 'Internal system sub-operations',
      priority: 'normal',
    },

    // 🚀 المهام الخلفية (Background tasks)
    '/api/background': {
      slowThresholdMs: 2000,
      criticalThresholdMs: 5000,
      description: 'Background task endpoints',
      priority: 'low',
    },
    '/api/background/*': {
      slowThresholdMs: 1500,
      criticalThresholdMs: 4000,
      description: 'Background task sub-operations',
      priority: 'low',
    },

    // 🧪 مسارات الاختبار (Test)
    '/api/test': {
      slowThresholdMs: 200,
      criticalThresholdMs: 500,
      description: 'Test endpoints',
      priority: 'low',
    },
    '/api/test/*': {
      slowThresholdMs: 200,
      criticalThresholdMs: 500,
      description: 'Test sub-operations',
      priority: 'low',
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// 🔍 دوال البحث والاستعلام (Query Helpers)
// ═══════════════════════════════════════════════════════════════

/**
 * تطهير المسارات لمنع مشاكل الشرطة المائلة النهائية Trailing Slashes
 */
export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * الحصول على العتبات المناسبة لمسار معين مع معلومات التفاصيل
 */
export function getThresholdForPathWithInfo(
  rawPath: string,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): {
  threshold: RouteThreshold;
  matchedKey: string;
  isDefault: boolean;
} {
  const path = normalizePath(rawPath);

  // 1️⃣ مطابقة تامة (Exact Match)
  if (path in config.routes) {
    return {
      threshold: config.routes[path],
      matchedKey: path,
      isDefault: false,
    };
  }

  // 2️⃣ مطابقة بادئة آمنة (Strict Prefix Match)
  const matchedKey = Object.keys(config.routes)
    .filter((key) => {
      if (!key.endsWith('/*')) return false;
      const prefix = key.slice(0, -1);
      return path.startsWith(prefix);
    })
    .sort((a, b) => b.length - a.length)[0];

  if (matchedKey) {
    return {
      threshold: config.routes[matchedKey],
      matchedKey,
      isDefault: false,
    };
  }

  // 3️⃣ العتبة الافتراضية
  return {
    threshold: config.default,
    matchedKey: '*',
    isDefault: true,
  };
}

/**
 * الحصول على العتبات المناسبة لمسار معين
 */
export function getThresholdForPath(
  path: string,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): RouteThreshold {
  return getThresholdForPathWithInfo(path, config).threshold;
}

/**
 * الحصول على جميع المسارات التي تطابق بادئة معينة
 */
export function getPathsByPrefix(
  prefix: string,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): string[] {
  return Object.keys(config.routes).filter((key) => key.startsWith(prefix));
}

/**
 * الحصول على جميع المسارات حسب مستوى الأهمية
 */
export function getPathsByPriority(
  priority: 'low' | 'normal' | 'high',
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): string[] {
  return Object.keys(config.routes).filter(
    (key) => config.routes[key].priority === priority
  );
}

/**
 * التحقق مما إذا كان المسار يحتوي على عتبات مخصصة
 */
export function hasCustomThreshold(
  path: string,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): boolean {
  const normalized = normalizePath(path);
  return normalized in config.routes;
}

// ═══════════════════════════════════════════════════════════════
// 🛠️ دوال التعديل والإدارة (Mutation Helpers)
// ═══════════════════════════════════════════════════════════════

export function mergeThresholds(
  customConfig: Partial<PerformanceThresholdsConfig>
): PerformanceThresholdsConfig {
  return {
    version: customConfig.version || DEFAULT_THRESHOLDS.version,
    default: customConfig.default || DEFAULT_THRESHOLDS.default,
    routes: {
      ...DEFAULT_THRESHOLDS.routes,
      ...(customConfig.routes || {}),
    },
  };
}

export function setThresholdForPath(
  path: string,
  threshold: RouteThreshold,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): PerformanceThresholdsConfig {
  return {
    ...config,
    routes: {
      ...config.routes,
      [normalizePath(path)]: threshold,
    },
  };
}

export function removeThresholdForPath(
  path: string,
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): PerformanceThresholdsConfig {
  const newRoutes = { ...config.routes };
  delete newRoutes[normalizePath(path)];
  return {
    ...config,
    routes: newRoutes,
  };
}

// ═══════════════════════════════════════════════════════════════
// 📋 دوال التصدير والتصحيح (Debug & Export Helpers)
// ═══════════════════════════════════════════════════════════════

export function getThresholdsJSON(
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): string {
  return JSON.stringify(config, null, 2);
}

export function getThresholdsSummary(
  config: PerformanceThresholdsConfig = DEFAULT_THRESHOLDS
): {
  totalRoutes: number;
  defaultThreshold: RouteThreshold;
  priorityBreakdown: {
    low: number;
    normal: number;
    high: number;
  };
  slowestRoute: {
    path: string;
    threshold: RouteThreshold;
  };
  fastestRoute: {
    path: string;
    threshold: RouteThreshold;
  };
} {
  const routes = Object.entries(config.routes);
  const priorityBreakdown = {
    low: routes.filter(([, t]) => t.priority === 'low').length,
    normal: routes.filter(([, t]) => t.priority === 'normal').length,
    high: routes.filter(([, t]) => t.priority === 'high').length,
  };

  const slowest = routes.reduce(
    (acc, [path, threshold]) => {
      if (threshold.slowThresholdMs > acc.threshold.slowThresholdMs) {
        return { path, threshold };
      }
      return acc;
    },
    { path: '', threshold: config.default }
  );

  const fastest = routes.reduce(
    (acc, [path, threshold]) => {
      if (threshold.slowThresholdMs < acc.threshold.slowThresholdMs) {
        return { path, threshold };
      }
      return acc;
    },
    { path: '', threshold: config.default }
  );

  return {
    totalRoutes: routes.length,
    defaultThreshold: config.default,
    priorityBreakdown,
    slowestRoute: slowest.path ? slowest : { path: 'default', threshold: config.default },
    fastestRoute: fastest.path ? fastest : { path: 'default', threshold: config.default },
  };
}