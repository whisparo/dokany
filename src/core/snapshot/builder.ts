// src/core/snapshot/builder.ts
import { getDb } from '@/lib/db/db';
import type { Env } from '@/lib/env';
import type { Snapshot, Product } from './validator';

// --- Type Definitions (Strict Contracts) ---

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  level: number;
  children: CategoryNode[];
}

export type ProductItem = Product;

export interface HeroConfig {
  type: string;
  items: Array<{
    title?: string;
    subtitle?: string;
    image?: string;
    link?: string;
  }>;
}

export interface RawHomeSection {
  id: string;
  title: string;
  type: string;
  productIds?: string[];
}

export interface HomeSection {
  id: string;
  title: string;
  type: string;
  products: ProductItem[];
}

export interface FooterConfig {
  phone?: string | null;
  socialLinks?: Record<string, string>;
}

export interface SeoConfig {
  title?: string | null;
  description?: string | null;
}

export interface StoreSettings {
  hero?: HeroConfig | null;
  homeSections?: RawHomeSection[];
  footer?: FooterConfig | null;
  seo?: SeoConfig | null;
}

export type StoreSnapshot = Snapshot;

export interface BuildSnapshotOptions {
  includeInactive?: boolean;
  includeDeleted?: boolean;
}

// --- Main Builder Function ---

export async function buildSnapshot(
  storeId: string,
  env: Env,
  _options: BuildSnapshotOptions = {}
): Promise<StoreSnapshot> {
  const startTime = Date.now();
  const db = getDb({ DB: env.DB });

  // 1. جلب بيانات المتجر (store)
  const store = await db.query.stores.findFirst({
    where: (stores, { eq }) => eq(stores.id, storeId),
    columns: { id: true, slug: true, name: true, logo: true, settings: true },
  });

  if (!store) {
    throw new Error(`Store not found: ${storeId}`);
  }

  // 2. جلب الأقسام الهرمية (categories)
  const categories = await db.query.categories.findMany({
    where: (categories, { eq, and, isNull }) =>
      and(
        eq(categories.storeId, storeId),
        isNull(categories.deletedAt),
        eq(categories.isActive, true)
      ),
    orderBy: (categories, { asc }) => [asc(categories.order)],
  });

  // بناء شجرة الأقسام
  function buildCategoryTree(parentId: string | null = null): CategoryNode[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        level: c.level,
        children: buildCategoryTree(c.id),
      }));
  }

  const categoriesTree = buildCategoryTree(null);

  // 3. جلب المنتجات وإحصائياتها (Products + ProductStats)
  const rawProducts = await db.query.products.findMany({
    where: (products, { eq, and, isNull }) =>
      and(
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
        eq(products.isPublished, true)
      ),
    columns: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      categoryId: true,
    },
    limit: 1000,
  });

  // جلب إحصائيات التقييمات والمراجعات لجميع المنتجات دفعة واحدة
  const productIds = rawProducts.map((p) => p.id);
  const statsMap = new Map<string, { rating: number; reviewsCount: number }>();

  if (productIds.length > 0) {
    const stats = await db.query.productStats.findMany({
      where: (productStats, { inArray }) => inArray(productStats.productId, productIds),
      columns: {
        productId: true,
        rating: true,
        reviewsCount: true,
      },
    });

    for (const stat of stats) {
      statsMap.set(stat.productId, {
        rating: stat.rating / 100, // تحويل الـ integer (مثلاً 450) إلى قيمة عشرية (4.5)
        reviewsCount: stat.reviewsCount,
      });
    }
  }

  const productsMap = new Map<string, ProductItem>();
  const products: ProductItem[] = rawProducts.map((p) => {
    const stat = statsMap.get(p.id);

    const rawImages = Array.isArray(p.images) ? p.images : [];
    const images: ProductItem['images'] = rawImages.map((img) => {
      const obj = typeof img === 'object' && img !== null ? (img as Record<string, unknown>) : {};
      return {
        url: typeof obj.url === 'string' ? obj.url : '',
        alt: typeof obj.alt === 'string' ? obj.alt : undefined,
        isPrimary: typeof obj.isPrimary === 'boolean' ? obj.isPrimary : undefined,
        order: typeof obj.order === 'number' ? obj.order : undefined,
      };
    });

    const item: ProductItem = {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? null,
      images,
      rating: stat ? stat.rating : null,
      reviewsCount: stat ? stat.reviewsCount : null,
      categoryId: p.categoryId ?? null,
    };
    productsMap.set(p.id, item);
    return item;
  });

  // 4. جلب محتوى الصفحات من إعدادات المتجر
  const storeSettings = (store.settings as StoreSettings) || {};
  const hero = storeSettings.hero || null;
  const rawHomeSections = storeSettings.homeSections || [];
  const footer = storeSettings.footer || null;
  const seo = storeSettings.seo || null;

  // 5. ربط المنتجات بالـ Home Sections بربط سريع O(1)
  const homeSections: HomeSection[] = rawHomeSections.map((section) => {
    const sectionProducts: ProductItem[] = [];

    if (Array.isArray(section.productIds)) {
      for (const pId of section.productIds) {
        const found = productsMap.get(pId);
        if (found) {
          sectionProducts.push(found);
        }
      }
    }

    return {
      id: section.id,
      title: section.title,
      type: section.type,
      products: sectionProducts,
    };
  });

  // 6. بناء الـ Snapshot النهائي
  const snapshot: StoreSnapshot = {
    storeId: store.id,
    slug: store.slug,
    version: 1,
    updatedAt: new Date().toISOString(),
    blueprint: {
      header: {
        logo: store.logo || null,
        categoriesTree,
      },
      hero,
      homeSections,
      footer,
      seo,
    },
    _meta: {
      buildDuration: Date.now() - startTime,
      totalProducts: products.length,
      totalCategories: categories.length,
    },
  };

  return snapshot;
}