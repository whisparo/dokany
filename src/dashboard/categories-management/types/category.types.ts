// src/dashboard/categories-management/types/category.types.ts
import type { Category, NewCategory } from '@/lib/db/schema/categories';
import type { CreateCategoryInput, UpdateCategoryInput } from '@/lib/validations/category';

// ============================================================
// 📦 Re-exports من السكيما والـ Validations
// ============================================================
export type { Category, NewCategory, CreateCategoryInput, UpdateCategoryInput };

// ============================================================
// 🌳 أنواع الشجرة الهرمية (Tree Types)
// ============================================================

/**
 * قسم مع أطفاله (للعرض الهرمي في الـ Sidebar والـ Tree View)
 */
export interface CategoryTree extends Category {
  children?: CategoryTree[];
  /** عدد المنتجات في القسم وأقسامه الفرعية (للـ Badges) */
  totalProductsCount?: number;
}

/**
 * قسم مسطح (Flat) - أسرع للـ Filter Ribbon والـ Dropdowns
 * يحتوي على path كامل للعرض: "إلكترونيات > هواتف > آيفون"
 */
export interface CategoryFlat extends Category {
  /** الـ path الكامل للعرض: ["إلكترونيات", "هواتف", "آيفون"] */
  breadcrumb: string[];
  /** الـ depth (نفس الـ level، لكن بوضوح) */
  depth: number;
  /** هل عنده أطفال؟ (للـ lazy loading) */
  hasChildren: boolean;
}

// ============================================================
// 🧭 أنواع التنقل (Navigation Types)
// ============================================================

/**
 * عنصر في الـ Breadcrumb
 * @example
 * [{ id: "cat_1", name: "إلكترونيات", slug: "electronics" },
 *  { id: "cat_2", name: "هواتف", slug: "phones" }]
 */
export interface CategoryBreadcrumb {
  id: string;
  name: string;
  slug: string;
  level: number;
}

// ============================================================
// 📊 أنواع الاستعلامات (Query Types)
// ============================================================

/**
 * معاملات استعلام قائمة الأقسام
 */
export interface CategoryListParams {
  page?: number;
  limit?: number;
  search?: string;
  /** فلترة حسب القسم الأب (null = الأقسام الجذرية فقط) */
  parentId?: string | null;
  isActive?: boolean;
  /** تضمين الأقسام غير النشطة (للأدمن) */
  includeInactive?: boolean;
  /** تضمين الأقسام المحذوفة (للأرشيف) */
  includeDeleted?: boolean;
  /** الحد الأقصى للعمق (للشجرة، 0 = كل المستويات) */
  maxDepth?: number;
  sortBy?: 'name' | 'order' | 'createdAt' | 'productsCount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * نتيجة استعلام قائمة الأقسام
 */
export interface CategoryListResult {
  data: Category[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** للـ infinite scroll */
    hasMore: boolean;
  };
}

/**
 * نتيجة استعلام الشجرة الكاملة
 */
export interface CategoryTreeResult {
  tree: CategoryTree[];
  /** العدد الكلي للأقسام (بما فيها الفرعية) */
  totalCount: number;
  /** أقصى عمق في الشجرة */
  maxDepth: number;
}

// ============================================================
// 📈 أنواع العرض الموسع (Extended Types)
// ============================================================

/**
 * قسم مع الإحصائيات الموسعة (للـ Dashboard Cards)
 */
export interface CategoryWithStats extends Category {
  stats: {
    /** عدد المنتجات المباشر في القسم */
    directProductsCount: number;
    /** عدد المنتجات الكلي (بما فيها الأقسام الفرعية) */
    totalProductsCount: number;
    /** عدد الأقسام الفرعية المباشرة */
    directChildrenCount: number;
    /** عدد الأقسام الفرعية الكلي (recursive) */
    totalDescendantsCount: number;
  };
}

// ============================================================
// ✏️ أنواع عمليات التحديث الهرمية (Hierarchical Mutations)
// ============================================================

/**
 * إدخال عملية إعادة ترتيب الأقسام (Drag & Drop)
 * @description ذري - بيحلل الترتيب السابق ويعيد كتابته
 */
export interface ReorderCategoriesInput {
  /** قائمة الـ IDs بالترتيب الجديد (في نفس المستوى) */
  categoryIds: string[];
  /** القسم الأب المشترك (null = الأقسام الجذرية) */
  parentId: string | null;
}

/**
 * إدخال عملية نقل قسم من أب لآخر
 * @description بيحدث parentId + path + level لكل الأحفاد
 */
export interface MoveCategoryInput {
  categoryId: string;
  newParentId: string | null;
  /** الموضع الجديد بين الأخوات (0 = أول واحد) */
  position?: number;
}

/**
 * إدخال عملية حذف متعدد (Bulk Soft Delete)
 */
export interface BulkDeleteCategoriesInput {
  categoryIds: string[];
  /** حذف الأقسام الفرعية تلقائياً؟ (default: false) */
  cascade?: boolean;
}

// ============================================================
// 🎨 أنواع واجهة المستخدم (UI Types)
// ============================================================

/**
 * عنصر في الـ Filter Ribbon (الـ Tabs المنسدلة)
 */
export interface CategoryFilterOption {
  id: string;
  name: string;
  slug: string;
  /** عدد المنتجات في القسم (للـ Badge) */
  productsCount: number;
  /** المستوى (0 = جذر، 1 = فرعي، إلخ) */
  level: number;
  /** الأقسام الفرعية (للـ Dropdown) */
  children?: CategoryFilterOption[];
}

/**
 * حالة الـ Tree View في الـ UI
 */
export interface CategoryTreeUIState {
  /** الأقسام المفتوحة (expanded) */
  expandedIds: Set<string>;
  /** القسم المحدد حالياً */
  selectedId: string | null;
  /** القسم اللي بيتم سحبه */
  draggingId: string | null;
  /** هدف الإفلات */
  dropTargetId: string | null;
}

// ============================================================
// 📦 أنواع النتائج الموحدة (Unified Result Types)
// ============================================================

/**
 * نتيجة عملية على الأقسام (موحدة لكل الـ mutations)
 * ✅ تم التحسين: T = unknown بدل any (Type Safety)
 */
export interface CategoryActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
  /** Correlation ID للتتبع في نظام الأخطاء */
  correlationId?: string;
}

/**
 * نتيجة عملية هرمية (reorder, move, delete cascade)
 * تحتوي على عدد العناصر المتأثرة
 */
export interface CategoryBulkActionResult {
  success: boolean;
  message?: string;
  /** عدد الأقسام المتأثرة */
  affectedCount?: number;
  /** قائمة الـ IDs اللي اتأثرت */
  affectedIds?: string[];
  errors?: Record<string, string[]>;
  correlationId?: string;
}

// ============================================================
// 🛠️ أنواع مساعدة (Helper Types)
// ============================================================

/**
 * استنتاج نوع البيانات من الـ ActionResult
 * @example
 * type CategoryData = ExtractActionResultData<CategoryActionResult<Category>>;
 */
export type ExtractActionResultData<T> = T extends CategoryActionResult<infer U> ? U : never;

/**
 * نوع الـ callback للـ useQuery مع الـ tree
 */
export type CategoryTreeQueryResult = {
  tree: CategoryTree[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

/**
 * نوع الـ callback للـ useMutation على الأقسام
 */
export type CategoryMutationCallbacks<T> = {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
};