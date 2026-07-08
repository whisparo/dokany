// src/lib/db/schema/platform-settings.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// ============================================
// 📦 أنواع TypeScript
// ============================================

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json' | 'array';
export type SettingEnvironment = 'production' | 'staging' | 'development' | 'test';

export type SettingCategory =
  | 'site'
  | 'pricing'
  | 'shipping'
  | 'payments'
  | 'notifications'
  | 'security'
  | 'seo'
  | 'appearance'
  | 'integrations'
  | 'advanced';

// ============================================
// ⚙️ جدول إعدادات المنصة (Platform Settings) - D1 Optimized
// ============================================

export const platformSettings = sqliteTable(
  'platform_settings',
  {
    // 🔑 المفتاح (مركب منطقياً عبر الـ Indexes والـ Primary هنا نصي)
    key: text('key').primaryKey(),

    // 💎 القيمة (تحويل وتفسير تلقائي عبر الدريزل)
    value: text('value', { mode: 'json' })
      .$type<unknown>()
      .notNull()
      .default(sql`'{}'`),

    type: text('type').notNull().default('json'),
    description: text('description'),
    category: text('category'),
    environment: text('environment').notNull().default('production'),
    
    // 🏪 المتجر (nullable = global settings)
    storeId: text('store_id'),

    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    validation: text('validation'),

    // 🔢 Optimistic Locking
    version: integer('version').notNull().default(1),

    // 👤 الـ Audit Log للـ Admin بدون قيود مكبلة للـ Engine
    updatedBy: text('updated_by'),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // ============================================
    // 🗝️ الفهارس الفريدة والأداء لتأمين الـ Key-Value Store
    // ============================================
    
    // ✅ منع تكرار المفتاح على مستوى البيئة العامة (Global Settings)
    uniqueIndex('platform_settings_key_env_unique')
      .on(table.key, table.environment)
      .where(sql`store_id IS NULL`),

    // ✅ منع تكرار المفتاح على مستوى المتجر والبيئة معاً
    uniqueIndex('platform_settings_key_store_env_unique')
      .on(table.key, table.storeId, table.environment)
      .where(sql`store_id IS NOT NULL`),

    index('platform_settings_category_idx').on(table.category),
    index('platform_settings_type_idx').on(table.type),
    index('platform_settings_environment_idx').on(table.environment),
    
    // ✅ فهارس سريعة للـ Frontend والـ Multi-tenancy متوافقة مع SQLite Engine
    index('platform_settings_public_idx')
      .on(table.isPublic)
      .where(sql`is_public = 1 AND environment = 'production'`),
    
    index('platform_settings_store_idx')
      .on(table.storeId)
      .where(sql`store_id IS NOT NULL`),
    
    index('platform_settings_store_env_idx')
      .on(table.storeId, table.environment)
      .where(sql`store_id IS NOT NULL`),
      
    index('platform_settings_category_env_idx').on(table.category, table.environment),

    // ============================================
    // 🛡️ القيود المنطقية المتوافقة مع SQLite GLOB Engine
    // ============================================
    check(
      'chk_key_format',
      sql`
        ${table.key} GLOB '[a-z0-9]*'
        AND ${table.key} NOT GLOB '*..*'
        AND ${table.key} NOT GLOB '*__*'
        AND ${table.key} NOT GLOB '*.-*'
        AND ${table.key} NOT GLOB '*-.*'
      `
    ),
    
    check('chk_key_length', sql`length(${table.key}) BETWEEN 1 AND 100`),
    check('chk_category_format', sql`${table.category} IS NULL OR ${table.category} GLOB '[a-z0-9._-]*'`),
    check('chk_category_length', sql`${table.category} IS NULL OR length(${table.category}) <= 50`),
    check('chk_value_type', sql`${table.type} IN ('string', 'number', 'boolean', 'json', 'array')`),
    check('chk_environment', sql`${table.environment} IN ('production', 'staging', 'development', 'test')`),
    check('chk_version_positive', sql`${table.version} >= 1`),
    check('chk_value_valid', sql`${table.value} IS NULL OR json_valid(${table.value}) = 1`),
  ]
);

// ============================================
// 📚 أنواع TypeScript (تم تفعيلها صراحة بدون Any وبأعلى دقّة)
// ============================================
export type PlatformSetting = InferSelectModel<typeof platformSettings>;
export type NewPlatformSetting = InferInsertModel<typeof platformSettings>;

// ============================================
// 🛠️ الدوال المساعدة (Drizzle Native & D1 Compliant)
// ============================================

/**
 * ✅ جلب إعداد حسب المفتاح والبيئة
 */
