// src/dashboard/categories-management/server/category.helpers.ts
// ⚠️ ملاحظة: الملف ده helpers، مش Server Actions — مش محتاج 'use server'

import { eq, and, sql, isNull, inArray, count } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db/db';
import { categories } from '@/lib/db/schema/categories';
import { products } from '@/lib/db/schema/products';
import { SystemError } from '@/lib/errors';
import type { Category } from '@/lib/db/schema/categories';
import type { CategoryTree, CategoryFlat } from '../types/category.types';

// ============================================================
// 🧠 دوال مساعدة خاصة بالأقسام
// ============================================================

/**
 * الحصول على اتصال قاعدة البيانات من الـ Edge Runtime
 */
function getDbInstance() {
  const { env } = getCloudflareContext();
  return getDb({ DB: env.DB });
}

/**
 * توليد Slug فريد من اسم القسم
 */
export async function generateUniqueCategorySlug(
  name: string,
  storeId: string,
  excludeId?: string
): Promise<string> {
  const db = getDbInstance();

  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);

  let slug = baseSlug || 'category';
  let counter = 0;

  while (counter <= 100) {
    const conditions = [
      eq(categories.storeId, storeId),
      eq(categories.slug, slug),
      isNull(categories.deletedAt),
    ];

    if (excludeId) {
      conditions.push(sql`${categories.id} != ${excludeId}`);
    }

    const existing = await db.query.categories.findFirst({
      where: and(...conditions),
      columns: { id: true },
    });

    if (!existing) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * بناء الـ path (المسار الهرمي) للقسم
 */
export async function buildCategoryPath(
  parentId: string | null,
  slug: string
): Promise<string> {
  if (!parentId) {
    return `/${slug}`;
  }

  const db = getDbInstance();

  const parent: { path: string | null; slug: string } | undefined =
    await db.query.categories.findFirst({
      where: and(
        eq(categories.id, parentId),
        isNull(categories.deletedAt)
      ),
      columns: { path: true, slug: true },
    });

  if (!parent) {
    throw new SystemError({
      code: 'CATEGORY_PARENT_NOT_FOUND',
      userMessage: 'القسم الأب غير موجود',
      technicalMessage: `Parent category not found: ${parentId}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
      metadata: { parentId },
    });
  }

  return `${parent.path}/${slug}`;
}

/**
 * بناء مصفوفة الـ Breadcrumb لقسم معين
 */
export async function buildCategoryBreadcrumb(
  categoryId: string
): Promise<Category[]> {
  const db = getDbInstance();

  const category = await db.query.categories.findFirst({
    where: and(
      eq(categories.id, categoryId),
      isNull(categories.deletedAt)
    ),
  });

  if (!category) {
    return [];
  }

  if (!category.parentId) {
    return [category];
  }

  const pathSlugs = category.path?.split('/').filter(Boolean) || [];

  if (pathSlugs.length === 0) {
    return [category];
  }

  const ancestors = await db.query.categories.findMany({
    where: and(
      eq(categories.storeId, category.storeId),
      inArray(categories.slug, pathSlugs),
      isNull(categories.deletedAt)
    ),
    orderBy: (categories, { asc }) => [asc(categories.level)],
  });

  return [...ancestors, category];
}

/**
 * حساب مستوى القسم (level) بناءً على parentId
 */
export async function calculateCategoryLevel(
  parentId: string | null
): Promise<number> {
  if (!parentId) return 0;

  const db = getDbInstance();

  const parent: { level: number } | undefined =
    await db.query.categories.findFirst({
      where: and(
        eq(categories.id, parentId),
        isNull(categories.deletedAt)
      ),
      columns: { level: true },
    });

  if (!parent) {
    throw new SystemError({
      code: 'CATEGORY_PARENT_NOT_FOUND',
      userMessage: 'القسم الأب غير موجود',
      technicalMessage: `Parent category not found: ${parentId}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
      metadata: { parentId },
    });
  }

  return parent.level + 1;
}

/**
 * التحقق من وجود دورة في الهيكل الهرمي
 */
export async function detectCircularReference(
  categoryId: string,
  newParentId: string | null
): Promise<boolean> {
  if (!newParentId) return false;

  if (newParentId === categoryId) {
    return true;
  }

  const db = getDbInstance();

  let currentId: string | null = newParentId;
  const visited = new Set<string>();
  let depth = 0;

  while (currentId) {
    if (depth > 10) {
      return true;
    }

    if (visited.has(currentId)) {
      return true;
    }

    if (currentId === categoryId) {
      return true;
    }

    visited.add(currentId);
    depth++;

    const parent: { parentId: string | null } | undefined =
      await db.query.categories.findFirst({
        where: and(
          eq(categories.id, currentId),
          isNull(categories.deletedAt)
        ),
        columns: { parentId: true },
      });

    currentId = parent?.parentId || null;
  }

  return false;
}

/**
 * بناء شجرة الأقسام من قائمة مسطحة
 */
export function buildCategoryTree(
  flatList: Category[],
  parentId: string | null = null
): CategoryTree[] {
  const children = flatList.filter(
    (c) => c.parentId === parentId || (!c.parentId && !parentId)
  );

  return children
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      ...category,
      children: buildCategoryTree(flatList, category.id),
    }));
}

