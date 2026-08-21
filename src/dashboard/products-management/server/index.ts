// src/dashboard/products-management/server/index.ts

// ============================================================
// 📤 تصدير جميع الـ Mutations و Queries و Helpers
// ============================================================

// الـ Mutations (Server Actions)
export {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  updateStockAction,
} from './product.mutations';

// الـ Queries
export {
  getProductAction,
  listProductsAction,
} from './product.queries';


// ============================================================
// 📦 إعادة تصدير الأنواع (من product.types)
// ============================================================

export type {
  Product,
  NewProduct,
  ProductImage,
  ProductVariant,
  ProductMetadata,
  CreateProductPayload,
  UpdateProductPayload,
  ProductInput,
  ProductUpdateInput,
  ProductListFilters,
  ProductSortOptions,
  ProductPaginationOptions,
  ProductListParams,
  ProductActionResult,
  ProductListResult,
  CreateProductMutationVariables,
  UpdateProductMutationVariables,
  DeleteProductMutationVariables,
  UpdateStockMutationVariables,
} from '../types/product.types';