// src/dashboard/products-management/hooks/useProductMutations.ts

'use client';

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { Product, ProductMetadata } from '@/lib/db/schema/products';
import type {
  CreateProductInput,
  UpdateProductInput,
} from '@/lib/validations/product';

import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  updateStockAction,
} from '@/dashboard/products-management/server/product.mutations';

// ============================================================
// 📦 أنواع (Types) صريحة وبدون any
// ============================================================

interface ServerActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ProductListQueryData {
  data: Product[];
  pagination: PaginationState;
}

interface MutationContext {
  previousList?: ProductListQueryData;
  previousProduct?: Product;
  optimisticId?: string;
}

// ============================================================
// 🧰 دوال مساعدة (Internal Helpers)
// ============================================================

function removeOptimisticProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
  optimisticId: string
) {
  const currentData = queryClient.getQueryData<ProductListQueryData>([
    'products',
    storeId,
  ]);

  if (currentData?.data.some((p: Product) => p.id === optimisticId)) {
    queryClient.setQueryData<ProductListQueryData>(['products', storeId], {
      ...currentData,
      data: currentData.data.filter((p: Product) => p.id !== optimisticId),
      pagination: {
        ...currentData.pagination,
        total: Math.max(0, currentData.pagination.total - 1),
      },
    });
  }
}

function parseDimension(val: number | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  return String(val);
}

// ============================================================
// 🚀 Hook: إنشاء منتج جديد
// ============================================================

export function useCreateProduct(storeId: string) {
  const queryClient = useQueryClient();

  const internalOptions: UseMutationOptions<
    ServerActionResult<Product>,
    Error,
    CreateProductInput,
    MutationContext
  > = {
    mutationFn: async (input: CreateProductInput) => {
      const result = await createProductAction(input);
      if (!result.success) {
        throw new Error(result.message || 'فشل إنشاء المنتج');
      }
      return result as ServerActionResult<Product>;
    },

    onMutate: async (input: CreateProductInput) => {
      await queryClient.cancelQueries({ queryKey: ['products', storeId] });

      const previousList = queryClient.getQueryData<ProductListQueryData>([
        'products',
        storeId,
      ]);

      const optimisticId = `optimistic_${Date.now()}`;
      const optimisticProduct: Product = {
        id: optimisticId,
        storeId,
        categoryId: input.categoryId ?? null,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        shortDescription: input.shortDescription ?? null,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        cost: input.cost ?? null,
        stock: input.stock,
        lowStockThreshold: input.lowStockThreshold,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        weight: parseDimension(input.weight),
        length: parseDimension(input.length),
        width: parseDimension(input.width),
        height: parseDimension(input.height),
        mediaIds: [],
        images: input.images,
        videoUrl: input.videoUrl ?? null,
        imageSrc: input.images.length > 0 ? input.images[0].url : null,
        variants: input.variants,
        variantPrices: input.variantPrices,
        haggleEnabled: input.haggleEnabled,
        minPrice: input.minPrice ?? null,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        isPublished: input.isPublished,
        isFeatured: input.isFeatured,
        metadata: (input.metadata as ProductMetadata) ?? {},
        deletedAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], {
          ...previousList,
          data: [optimisticProduct, ...previousList.data],
          pagination: {
            ...previousList.pagination,
            total: previousList.pagination.total + 1,
          },
        });
      }

      return { previousList, optimisticId };
    },

    onSuccess: (
      data: ServerActionResult<Product>,
      _variables: CreateProductInput,
      context?: MutationContext
    ) => {
      toast.success(data.message || 'تم إضافة المنتج بنجاح');
      if (context?.optimisticId) {
        removeOptimisticProduct(queryClient, storeId, context.optimisticId);
      }
    },

    onError: (
      error: Error,
      _variables: CreateProductInput,
      context?: MutationContext
    ) => {
      if (context?.previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], context.previousList);
      }
      toast.error(error.message || 'فشل إنشاء المنتج');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
    },
  };

  return useMutation(internalOptions);
}

// ============================================================
// 🔄 Hook: تحديث منتج
// ============================================================

