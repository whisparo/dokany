// src/dashboard/categories-management/server/category.mutations.ts
'use server';

import { headers } from 'next/headers';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import { getDb } from '@/lib/db/db';
import { categories } from '@/lib/db/schema/categories';
import { products } from '@/lib/db/schema/products';
import { SystemError, safeExecute } from '@/lib/errors';
import { createAuth } from '@/lib/auth';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@/lib/validations/category';
import { invalidateStoreSnapshot } from '@/dashboard/products-management/server/product.helpers';

import {
  generateUniqueCategorySlug,
  calculateCategoryLevel,
  buildCategoryPath,
  detectCircularReference,
  getAllDescendantIds,
  checkCategoryExists,
  generateCategoryId,
} from './category.helpers';
import type {
  CategoryActionResult,
  CategoryBulkActionResult,
  ReorderCategoriesInput,
  MoveCategoryInput,
  BulkDeleteCategoriesInput,
} from '../types/category.types';
import type { Category, NewCategory } from '@/lib/db/schema/categories';

// ✅ Type helper للتحديثات المشتملة على SQL expressions أو القيم الجزئية
type CategoryUpdateInput = Partial<NewCategory>;

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
 * استخراج userId من جلسة Better Auth
 */
async function getCurrentUserId(): Promise<string | null> {
  const { env } = getCloudflareContext();
  const reqHeaders = await headers();
  const auth = createAuth(env);

  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  return session?.user?.id || null;
}

/**
 * الحصول على اتصال قاعدة البيانات من OpenNext Context
 */
function getDbInstance() {
  const { env } = getCloudflareContext();
  return getDb({ DB: env.DB });
}

// ============================================================
// 📤 إنشاء قسم جديد
// ============================================================

export async function createCategoryAction(
  input: CreateCategoryInput
): Promise<CategoryActionResult<Category>> {
  const validationInput = { ...input };
  delete (validationInput as any).storeId;

  const validation = createCategorySchema.safeParse(validationInput);
  if (!validation.success) {
    return {
      success: false,
      message: 'بيانات القسم غير صحيحة',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const storeId = await getStoreId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    if (input.parentId) {
      const parentExists = await checkCategoryExists(input.parentId, storeId);
      if (!parentExists) {
        throw new SystemError({
          code: 'CATEGORY_PARENT_NOT_FOUND',
          userMessage: 'القسم الأب غير موجود',
          technicalMessage: `Parent category not found: ${input.parentId}`,
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          metadata: { parentId: input.parentId, storeId },
        });
      }
    }

    const slug = input.slug || (await generateUniqueCategorySlug(input.name, storeId));
    const level = await calculateCategoryLevel(input.parentId || null);
    const path = await buildCategoryPath(input.parentId || null, slug);

    const newCategory: NewCategory = {
      id: generateCategoryId(),
      storeId,
      parentId: input.parentId || null,
      name: input.name,
      slug,
      description: input.description || null,
      image: null,
      level,
      path,
      order: input.order || 0,
      productsCount: 0,
      isActive: input.isActive ?? true,
      mediaIds: (input as any).mediaIds || [],
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [result] = await db.insert(categories).values(newCategory).returning();

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: 'تم إضافة القسم بنجاح',
      data: result,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء إضافة القسم',
    };
  });
}

// ============================================================
// ✏️ تحديث قسم موجود
// ============================================================