export async function getSetting(
  d1Database: D1Database,
  key: string,
  environment: SettingEnvironment = 'production',
  storeId?: string
): Promise<PlatformSetting | null> {
  const db = drizzle(d1Database);
  
  const conditions = [
    eq(platformSettings.key, key),
    eq(platformSettings.environment, environment)
  ];

  if (storeId) {
    conditions.push(eq(platformSettings.storeId, storeId));
  } else {
    conditions.push(isNull(platformSettings.storeId));
  }

  const result = await db
    .select()
    .from(platformSettings)
    .where(and(...conditions))
    .get();

  return result || null;
}

/**
 * ✅ تحديث إعداد مع Optimistic Locking لحماية البيانات من الـ Race Conditions
 */
export async function updateSetting(
  d1Database: D1Database,
  key: string,
  value: unknown,
  expectedVersion: number,
  environment: SettingEnvironment = 'production',
  storeId?: string,
  updatedBy?: string
): Promise<{ success: boolean; newVersion?: number }> {
  const db = drizzle(d1Database);
  
  const conditions = [
    eq(platformSettings.key, key),
    eq(platformSettings.environment, environment),
    eq(platformSettings.version, expectedVersion)
  ];

  if (storeId) {
    conditions.push(eq(platformSettings.storeId, storeId));
  } else {
    conditions.push(isNull(platformSettings.storeId));
  }

  const result = await db
    .update(platformSettings)
    .set({
      value: value,
      version: sql`${platformSettings.version} + 1`,
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .run();

  if (result.meta.changes === 0) {
    return { success: false }; // الـ Version اتغير من برة (Conflict)
  }

  return { success: true, newVersion: expectedVersion + 1 };
}

/**
 * ✅ إنشاء إعداد جديد بأسلوب Drizzle المباشر
 */
export async function createSetting(
  d1Database: D1Database,
  key: string,
  value: unknown,
  options: {
    type?: SettingValueType;
    description?: string;
    category?: string;
    environment?: SettingEnvironment;
    storeId?: string;
    isPublic?: boolean;
    validation?: string;
    updatedBy?: string;
  } = {}
): Promise<PlatformSetting> {
  const db = drizzle(d1Database);

  await db.insert(platformSettings).values({
    key,
    value,
    type: options.type || 'json',
    description: options.description || null,
    category: options.category || null,
    environment: options.environment || 'production',
    storeId: options.storeId || null,
    isPublic: options.isPublic || false,
    validation: options.validation || null,
    updatedBy: options.updatedBy || null,
    version: 1,
  }).run();

  const created = await getSetting(d1Database, key, options.environment || 'production', options.storeId);
  return created!;
}

/**
 * ✅ حذف إعداد
 */
export async function deleteSetting(
  d1Database: D1Database,
  key: string,
  environment: SettingEnvironment = 'production',
  storeId?: string
): Promise<boolean> {
  const db = drizzle(d1Database);
  
  const conditions = [
    eq(platformSettings.key, key),
    eq(platformSettings.environment, environment)
  ];

  if (storeId) {
    conditions.push(eq(platformSettings.storeId, storeId));
  } else {
    conditions.push(isNull(platformSettings.storeId));
  }

  const result = await db.delete(platformSettings).where(and(...conditions)).run();
  return result.meta.changes > 0;
}

/**
 * ✅ جلب كل الإعدادات العامة للـ Frontend مع الـ Auto-parsing الصحيح
 */
export async function getPublicSettings(
  d1Database: D1Database,
  environment: SettingEnvironment = 'production'
): Promise<Record<string, unknown>> {
  const db = drizzle(d1Database);

  const result = await db
    .select({
      key: platformSettings.key,
      value: platformSettings.value,
    })
    .from(platformSettings)
    .where(
      and(
        eq(platformSettings.isPublic, true),
        eq(platformSettings.environment, environment),
        isNull(platformSettings.storeId)
      )
    )
    .all();

  const settings: Record<string, unknown> = {};
  for (const row of result) {
    settings[row.key] = row.value;
  }

  return settings;
}

/**
 * ✅ جلب الإعدادات حسب الفئة
 */
export async function getSettingsByCategory(
  d1Database: D1Database,
  category: string,
  environment: SettingEnvironment = 'production',
  storeId?: string
): Promise<PlatformSetting[]> {
  const db = drizzle(d1Database);
  
  const conditions = [
    eq(platformSettings.category, category),
    eq(platformSettings.environment, environment)
  ];

  if (storeId) {
    conditions.push(eq(platformSettings.storeId, storeId));
  } else {
    conditions.push(isNull(platformSettings.storeId));
  }

  return await db
    .select()
    .from(platformSettings)
    .where(and(...conditions))
    .orderBy(platformSettings.key)
    .all();
}

/**
 * ✅ التحقق من صحة القيمة (Placeholder)
 */
export async function validateSettingValue(
  d1Database: D1Database,
  key: string,
  value: unknown
): Promise<{ valid: boolean; error?: string }> {
  const setting = await getSetting(d1Database, key, 'production');
  
  if (!setting?.validation) {
    return { valid: true };
  }
  
  try {
    return { valid: true };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}