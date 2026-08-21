// src/dashboard/categories-management/server/index.ts

// ============================================================
// 📤 تصدير جميع الـ Actions و Queries و Helpers الخاصة بالأقسام
// ============================================================

// الـ Mutations (عمليات الكتابة)
export {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  bulkDeleteCategoriesAction,
  reorderCategoriesAction,
  moveCategoryAction,
} from './category.mutations';

// الـ Queries (عمليات القراءة)
export {
  getCategoryQuery,
  listCategoriesQuery,
  getCategoryTreeQuery,
  getCategoryChildrenQuery,
  getCategoryFilterOptionsQuery,
  searchCategoriesQuery,
  getFlatCategoriesQuery, // ✅ تمت الإضافة
} from './category.queries';


// ============================================================
// 📦 إعادة تصدير الأنواع (من category.types)
// ============================================================

export type {
  Category,
  NewCategory,
  CategoryTree,
  CategoryFlat,
  CategoryBreadcrumb,
  CategoryListParams,
  CategoryListResult,
  CategoryTreeResult,
  CategoryWithStats,
  ReorderCategoriesInput,
  MoveCategoryInput,
  BulkDeleteCategoriesInput,
  CategoryFilterOption,
  CategoryTreeUIState,
  CategoryActionResult,
  CategoryBulkActionResult,
  ExtractActionResultData,
  CategoryTreeQueryResult,
  CategoryMutationCallbacks,
} from '../types/category.types';

// 💡 إعادة تصدير types الـ Validations لتجنب أخطاء الاستيراد
export type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@/lib/validations/category';