export async function updateCategoryAction(
  categoryId: string,
  input: UpdateCategoryInput
): Promise<CategoryActionResult<Category>> {
  const validation = updateCategorySchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      message: 'بيانات التحديث غير صحيحة',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const storeId = await getStoreId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    const existing = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
    });

    if (!existing) {
      throw new SystemError({
        code: 'CATEGORY_NOT_FOUND',
        userMessage: 'القسم غير موجود أو لا يتبع متجرك',
        technicalMessage: `Category not found: ${categoryId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { categoryId, storeId },
      });
    }

    const updateData: CategoryUpdateInput = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.slug !== undefined) {
      const newSlug = await generateUniqueCategorySlug(input.slug, storeId, categoryId);
      updateData.slug = newSlug;
    } else if (input.name !== undefined && input.name !== existing.name) {
      const newSlug = await generateUniqueCategorySlug(input.name, storeId, categoryId);
      updateData.slug = newSlug;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.order !== undefined) {
      updateData.order = input.order;
    }

    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    if ((input as any).mediaIds !== undefined) {
      updateData.mediaIds = (input as any).mediaIds;
    }

    const oldParentId = existing.parentId;
    let parentIdChanged = false;

    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      const newParentId = input.parentId;
      parentIdChanged = true;

      const hasCycle = await detectCircularReference(categoryId, newParentId);
      if (hasCycle) {
        throw new SystemError({
          code: 'CATEGORY_CIRCULAR_REFERENCE',
          userMessage: 'لا يمكن نقل القسم إلى أحد فروعه',
          technicalMessage: `Circular reference detected: ${categoryId} -> ${newParentId}`,
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          metadata: { categoryId, newParentId, storeId },
        });
      }

      if (newParentId) {
        const parentExists = await checkCategoryExists(newParentId, storeId);
        if (!parentExists) {
          throw new SystemError({
            code: 'CATEGORY_PARENT_NOT_FOUND',
            userMessage: 'القسم الأب غير موجود',
            technicalMessage: `Parent category not found: ${newParentId}`,
            category: 'business',
            severity: 'warning',
            retryable: false,
            shouldAlert: false,
            metadata: { parentId: newParentId, storeId },
          });
        }
      }

      const newLevel = await calculateCategoryLevel(newParentId);
      const newSlug = (updateData.slug as string) || existing.slug;
      const newPath = await buildCategoryPath(newParentId, newSlug);

      updateData.parentId = newParentId;
      updateData.level = newLevel;
      updateData.path = newPath;
    }

    const [result] = await db
      .update(categories)
      .set(updateData)
      .where(and(eq(categories.id, categoryId), eq(categories.storeId, storeId)))
      .returning();

    if (!result) {
      throw new SystemError({
        code: 'CATEGORY_UPDATE_CONFLICT',
        userMessage: 'حدث تعارض أثناء التحديث، يرجى إعادة المحاولة',
        technicalMessage: 'Atomic update returned no rows',
        category: 'business',
        severity: 'warning',
        retryable: true,
        shouldAlert: false,
      });
    }

    if (parentIdChanged) {
      await updateDescendantsAfterMove(
        categoryId,
        oldParentId,
        result.level,
        result.path || '',
        storeId
      );
    }

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: 'تم تحديث القسم بنجاح',
      data: result,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء تحديث القسم',
    };
  });
}

/**
 * تحديث جميع الأقسام الفرعية بعد نقل القسم الأب
 */
async function updateDescendantsAfterMove(
  categoryId: string,
  oldParentId: string | null,
  newParentLevel: number,
  newParentPath: string,
  storeId: string
): Promise<void> {
  const db = getDbInstance();
  const descendants = await getAllDescendantIds(categoryId);

  if (descendants.length === 0) return;

  const descendantCategories = await db.query.categories.findMany({
    where: and(
      inArray(categories.id, descendants),
      eq(categories.storeId, storeId),
      isNull(categories.deletedAt)
    ),
  });

  const categoryMap = new Map<string, Category>(
    descendantCategories.map((c) => [c.id, c])
  );

  const parentCategory = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  });

  if (parentCategory) {
    categoryMap.set(categoryId, parentCategory);
  }

  // ⚡ تحسين الأداء: استخدام Promise.all بدلاً من for..of loop بالتسلسل لتسريع الاستعلامات في Cloudflare D1
  const updatePromises = descendants.map(async (descendantId) => {
    const descendant = categoryMap.get(descendantId);
    if (!descendant) return;

    const levelDiff = newParentLevel - (parentCategory?.level || 0);
    const newLevel = descendant.level + levelDiff;

    const oldPath = descendant.path || '';
    const parentOldPath = parentCategory?.path || '';
    const newPath = oldPath.replace(parentOldPath, newParentPath);

    return db
      .update(categories)
      .set({
        level: newLevel,
        path: newPath,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, descendantId), eq(categories.storeId, storeId)));
  });

  await Promise.all(updatePromises.filter(Boolean));
}

// ============================================================
// 🗑️ حذف قسم (Soft Delete)
// ============================================================

export async function deleteCategoryAction(
  categoryId: string
): Promise<CategoryActionResult> {
  const storeId = await getStoreId();
  const userId = await getCurrentUserId();
  const db = getDbInstance();

  return await safeExecute(async () => {
    const existing = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
    });

    if (!existing) {
      throw new SystemError({
        code: 'CATEGORY_NOT_FOUND',
        userMessage: 'القسم غير موجود أو لا يتبع متجرك',
        technicalMessage: `Category not found for deletion: ${categoryId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { categoryId, storeId },
      });
    }

    await db
      .update(categories)
      .set({
        deletedAt: new Date(),
        deletedBy: userId || null,
        updatedAt: new Date(),
        isActive: false,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.storeId, storeId)));

    await db
      .update(products)
      .set({
        categoryId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(products.categoryId, categoryId), eq(products.storeId, storeId)));

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: 'تم حذف القسم بنجاح',
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء حذف القسم',
    };
  });
}

