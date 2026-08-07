// src/types/category.ts

export interface Category {
  id: string;
  storeId?: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}