export function useUpdateProduct(storeId: string) {
  const queryClient = useQueryClient();

  interface UpdateVariables {
    productId: string;
    input: UpdateProductInput;
  }

  const internalOptions: UseMutationOptions<
    ServerActionResult<Product>,
    Error,
    UpdateVariables,
    MutationContext
  > = {
    mutationFn: async ({ productId, input }: UpdateVariables) => {
      const result = await updateProductAction(productId, input);
      if (!result.success) {
        throw new Error(result.message || 'فشل تحديث المنتج');
      }
      return result as ServerActionResult<Product>;
    },

    onMutate: async (variables: UpdateVariables) => {
      const { productId, input } = variables;
      await queryClient.cancelQueries({ queryKey: ['product', productId] });
      await queryClient.cancelQueries({ queryKey: ['products', storeId] });

      const previousProduct = queryClient.getQueryData<Product>(['product', productId]);
      const previousList = queryClient.getQueryData<ProductListQueryData>([
        'products',
        storeId,
      ]);

      const { weight, length, width, height, metadata, ...restInput } = input;

      const formattedDimensions = {
        ...(weight !== undefined && { weight: parseDimension(weight) }),
        ...(length !== undefined && { length: parseDimension(length) }),
        ...(width !== undefined && { width: parseDimension(width) }),
        ...(height !== undefined && { height: parseDimension(height) }),
      };

      if (previousProduct) {
        const updatedProduct: Product = {
          ...previousProduct,
          ...restInput,
          ...formattedDimensions,
          metadata: metadata
            ? (metadata as ProductMetadata)
            : previousProduct.metadata,
          updatedAt: new Date(),
          version: previousProduct.version + 1,
        };
        queryClient.setQueryData<Product>(['product', productId], updatedProduct);
      }

      if (previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], {
          ...previousList,
          data: previousList.data.map((p: Product): Product =>
            p.id === productId
              ? {
                  ...p,
                  ...restInput,
                  ...formattedDimensions,
                  metadata: metadata
                    ? (metadata as ProductMetadata)
                    : p.metadata,
                  updatedAt: new Date(),
                  version: p.version + 1,
                }
              : p
          ),
        });
      }

      return { previousProduct, previousList };
    },

    onSuccess: (data: ServerActionResult<Product>) => {
      toast.success(data.message || 'تم تحديث المنتج بنجاح');
    },

    onError: (
      error: Error,
      variables: UpdateVariables,
      context?: MutationContext
    ) => {
      if (context?.previousProduct) {
        queryClient.setQueryData<Product>(['product', variables.productId], context.previousProduct);
      }
      if (context?.previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], context.previousList);
      }
      toast.error(error.message || 'فشل تحديث المنتج');
    },

    onSettled: (
      _data: ServerActionResult<Product> | undefined,
      _error: Error | null,
      variables: UpdateVariables
    ) => {
      queryClient.invalidateQueries({ queryKey: ['product', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
    },
  };

  return useMutation(internalOptions);
}

// ============================================================
// 🗑️ Hook: حذف منتج (Soft Delete)
// ============================================================

export function useDeleteProduct(storeId: string) {
  const queryClient = useQueryClient();

  const internalOptions: UseMutationOptions<
    ServerActionResult,
    Error,
    string,
    MutationContext
  > = {
    mutationFn: async (productId: string) => {
      const result = await deleteProductAction(productId);
      if (!result.success) {
        throw new Error(result.message || 'فشل حذف المنتج');
      }
      return result;
    },

    onMutate: async (productId: string) => {
      await queryClient.cancelQueries({ queryKey: ['products', storeId] });

      const previousList = queryClient.getQueryData<ProductListQueryData>([
        'products',
        storeId,
      ]);

      if (previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], {
          ...previousList,
          data: previousList.data.filter((p: Product) => p.id !== productId),
          pagination: {
            ...previousList.pagination,
            total: Math.max(0, previousList.pagination.total - 1),
          },
        });
      }

      return { previousList };
    },

    onSuccess: (data: ServerActionResult) => {
      toast.success(data.message || 'تم حذف المنتج بنجاح');
    },

    onError: (
      error: Error,
      _productId: string,
      context?: MutationContext
    ) => {
      if (context?.previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], context.previousList);
      }
      toast.error(error.message || 'فشل حذف المنتج');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
    },
  };

  return useMutation(internalOptions);
}

// ============================================================
// 📦 Hook: تحديث المخزون بشكل ذري
// ============================================================

export function useUpdateStock(storeId: string) {
  const queryClient = useQueryClient();

  interface StockVariables {
    productId: string;
    newStock: number;
  }

  type StockResult = ServerActionResult<{ stock: number; version: number }>;

  const internalOptions: UseMutationOptions<
    StockResult,
    Error,
    StockVariables,
    MutationContext
  > = {
    mutationFn: async ({ productId, newStock }: StockVariables) => {
      if (newStock < 0) {
        throw new Error('المخزون لا يمكن أن يكون سالباً');
      }
      const result = await updateStockAction(productId, newStock);
      if (!result.success) {
        throw new Error(result.message || 'فشل تحديث المخزون');
      }
      return result as StockResult;
    },

    onMutate: async (variables: StockVariables) => {
      const { productId, newStock } = variables;
      await queryClient.cancelQueries({ queryKey: ['product', productId] });
      await queryClient.cancelQueries({ queryKey: ['products', storeId] });

      const previousProduct = queryClient.getQueryData<Product>(['product', productId]);
      const previousList = queryClient.getQueryData<ProductListQueryData>([
        'products',
        storeId,
      ]);

      if (previousProduct) {
        queryClient.setQueryData<Product>(['product', productId], {
          ...previousProduct,
          stock: newStock,
          updatedAt: new Date(),
          version: previousProduct.version + 1,
        });
      }

      if (previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], {
          ...previousList,
          data: previousList.data.map((p: Product) =>
            p.id === productId
              ? { ...p, stock: newStock, updatedAt: new Date(), version: p.version + 1 }
              : p
          ),
        });
      }

      return { previousProduct, previousList };
    },

    onSuccess: (data: StockResult) => {
      toast.success(data.message || `تم تحديث المخزون إلى ${data.data?.stock}`);
    },

    onError: (
      error: Error,
      variables: StockVariables,
      context?: MutationContext
    ) => {
      if (context?.previousProduct) {
        queryClient.setQueryData<Product>(['product', variables.productId], context.previousProduct);
      }
      if (context?.previousList) {
        queryClient.setQueryData<ProductListQueryData>(['products', storeId], context.previousList);
      }
      toast.error(error.message || 'فشل تحديث المخزون');
    },

    onSettled: (
      _data: StockResult | undefined,
      _error: Error | null,
      variables: StockVariables
    ) => {
      queryClient.invalidateQueries({ queryKey: ['product', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['store-snapshot', storeId] });
    },
  };

  return useMutation(internalOptions);
}

// ============================================================
// 📤 Export موحد
// ============================================================

export function useProductMutations(storeId: string) {
  return {
    createProduct: useCreateProduct(storeId),
    updateProduct: useUpdateProduct(storeId),
    deleteProduct: useDeleteProduct(storeId),
    updateStock: useUpdateStock(storeId),
  };
}