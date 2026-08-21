// src/app/[locale]/(dashboard)/dashboard/products/page.tsx

'use client';

import { Plus, Search, Filter, X } from 'lucide-react';
import Button from '@/components/shared/Button';
import { Input } from '@/components/shared/Input/Input';

import {
  CategoryFilterRibbon,
  ProductQuickTable,
  useProductsPage,
} from '@/dashboard/products-page';

export default function ProductsPage() {
  const { state, actions } = useProductsPage();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">المنتجات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة جميع منتجات متجرك
          </p>
        </div>
        <Button onClick={actions.navigateToNewProduct} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة منتج
        </Button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث في المنتجات..."
            value={state.search}
            onChange={(e) => actions.setSearch(e.target.value)}
            className="ps-9 pe-9"
          />
          {state.search && (
            <button
              type="button"
              onClick={() => actions.setSearch('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            فلتر متقدم
          </Button>
        </div>
      </div>

      {/* Category Filter Ribbon */}
      <CategoryFilterRibbon
        categories={state.categories}
        selectedCategoryId={state.selectedCategoryId}
        onSelect={actions.setSelectedCategoryId}
        isLoading={state.isCategoriesLoading}
      />

      {/* Table */}
      <ProductQuickTable
        products={state.products}
        isLoading={state.isLoading}
        onStockUpdate={actions.handleStockUpdate}
        onDelete={actions.handleDelete}
      />

      {/* Pagination */}
      {state.pagination && state.pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            إجمالي المنتجات: <strong>{state.pagination.total}</strong>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={state.page === 1}
              onClick={() => actions.setPage(state.page - 1)}
            >
              السابق
            </Button>
            <span className="text-sm font-medium px-2 font-mono">
              {state.page} من {state.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={state.page === state.pagination.totalPages}
              onClick={() => actions.setPage(state.page + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}