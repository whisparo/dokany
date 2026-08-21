// src/dashboard/categories-management/server/category.queries.ts
'use server';

import { headers } from 'next/headers';
import { eq, and, sql, desc, asc, count, isNull } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import { getDb } from '@/lib/db/db';
import { categories } from '@/lib/db/schema/categories';
import { SystemError, safeExecute } from '@/lib/errors';

import {
  buildCategoryTree,
  buildCategoryBreadcrumb,
  categoriesToMap,
} from './category.helpers';
import type {
  Category,
  CategoryTree,
  CategoryFlat,
  CategoryListParams,
  CategoryListResult,
  CategoryTreeResult,
  CategoryBreadcrumb,
  CategoryFilterOption,
} from '../types/category.types';

// ============================================================
// 🧠 دوال مساعدة داخلية
// ============================================================

/**
 * استخراج storeId من الـ Header (الممرر من Middleware)
 */
async function getStoreId(): Promise<string> {
  const headersList = await headers();
  const storeId = headersList.get('x-store-id');

  if (!storeId) {
    throw new SystemError({
      code: 'AUTH_NO_STORE',
      userMessage: 'لم يتم التعرف على المتجر، يرجى تسجيل الدخول مجدداً',
      technicalMessage: 'Missing x-store-id header from middleware',
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
    });
  }

  return storeId;
}

/**
 * الحصول على اتصال قاعدة البيانات من OpenNext Context
 */
function getDbInstance() {
  const { env } = getCloudflareContext();
  return getDb({ DB: env.DB });
}

/**
 * تنظيف نص البحث (منع SQL Injection)
 */
function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[%_\\]/g, '') // إزالة wildcards
    .slice(0, 100); // حد أقصى 100 حرف
}

// ============================================================
// 📤 دوال الاستعلام (Queries)
// ============================================================

/**
 * جلب قسم واحد مع بيانات الأب والأبناء
 */