// ============================================================
// 📦 حذف متعدد (Bulk Soft Delete)
// ============================================================

export async function bulkDeleteCategoriesAction(
  input: BulkDeleteCategoriesInput
): Promise<CategoryBulkActionResult> {
  const storeId = await getStoreId();
  const userId = await getCurrentUserId();
  const { categoryIds, cascade = false } = input;
  const db = getDbInstance();

  if (!categoryIds || categoryIds.length === 0) {
    return {
      success: false,
      message: 'لم يتم تحديد أقسام للحذف',
    };
  }

  return await safeExecute(async () => {
    let idsToDelete = [...categoryIds];

    if (cascade) {
      const allDescendants: string[] = [];
      for (const id of categoryIds) {
        const descendants = await getAllDescendantIds(id);
        allDescendants.push(...descendants);
      }
      idsToDelete = [...new Set([...categoryIds, ...allDescendants])];
    }

    const existingCategories = await db.query.categories.findMany({
      where: and(
        inArray(categories.id, idsToDelete),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
      columns: { id: true },
    });

    const existingIds = new Set(existingCategories.map((c) => c.id));
    const notFound = idsToDelete.filter((id) => !existingIds.has(id));

    if (notFound.length > 0) {
      return {
        success: false,
        message: `بعض الأقسام غير موجودة أو لا تتبع متجرك: ${notFound.join(', ')}`,
        affectedCount: existingIds.size,
      };
    }

    await db
      .update(categories)
      .set({
        deletedAt: new Date(),
        deletedBy: userId || null,
        updatedAt: new Date(),
        isActive: false,
      })
      .where(and(inArray(categories.id, idsToDelete), eq(categories.storeId, storeId)));

    await db
      .update(products)
      .set({
        categoryId: null,
        updatedAt: new Date(),
      })
      .where(and(inArray(products.categoryId, idsToDelete), eq(products.storeId, storeId)));

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: `تم حذف ${idsToDelete.length} قسم بنجاح`,
      affectedCount: idsToDelete.length,
      affectedIds: idsToDelete,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء حذف الأقسام',
    };
  });
}

// ============================================================
// 🔄 إعادة ترتيب الأقسام (Drag & Drop)
// ============================================================

export async function reorderCategoriesAction(
  input: ReorderCategoriesInput
): Promise<CategoryBulkActionResult> {
  const storeId = await getStoreId();
  const { categoryIds, parentId } = input;
  const db = getDbInstance();

  return await safeExecute(async () => {
    const existingCategories = await db.query.categories.findMany({
      where: and(
        inArray(categories.id, categoryIds),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
      columns: { id: true, parentId: true },
    });

    if (existingCategories.length !== categoryIds.length) {
      return {
        success: false,
        message: 'بعض الأقسام غير موجودة أو لا تتبع متجرك',
      };
    }

    const wrongParent = existingCategories.filter((c) => {
      if (parentId === null) {
        return c.parentId !== null;
      }
      return c.parentId !== parentId;
    });

    if (wrongParent.length > 0) {
      return {
        success: false,
        message: 'بعض الأقسام ليست في المستوى المطلوب لإعادة الترتيب',
        affectedCount: wrongParent.length,
        affectedIds: wrongParent.map((c) => c.id),
      };
    }

    const updatePromises = categoryIds.map((id, index) =>
      db
        .update(categories)
        .set({
          order: index,
          updatedAt: new Date(),
        })
        .where(and(eq(categories.id, id), eq(categories.storeId, storeId)))
    );

    await Promise.all(updatePromises);

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: `تم إعادة ترتيب ${categoryIds.length} قسم بنجاح`,
      affectedCount: categoryIds.length,
      affectedIds: categoryIds,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء إعادة ترتيب الأقسام',
    };
  });
}

