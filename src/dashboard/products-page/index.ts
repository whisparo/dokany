// src/dashboard/products-page/index.ts

// 1. Components & Hooks
export { CategoryFilterRibbon } from './CategoryFilterRibbon';
export { ProductQuickTable } from './ProductQuickTable';
export { useProductsPage } from './useProductsPage';

// 2. Types
export type { CategoryFilterRibbonProps } from './CategoryFilterRibbon';
export type { ProductQuickTableProps } from './ProductQuickTable';

// استخدام import() type لحل مشكلة 'Cannot find name useProductsPage'
export type UseProductsPageReturn = ReturnType<typeof import('./useProductsPage').useProductsPage>;