export async function getCategoryQuery(
  categoryId: string
): Promise<{
  success: boolean;
  message?: string;
  data?: Category & {
    parent?: Category | null;
    children?: Category[];
    breadcrumb?: CategoryBreadcrumb[];
  };
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    // 1️⃣ جلب القسم مع الأب والأبناء في query واحدة (using relations)
    const category = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
      with: {
        parent: true,
        children: {
          where: isNull(categories.deletedAt),
          orderBy: [asc(categories.order)],
        },
      },
    });

    if (!category) {
      throw new SystemError({
        code: 'CATEGORY_NOT_FOUND',
        userMessage: 'القسم غير موجود',
        technicalMessage: `Category not found: ${categoryId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { categoryId, storeId },
      });
    }

    // 2️⃣ بناء الـ Breadcrumb
    const breadcrumb = await buildCategoryBreadcrumb(categoryId);

    return {
      success: true,
      data: {
        ...category,
        breadcrumb: breadcrumb.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          level: c.level,
        })),
      },
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب القسم',
    };
  });
}

/**
 * قائمة الأقسام مع التصفية والترتيب والترقيم
 */
export async function listCategoriesQuery(
  params: CategoryListParams
): Promise<{
  success: boolean;
  message?: string;
  data?: CategoryListResult;
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();

  const {
    page = 1,
    limit = 20,
    search,
    parentId,
    isActive,
    includeInactive = false,
    includeDeleted = false,
    maxDepth,
    sortBy = 'order',
    sortOrder = 'asc',
  } = params;

  return await safeExecute(async () => {
    // 1️⃣ بناء شروط البحث
    const conditions = [eq(categories.storeId, storeId)];

    if (!includeDeleted) {
      conditions.push(isNull(categories.deletedAt));
    }

    if (!includeInactive && !includeDeleted) {
      conditions.push(eq(categories.isActive, true));
    }

    if (search) {
      const sanitizedSearch = sanitizeSearchQuery(search);
      if (sanitizedSearch.length >= 2) {
        const searchPattern = `%${sanitizedSearch}%`;
        conditions.push(
          sql`(${categories.name} LIKE ${searchPattern} ESCAPE '\\' OR ${categories.description} LIKE ${searchPattern} ESCAPE '\\')`
        );
      }
    }

    if (parentId !== undefined) {
      if (parentId === null) {
        conditions.push(isNull(categories.parentId));
      } else {
        conditions.push(eq(categories.parentId, parentId));
      }
    }

    if (isActive !== undefined) {
      conditions.push(eq(categories.isActive, isActive));
    }

    if (maxDepth !== undefined) {
      conditions.push(sql`${categories.level} <= ${maxDepth}`);
    }

    // 2️⃣ حساب العدد الكلي
    const totalQuery = await db
      .select({ count: count() })
      .from(categories)
      .where(and(...conditions));

    const total = Number(totalQuery[0]?.count ?? 0);

    // 3️⃣ تحديد الترتيب
    const getOrderBy = () => {
      const direction = sortOrder === 'asc' ? asc : desc;
      switch (sortBy) {
        case 'name':
          return direction(categories.name);
        case 'createdAt':
          return direction(categories.createdAt);
        case 'productsCount':
          return direction(categories.productsCount);
        case 'order':
        default:
          return direction(categories.order);
      }
    };

    // 4️⃣ جلب البيانات
    const result = await db.query.categories.findMany({
      where: and(...conditions),
      orderBy: [getOrderBy()],
      limit,
      offset: (page - 1) * limit,
    });

    const totalPages = Math.ceil(total / limit);
    const hasMore = totalPages > 0 && page < totalPages;

    return {
      success: true,
      data: {
        data: result,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasMore,
        },
      },
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب الأقسام',
    };
  });
}

/**
 * جلب الشجرة الكاملة للأقسام (لـ Sidebar و Tree View)
 */
export async function getCategoryTreeQuery(
  options?: {
    includeInactive?: boolean;
    maxDepth?: number;
  }
): Promise<{
  success: boolean;
  message?: string;
  data?: CategoryTreeResult;
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();
  const { includeInactive = false, maxDepth } = options || {};

  return await safeExecute(async () => {
    const conditions = [
      eq(categories.storeId, storeId),
      isNull(categories.deletedAt),
    ];

    if (!includeInactive) {
      conditions.push(eq(categories.isActive, true));
    }

    if (maxDepth !== undefined) {
      conditions.push(sql`${categories.level} <= ${maxDepth}`);
    }

    const allCategories = await db.query.categories.findMany({
      where: and(...conditions),
      orderBy: [asc(categories.order)],
    });

    const tree = buildCategoryTree(allCategories);

    const maxDepthValue = allCategories.reduce(
      (max, cat) => Math.max(max, cat.level || 0),
      0
    );

    return {
      success: true,
      data: {
        tree,
        totalCount: allCategories.length,
        maxDepth: maxDepthValue,
      },
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب شجرة الأقسام',
    };
  });
}

/**
 * جلب الأقسام الفرعية لقسم معين (للـ Lazy Loading)
 */
export async function getCategoryChildrenQuery(
  parentId: string
): Promise<{
  success: boolean;
  message?: string;
  data?: Category[];
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    const parent = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, parentId),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
      columns: { id: true },
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
        metadata: { parentId, storeId },
      });
    }

    const children = await db.query.categories.findMany({
      where: and(
        eq(categories.parentId, parentId),
        eq(categories.storeId, storeId),
        eq(categories.isActive, true),
        isNull(categories.deletedAt)
      ),
      orderBy: [asc(categories.order)],
    });

    return {
      success: true,
      data: children,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب الأقسام الفرعية',
    };
  });
}

/**
 * جلب خيارات الفلترة للـ Filter Ribbon
 */
export async function getCategoryFilterOptionsQuery(): Promise<{
  success: boolean;
  message?: string;
  data?: CategoryFilterOption[];
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    const allCategories = await db.query.categories.findMany({
      where: and(
        eq(categories.storeId, storeId),
        eq(categories.isActive, true),
        isNull(categories.deletedAt)
      ),
      orderBy: [asc(categories.order)],
    });

    const tree = buildCategoryTree(allCategories);

    const calculateTotalProductsCount = (node: CategoryTree): number => {
      const childrenCount = (node.children || []).reduce(
        (sum, child) => sum + calculateTotalProductsCount(child),
        0
      );
      return (node.productsCount || 0) + childrenCount;
    };

    const mapToFilterOption = (node: CategoryTree): CategoryFilterOption => ({
      id: node.id,
      name: node.name,
      slug: node.slug,
      productsCount: calculateTotalProductsCount(node),
      level: node.level || 0,
      children: node.children?.map(mapToFilterOption),
    });

    const options = tree.map(mapToFilterOption);

    return {
      success: true,
      data: options,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب خيارات الفلترة',
    };
  });
}

/**
 * البحث عن الأقسام (لـ Autocomplete)
 */
export async function searchCategoriesQuery(
  query: string,
  limit: number = 10
): Promise<{
  success: boolean;
  message?: string;
  data?: Category[];
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();

  if (!query || query.trim().length < 2) {
    return {
      success: true,
      data: [],
    };
  }

  const sanitizedQuery = sanitizeSearchQuery(query);
  if (sanitizedQuery.length < 2) {
    return {
      success: true,
      data: [],
    };
  }

  const safeLimit = Math.min(Math.max(1, limit), 50);

  return await safeExecute(async () => {
    const searchPattern = `%${sanitizedQuery}%`;

    const results = await db.query.categories.findMany({
      where: and(
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt),
        eq(categories.isActive, true),
        sql`${categories.name} LIKE ${searchPattern} ESCAPE '\\'`
      ),
      orderBy: [asc(categories.order)],
      limit: safeLimit,
    });

    return {
      success: true,
      data: results,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء البحث عن الأقسام',
    };
  });
}

/**
 * جلب الأقسام المسطحة (Flat) مع الـ Breadcrumbs
 */
export async function getFlatCategoriesQuery(
  options?: {
    includeInactive?: boolean;
    includeDeleted?: boolean;
  }
): Promise<{
  success: boolean;
  message?: string;
  data?: CategoryFlat[];
}> {
  const storeId = await getStoreId();
  const db = getDbInstance();
  const { includeInactive = false, includeDeleted = false } = options || {};

  return await safeExecute(async () => {
    const conditions = [eq(categories.storeId, storeId)];

    if (!includeDeleted) {
      conditions.push(isNull(categories.deletedAt));
    }

    if (!includeInactive && !includeDeleted) {
      conditions.push(eq(categories.isActive, true));
    }

    const allCategories = await db.query.categories.findMany({
      where: and(...conditions),
      orderBy: [asc(categories.level), asc(categories.order)],
    });

    const categoryMap = categoriesToMap(allCategories);

    const flatCategories: CategoryFlat[] = allCategories.map((cat) => {
      const breadcrumb: string[] = [];
      let current: Category | undefined = cat;

      while (current) {
        breadcrumb.unshift(current.name);
        current = current.parentId ? categoryMap.get(current.parentId) : undefined;
      }

      return {
        ...cat,
        breadcrumb,
        depth: cat.level || 0,
        hasChildren: allCategories.some(
          (c) => c.parentId === cat.id && !c.deletedAt
        ),
      };
    });

    return {
      success: true,
      data: flatCategories,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء جلب الأقسام المسطحة',
    };
  });
}