// src/dashboard/products-management/hooks/index.ts

// ============================================================
// 📤 تصدير جميع الـ Hooks
// ============================================================

export {
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useUpdateStock,
  useProductMutations,
} from './useProductMutations';

// ============================================================
// 📦 إعادة تصدير الأنواع الخاصة بالـ Hooks
// ============================================================

export type {
  CreateProductMutationVariables,
  UpdateProductMutationVariables,
  DeleteProductMutationVariables,
  UpdateStockMutationVariables,
} from '../types/product.types';