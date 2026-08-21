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
  previousLists?: [readonly unknown[], CategoryListResult | undefined][];
  previousTree?: CategoryTree[];
  previousCategory?: Category;
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

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      // 1. تعريف المتغير optimisticId
      const optimisticId = `optimistic_${Date.now()}`;

      // 2. تكوين الـ Optimistic Object بالكامل بدون أي ناقص في الحقول
      const optimisticCategory: Category = {
        id: optimisticId,
        storeId,
        parentId: input.parentId || null,
        name: input.name,
        slug: input.slug || 'optimistic-slug',
        description: input.description || null,
        image: null,
        level: input.parentId ? 1 : 0,
        path: null,
        mediaIds: [],
        order: input.order || 0,
        productsCount: 0,
        isActive: input.isActive ?? true,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: [optimisticCategory, ...old.data],
            pagination: {
              ...old.pagination,
              total: old.pagination.total + 1,
            },
          };
        }
      );

      return { previousLists, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم إضافة القسم بنجاح');
    },

    onError: (error, _variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
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
      const { categoryId, input } = variables;
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });
      await queryClient.cancelQueries({ queryKey: ['category', categoryId] });

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);
      const previousCategory = queryClient.getQueryData<Category>(['category', categoryId]);

      if (previousCategory) {
        queryClient.setQueryData<Category>(['category', categoryId], {
          ...previousCategory,
          ...input,
          updatedAt: new Date(),
        });
      }

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((c) =>
              c.id === categoryId ? { ...c, ...input, updatedAt: new Date() } : c
            ),
          };
        }
      );

      return { previousLists, previousTree, previousCategory };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم تحديث القسم بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousTree) {
        queryClient.setQueryData(['categories-tree', storeId], context.previousTree);
      }
      if (context?.previousCategory) {
        queryClient.setQueryData(['category', variables.categoryId], context.previousCategory);
      }
      toast.error(error.message || 'فشل تحديث القسم');
    },

    onSettled: (_data, _error, variables) => {
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
      const { categoryId } = variables;
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter((c) => c.id !== categoryId),
            pagination: {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1),
            },
          };
        }
      );

      return { previousLists, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم حذف القسم بنجاح');
    },

    onError: (error, _variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
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

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);
      const idsToDelete = new Set(variables.input.categoryIds);

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter((c) => !idsToDelete.has(c.id)),
            pagination: {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - variables.input.categoryIds.length),
            },
          };
        }
      );

      return { previousLists, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم حذف الأقسام بنجاح');
    },

    onError: (error, _variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
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

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          const categoryMap = new Map<string, Category>(old.data.map((c) => [c.id, c]));

          const reordered = variables.input.categoryIds
            .map((id, index) => {
              const cat = categoryMap.get(id);
              return cat ? { ...cat, order: index, updatedAt: new Date() } : null;
            })
            .filter((c): c is Category => c !== null);

          const others = old.data.filter((c) => !variables.input.categoryIds.includes(c.id));

          return {
            ...old,
            data: [...reordered, ...others],
          };
        }
      );

      return { previousLists, previousTree };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم إعادة ترتيب الأقسام بنجاح');
    },

    onError: (error, _variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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
      const { categoryId, newParentId } = variables.input;
      await queryClient.cancelQueries({ queryKey: ['categories', storeId] });
      await queryClient.cancelQueries({ queryKey: ['categories-tree', storeId] });
      await queryClient.cancelQueries({ queryKey: ['category', categoryId] });

      const previousLists = queryClient.getQueriesData<CategoryListResult>({
        queryKey: ['categories', storeId],
      });
      const previousTree = queryClient.getQueryData<CategoryTree[]>(['categories-tree', storeId]);
      const previousCategory = queryClient.getQueryData<Category>(['category', categoryId]);

      if (previousCategory) {
        queryClient.setQueryData<Category>(['category', categoryId], {
          ...previousCategory,
          parentId: newParentId,
          updatedAt: new Date(),
        });
      }

      queryClient.setQueriesData<CategoryListResult>(
        { queryKey: ['categories', storeId] },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((c) =>
              c.id === categoryId ? { ...c, parentId: newParentId, updatedAt: new Date() } : c
            ),
          };
        }
      );

      return { previousLists, previousTree, previousCategory };
    },

    onSuccess: (data) => {
      toast.success(data.message || 'تم نقل القسم بنجاح');
    },

    onError: (error, variables, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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