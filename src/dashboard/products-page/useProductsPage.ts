// src/dashboard/products-page/useProductsPage.ts

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';

import { listProductsAction } from '@/dashboard/products-management/server';
import { getCategoryFilterOptionsQuery } from '@/dashboard/categories-management/server';
import { useProductMutations } from '@/dashboard/products-management/hooks';
import { useSession } from '@/lib/auth-client';

export function useProductsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  // حالة الفلترة والصفحات
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  // معالجات تغيير الفلتر مع ريست تلقائي للصفحة إلى 1
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setPage(1);
  }, []);

  // جلب خيارات الأقسام
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categoryFilterOptions'],
    queryFn: async () => {
      const result = await getCategoryFilterOptionsQuery();
      if (!result.success) {
        throw new Error(result.message || 'فشل جلب الأقسام');
      }
      return result.data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // جلب المنتجات
  // جلب المنتجات
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCategoryId, debouncedSearch, page],
    queryFn: async () => {
      const result = await listProductsAction({
        page,
        limit,
        search: debouncedSearch || undefined,
        categoryId: selectedCategoryId || undefined,
        isPublished: undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // التحقق الأمني من الـ Error State بأسلوب Safe Type Guard
      if (result && 'success' in result && result.success === false) {
        throw new Error((result as { message?: string }).message || 'فشل جلب المنتجات');
      }

      return result;
    },
    staleTime: 1000 * 30,
  });
  // استخراج storeId / merchantId بأمان من الـ session
  const storeId = (session?.user as { merchantId?: string })?.merchantId || '';

  // Mutations
  const { deleteProduct, updateStock } = useProductMutations(storeId);

  // معالج حذف المنتج
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteProduct.mutateAsync(id);
        toast.success('تم حذف المنتج بنجاح');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'فشل حذف المنتج');
      }
    },
    [deleteProduct]
  );

  // معالج تحديث المخزون
  const handleStockUpdate = useCallback(
    async (id: string, newStock: number) => {
      try {
        await updateStock.mutateAsync({
          productId: id,
          newStock,
        });
        toast.success('تم تحديث المخزون بنجاح');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'فشل تحديث المخزون');
      }
    },
    [updateStock]
  );

  return {
    state: {
      search,
      selectedCategoryId,
      page,
      categories: categoriesData || [],
      products: productsData?.items || [],
      pagination: productsData?.pagination,
      isLoading: productsLoading,
      isCategoriesLoading: categoriesLoading,
    },
    actions: {
      setSearch: handleSearchChange,
      setSelectedCategoryId: handleCategoryChange,
      setPage,
      handleDelete,
      handleStockUpdate,
      navigateToNewProduct: () => router.push('/dashboard/products/new'),
    },
  };
}