/**
 * تحويل قائمة مسطحة إلى CategoryFlat مع بيانات إضافية
 */
export function flattenCategories(
  categories: Category[]
): CategoryFlat[] {
  const categoryMap = new Map<string, Category>(
    categories.map((c) => [c.id, c])
  );

  const breadcrumbMap = new Map<string, string[]>();

  for (const cat of categories) {
    const breadcrumb: string[] = [];
    let current: Category | undefined = cat;

    while (current) {
      breadcrumb.unshift(current.name);
      current = current.parentId ? categoryMap.get(current.parentId) : undefined;
    }

    breadcrumbMap.set(cat.id, breadcrumb);
  }

  return categories.map((cat) => ({
    ...cat,
    breadcrumb: breadcrumbMap.get(cat.id) || [cat.name],
    depth: cat.level || 0,
    hasChildren: categories.some((c) => c.parentId === cat.id && !c.deletedAt),
  }));
}

/**
 * تحديث productsCount للأقسام المتأثرة
 */
export async function refreshProductsCount(
  categoryIds: string[]
): Promise<void> {
  if (categoryIds.length === 0) return;

  const db = getDbInstance();

  for (const categoryId of categoryIds) {
    const result = await db
      .select({ count: count() })
      .from(products)
      .where(
        and(
          eq(products.categoryId, categoryId),
          isNull(products.deletedAt)
        )
      );

    const productsCount = result[0]?.count || 0;

    await db
      .update(categories)
      .set({ 
        productsCount,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, categoryId));
  }
}

/**
 * توليد معرّف فريد للقسم
 */
export function generateCategoryId(): string {
  return crypto.randomUUID();
}

/**
 * التحقق من صحة مستوى القسم (حد أقصى 10 مستويات)
 */
export function isValidLevel(level: number): boolean {
  return level >= 0 && level <= 10;
}

/**
 * التحقق من وجود قسم (نشط وغير محذوف)
 */
export async function checkCategoryExists(
  id: string,
  storeId: string
): Promise<boolean> {
  const db = getDbInstance();

  const existing = await db.query.categories.findFirst({
    where: and(
      eq(categories.id, id),
      eq(categories.storeId, storeId),
      isNull(categories.deletedAt)
    ),
    columns: { id: true },
  });

  return !!existing;
}

// ✅ Alias لتوافق المسميات عند الاستيراد
export const categoryExists = checkCategoryExists;

/**
 * الحصول على معرفات جميع الأقسام الفرعية (recursive)
 */
export async function getAllDescendantIds(
  categoryId: string
): Promise<string[]> {
  const db = getDbInstance();

  const result: string[] = [];
  let currentLevel = [categoryId];

  while (currentLevel.length > 0) {
    const children = await db.query.categories.findMany({
      where: and(
        inArray(categories.parentId, currentLevel),
        isNull(categories.deletedAt)
      ),
      columns: { id: true },
    });

    const childIds = children.map((c) => c.id);
    result.push(...childIds);
    currentLevel = childIds;
  }

  return result;
}

/**
 * تحويل قائمة الأقسام إلى خريطة للاستعلام السريع
 */
export function categoriesToMap(
  categories: Category[]
): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

/**
 * فرز الأقسام حسب الـ order والـ name (للتناسق)
 */
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, 'ar');
  });
}

/**
 * حساب العدد الكلي للأقسام الفرعية (recursive)
 */
export async function countDescendants(
  categoryId: string
): Promise<number> {
  const descendants = await getAllDescendantIds(categoryId);
  return descendants.length;
}

/**
 * الحصول على جميع الأقسام في مسار معين (من الجذر للقسم)
 */
export async function getCategoriesByPath(
  path: string,
  storeId: string
): Promise<Category[]> {
  const db = getDbInstance();

  const slugs = path.split('/').filter(Boolean);

  if (slugs.length === 0) {
    return [];
  }

  return await db.query.categories.findMany({
    where: and(
      eq(categories.storeId, storeId),
      inArray(categories.slug, slugs),
      isNull(categories.deletedAt)
    ),
    orderBy: (categories, { asc }) => [asc(categories.level)],
  });
}