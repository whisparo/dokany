// src/dashboard/categories-management/hooks/useCategoryMutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  bulkDeleteCategoriesAction,
  reorderCategoriesAction,
  moveCategoryAction,
} from '../server';

import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ReorderCategoriesInput,
  MoveCategoryInput,
  BulkDeleteCategoriesInput,
  Category,
  CategoryActionResult,
  CategoryBulkActionResult,
  CategoryTree,
  CategoryListResult,
} from '../types/category.types';

// ============================================================
// 📦 Types & Helpers
// ============================================================

interface MutationContext {
  previousList?: CategoryListResult;
  previousTree?: CategoryTree[];
  previousCategory?: Category;
  optimisticId?: string;
}

function updateCategoryInList(
  list: CategoryListResult | undefined,
  categoryId: string,
  updates: Partial<Category>
): CategoryListResult | undefined {
  if (!list?.data) return list;

  return {
    ...list,
    data: list.data.map((c) =>
      c.id === categoryId ? { ...c, ...updates, updatedAt: new Date() } : c
    ),
  };
}

function removeCategoryFromList(
  list: CategoryListResult | undefined,
  categoryId: string
): CategoryListResult | undefined {
  if (!list?.data) return list;

  return {
    ...list,
    data: list.data.filter((c) => c.id !== categoryId),
    pagination: {
      ...list.pagination,
      total: Math.max(0, list.pagination.total - 1),
    },
  };
}

// ============================================================
// 🆕 إنشاء قسم
// ============================================================