// ============================================================
// 🔀 نقل قسم إلى أب جديد (Move)
// ============================================================

export async function moveCategoryAction(
  input: MoveCategoryInput
): Promise<CategoryActionResult<Category>> {
  const storeId = await getStoreId();
  const { categoryId, newParentId, position } = input;
  const db = getDbInstance();

  if (position !== undefined && (position < 0 || position > 10000)) {
    return {
      success: false,
      message: 'الموضع غير صالح (يجب أن يكون بين 0 و 10000)',
    };
  }

  return await safeExecute(async () => {
    const existing = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt)
      ),
    });

    if (!existing) {
      throw new SystemError({
        code: 'CATEGORY_NOT_FOUND',
        userMessage: 'القسم غير موجود أو لا يتبع متجرك',
        technicalMessage: `Category not found: ${categoryId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { categoryId, storeId },
      });
    }

    const hasCycle = await detectCircularReference(categoryId, newParentId);
    if (hasCycle) {
      throw new SystemError({
        code: 'CATEGORY_CIRCULAR_REFERENCE',
        userMessage: 'لا يمكن نقل القسم إلى أحد فروعه',
        technicalMessage: `Circular reference detected: ${categoryId} -> ${newParentId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { categoryId, newParentId, storeId },
      });
    }

    if (newParentId) {
      const parentExists = await checkCategoryExists(newParentId, storeId);
      if (!parentExists) {
        throw new SystemError({
          code: 'CATEGORY_PARENT_NOT_FOUND',
          userMessage: 'القسم الأب غير موجود',
          technicalMessage: `Parent category not found: ${newParentId}`,
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          metadata: { parentId: newParentId, storeId },
        });
      }
    }

    const newLevel = await calculateCategoryLevel(newParentId);
    const newPath = await buildCategoryPath(newParentId, existing.slug);

    const updateData: CategoryUpdateInput = {
      parentId: newParentId,
      level: newLevel,
      path: newPath,
      updatedAt: new Date(),
    };

    if (position !== undefined) {
      const siblings = await db.query.categories.findMany({
        where: and(
          newParentId === null
            ? isNull(categories.parentId)
            : eq(categories.parentId, newParentId),
          eq(categories.storeId, storeId),
          isNull(categories.deletedAt),
          sql`${categories.id} != ${categoryId}`
        ),
        orderBy: (categories, { asc }) => [asc(categories.order)],
        columns: { id: true, order: true },
      });

      const newOrder = Math.min(position, siblings.length);

      const reorderPromises = siblings
        .slice(newOrder)
        .map((sibling, index) =>
          db
            .update(categories)
            .set({
              order: newOrder + index + 1,
              updatedAt: new Date(),
            })
            .where(and(eq(categories.id, sibling.id), eq(categories.storeId, storeId)))
        );

      await Promise.all(reorderPromises);

      updateData.order = newOrder;
    }

    const [result] = await db
      .update(categories)
      .set(updateData)
      .where(and(eq(categories.id, categoryId), eq(categories.storeId, storeId)))
      .returning();

    if (!result) {
      throw new SystemError({
        code: 'CATEGORY_UPDATE_CONFLICT',
        userMessage: 'حدث تعارض أثناء النقل، يرجى إعادة المحاولة',
        technicalMessage: 'Atomic update returned no rows',
        category: 'business',
        severity: 'warning',
        retryable: true,
        shouldAlert: false,
      });
    }

    await updateDescendantsAfterMove(
      categoryId,
      existing.parentId,
      newLevel,
      newPath,
      storeId
    );

    // ⚡ Write-Through: إبطال/إعادة بناء الـ Snapshot فوراً في الـ KV
    await invalidateStoreSnapshot(storeId);

    return {
      success: true,
      message: 'تم نقل القسم بنجاح',
      data: result,
    };
  }).catch((error) => {
    return {
      success: false,
      message: error instanceof SystemError ? error.userMessage : 'حدث خطأ أثناء نقل القسم',
    };
  });
}