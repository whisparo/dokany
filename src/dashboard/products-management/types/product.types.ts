// src/dashboard/products-management/types/product.types.ts

import type { z } from 'zod';
import type {
  Product,
  NewProduct,
  ProductImage,
  ProductVariant,
  ProductMetadata,
} from '@/lib/db/schema/products';

// استيراد Zod Schemas من validations
import {
  createProductSchema,
  updateProductSchema,
} from '@/lib/validations/product';

// ============================================================
// 📦 أنواع مُعاد تصديرها من الـ Schema
// ============================================================

export type { Product, NewProduct, ProductImage, ProductVariant, ProductMetadata };

// ============================================================
// 📤 أنواع مُشتقة من Zod Schemas
// ============================================================

/**
 * بيانات إنشاء منتج جديد
 */
export type CreateProductPayload = z.infer<typeof createProductSchema>;

/**
 * بيانات تحديث منتج
 */
export type UpdateProductPayload = z.infer<typeof updateProductSchema>;

/**
 * أسماء مختصرة للاستخدام الداخلي
 */
export type ProductInput = CreateProductPayload;
export type ProductUpdateInput = UpdateProductPayload;

// ============================================================
// 📊 أنواع إضافية للاستعلامات والترشيح
// ============================================================

/**
 * معاملات البحث والترشيح لقائمة المنتجات
 */
export interface ProductListFilters {
  search?: string;
  categoryId?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  minPrice?: number; // Integer
  maxPrice?: number; // Integer
  minStock?: number;
  maxStock?: number;
  hasVariants?: boolean;
  tags?: string[];
}

/**
 * خيارات الترتيب (Sorting)
 */
export interface ProductSortOptions {
  sortBy?: 'createdAt' | 'updatedAt' | 'price' | 'salesCount' | 'name' | 'stock';
  sortOrder?: 'asc' | 'desc';
}

/**
 * خيارات الترقيم (Pagination)
 */
export interface ProductPaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * جميع معاملات جلب قائمة المنتجات
 */
export interface ProductListParams
  extends ProductListFilters,
    ProductPaginationOptions,
    ProductSortOptions {
  includeDeleted?: boolean;
}

// ============================================================
// 📤 أنواع الـ Response القياسية
// ============================================================

/**
 * استجابة نجاح/فشل عامة (بدون any)
 */
export interface ProductActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

/**
 * استجابة قائمة المنتجات مع الترقيم
 */
export interface ProductListResult {
  data: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// ============================================================
// 📤 أنواع الـ Mutation Payloads (للاستخدام في TanStack Query Hooks)
// ============================================================

export interface CreateProductMutationVariables {
  input: CreateProductPayload;
}

export interface UpdateProductMutationVariables {
  productId: string;
  input: UpdateProductPayload;
}

export interface DeleteProductMutationVariables {
  productId: string;
}

export interface UpdateStockMutationVariables {
  productId: string;
  newStock: number;
}