export function useCreateCategory(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation<CategoryActionResult<Category>, Error, CreateCategoryInput, MutationContext>({
    mutationFn: async (input) => {
      const result = await createCategoryAction(input);
      if (!result.success) {
        throw new Error(result.message || 'فشل إنشاء القسم');
      }
      return result;
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      const optimisticId = `optimistic_${Date.now()}`;
      const optimisticCategory: Partial<Category> = {
        id: optimisticId,
        storeId,
        parentId: input.parentId || null,
        name: input.name,
        slug: input.slug || 'optimistic-slug',
        description: input.description || null,
        order: input.order || 0,
        productsCount: 0,
        isActive: input.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (previousList?.data) {
        queryClient.setQueryData(['categories', storeId], {
          ...previousList,
          data: [optimisticCategory as Category, ...previousList.data],
          pagination: {
            ...previousList.pagination,
            total: previousList.pagination.total + 1,
          },
        });
      }

      return { previousList, previousTree, optimisticId };
    },

    onSuccess: (data, variables, context) => {
      toast.success(data.message || 'تم إضافة القسم بنجاح');

      if (data.data && context?.optimisticId) {
        const currentList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
        if (currentList?.data) {
          queryClient.setQueryData(['categories', storeId], {
            ...currentList,
            data: currentList.data.map((item) =>
              item.id === context.optimisticId ? data.data! : item
            ),
          });
        }
      }
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      toast.error(error.message || 'فشل إنشاء القسم');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}

// ============================================================
// ✏️ تحديث قسم
// ============================================================

export function useUpdateCategory(storeId: string) {
  const queryClient = useQueryClient();

  type Variables = { categoryId: string; input: UpdateCategoryInput };

  return useMutation<CategoryActionResult<Category>, Error, Variables, MutationContext>({
    mutationFn: async ({ categoryId, input }) => {
      const result = await updateCategoryAction(categoryId, input);
      if (!result.success) {
        throw new Error(result.message || 'فشل تحديث القسم');
      }
      return result;
    },

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });
      await queryClient.cancelQueries({ queryKey: ['category', variables.categoryId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);
      const previousCategory = queryClient.getQueryData<Category>(['category', variables.categoryId]);

      if (previousList) {
        queryClient.setQueryData(
          ['categories', storeId],
          updateCategoryInList(previousList, variables.categoryId, variables.input)
        );
      }

      if (previousCategory) {
        queryClient.setQueryData(['category', variables.categoryId], {
          ...previousCategory,
          ...variables.input,
          updatedAt: new Date(),
        });
      }

      return { previousList, previousTree, previousCategory };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم تحديث القسم بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      if (context?.previousCategory) {
        queryClient.setQueryData(['category', variables.categoryId], context.previousCategory);
      }
      toast.error(error.message || 'فشل تحديث القسم');
    },

    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['category', variables.categoryId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}

// ============================================================
// 🗑️ حذف قسم (فردي)
// ============================================================

export function useDeleteCategory(storeId: string) {
  const queryClient = useQueryClient();

  type Variables = { categoryId: string };

  return useMutation<CategoryActionResult, Error, Variables, MutationContext>({
    mutationFn: async ({ categoryId }) => {
      const result = await deleteCategoryAction(categoryId);
      if (!result.success) {
        throw new Error(result.message || 'فشل حذف القسم');
      }
      return result;
    },

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      if (previousList) {
        queryClient.setQueryData(
          ['categories', storeId],
          removeCategoryFromList(previousList, variables.categoryId)
        );
      }

      return { previousList, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم حذف القسم بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      toast.error(error.message || 'فشل حذف القسم');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}

// ============================================================
// 📦 حذف متعدد (Bulk Delete)
// ============================================================

export function useBulkDeleteCategories(storeId: string) {
  const queryClient = useQueryClient();

  type Variables = { input: BulkDeleteCategoriesInput };

  return useMutation<CategoryBulkActionResult, Error, Variables, MutationContext>({
    mutationFn: async ({ input }) => {
      const result = await bulkDeleteCategoriesAction(input);
      if (!result.success) {
        throw new Error(result.message || 'فشل حذف الأقسام');
      }
      return result;
    },

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      if (previousList?.data) {
        const idsToDelete = new Set(variables.input.categoryIds);
        queryClient.setQueryData(['categories', storeId], {
          ...previousList,
          data: previousList.data.filter((c) => !idsToDelete.has(c.id)),
          pagination: {
            ...previousList.pagination,
            total: Math.max(0, previousList.pagination.total - variables.input.categoryIds.length),
          },
        });
      }

      return { previousList, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || `تم حذف الأقسام بنجاح`);
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      toast.error(error.message || 'فشل حذف الأقسام');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}

// ============================================================
// 🔄 إعادة ترتيب الأقسام (Drag & Drop)
// ============================================================

export function useReorderCategories(storeId: string) {
  const queryClient = useQueryClient();

  type Variables = { input: ReorderCategoriesInput };

  return useMutation<CategoryBulkActionResult, Error, Variables, MutationContext>({
    mutationFn: async ({ input }) => {
      const result = await reorderCategoriesAction(input);
      if (!result.success) {
        throw new Error(result.message || 'فشل إعادة ترتيب الأقسام');
      }
      return result;
    },

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      if (previousList?.data) {
        const categoryMap = new Map<string, Category>(
          previousList.data.map((c) => [c.id, c])
        );

        const reordered = variables.input.categoryIds
          .map((id, index) => {
            const cat = categoryMap.get(id);
            return cat ? { ...cat, order: index, updatedAt: new Date() } : null;
          })
          .filter((c): c is Category => c !== null);

        const others = previousList.data.filter(
          (c) => !variables.input.categoryIds.includes(c.id)
        );

        queryClient.setQueryData(['categories', storeId], {
          ...previousList,
          data: [...reordered, ...others],
        });
      }

      return { previousList, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم إعادة ترتيب الأقسام بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      toast.error(error.message || 'فشل إعادة ترتيب الأقسام');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}

// ============================================================
// 🔀 نقل قسم
// ============================================================

export function useMoveCategory(storeId: string) {
  const queryClient = useQueryClient();

  type Variables = { input: MoveCategoryInput };

  return useMutation<CategoryActionResult<Category>, Error, Variables, MutationContext>({
    mutationFn: async ({ input }) => {
      const result = await moveCategoryAction(input);
      if (!result.success) {
        throw new Error(result.message || 'فشل نقل القسم');
      }
      return result;
    },

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });
      await queryClient.cancelQueries({ queryKey: ['category', variables.input.categoryId] });

      const previousList = queryClient.getQueryData<CategoryListResult>(['categories', storeId]);
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);
      const previousCategory = queryClient.getQueryData<Category>(['category', variables.input.categoryId]);

      if (previousList) {
        queryClient.setQueryData(
          ['categories', storeId],
          updateCategoryInList(previousList, variables.input.categoryId, {
            parentId: variables.input.newParentId,
          })
        );
      }

      if (previousCategory) {
        queryClient.setQueryData(['category', variables.input.categoryId], {
          ...previousCategory,
          parentId: variables.input.newParentId,
          updatedAt: new Date(),
        });
      }

      return { previousList, previousTree, previousCategory };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم نقل القسم بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['categories', storeId], context.previousList);
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      if (context?.previousCategory) {
        queryClient.setQueryData(['category', variables.input.categoryId], context.previousCategory);
      }
      toast.error(error.message || 'فشل نقل القسم');
    },

    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      queryClient.invalidateQueries({ queryKey: ['categories-tree', storeId] });
      queryClient.invalidateQueries({ queryKey: ['category', variables.input.categoryId] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat', storeId] });
    },
  });
}