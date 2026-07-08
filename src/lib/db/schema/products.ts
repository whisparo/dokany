// src/lib/db/schema/products.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

import { stores } from './stores';
import { categories } from './categories';

// ============================================
// 📝 أنواع مساعدة للـ JSON fields
// ============================================
export type ProductImage = {
  url: string;
  alt?: string;
  isPrimary?: boolean;
  order?: number;
};

export type ProductVariant = {
  name: string;
  options: string[];
};

export type ProductMetadata = {
  source?: 'import' | 'manual' | 'api';
  importedFrom?: string;
  tags?: string[];
  brand?: string;
  manufacturer?: string;
};

// ============================================
// 📦 جدول المنتجات (Products) - D1 Compatible
// ============================================

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id').notNull(),
    categoryId: text('category_id'),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),

    // الأسعار والمبالغ مخزنة كنصوص لحماية الدقة العشرية
    price: text('price').notNull(),
    compareAtPrice: text('compare_at_price'),
    cost: text('cost'),

    // المخزون
    stock: integer('stock').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    sku: text('sku'),
    barcode: text('barcode'),

    // الأبعاد والوزن - استخدام text للدقة العشرية
    weight: text('weight'),
    length: text('length'),
    width: text('width'),
    height: text('height'),

    // الميديا والمتغيرات (JSON كـ text مع توثيق TypeScript)
    mediaIds: text('media_ids').$type<string[]>().notNull().default(sql`'[]'`),
    images: text('images').$type<ProductImage[]>().default(sql`'[]'`),
    videoUrl: text('video_url'),
    imageSrc: text('image_src'),

    variants: text('variants').$type<ProductVariant[]>().default(sql`'[]'`),
    variantPrices: text('variant_prices').$type<Record<string, string>>().default(sql`'{}'`),

    haggleEnabled: integer('haggle_enabled', { mode: 'boolean' }).notNull().default(false),
    minPrice: text('min_price'),

    // SEO
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),

    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),

    metadata: text('metadata').$type<ProductMetadata>().default(sql`'{}'`),

    // Soft Delete
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys الصارمة
    // ============================================
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'products_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: 'products_category_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🎯 الفهارس (Indexes & Constraints)
    // ============================================
    uniqueIndex('products_slug_unique')
      .on(table.storeId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('products_sku_unique')
      .on(table.storeId, table.sku)
      .where(sql`${table.sku} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    index('products_store_idx').on(table.storeId),
    index('products_category_idx')
      .on(table.categoryId)
      .where(sql`${table.categoryId} IS NOT NULL`),
    index('products_price_idx').on(table.storeId, table.price),
    index('products_published_idx')
      .on(table.storeId, table.isPublished)
      .where(sql`${table.isPublished} = 1`),
    index('products_featured_idx')
      .on(table.storeId, table.isFeatured)
      .where(sql`${table.isFeatured} = 1`),
    index('products_stock_idx')
      .on(table.storeId, table.stock)
      .where(sql`${table.stock} > 0`),
    index('products_created_idx')
      .on(table.storeId, table.createdAt),
    index('products_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('products_sku_idx').on(table.sku),
    index('products_barcode_idx').on(table.barcode),

    // فهارس الـ Storefront
    index('products_store_published_created_idx')
      .on(table.storeId, table.isPublished, table.createdAt)
      .where(sql`${table.isPublished} = 1 AND ${table.deletedAt} IS NULL`),

    index('products_haggle_idx')
      .on(table.storeId, table.haggleEnabled)
      .where(sql`${table.haggleEnabled} = 1`),

    // بحث سريع بـ COLLATE NOCASE
    index('products_name_idx').on(table.storeId, sql`${table.name} COLLATE NOCASE`),

    // ============================================
    // 🛡️ القيود المنطقية (Check Constraints)
    // ============================================
    check('chk_prod_name_not_empty', sql`length(${table.name}) > 0`),
    check('chk_prod_slug_not_empty', sql`length(${table.slug}) > 0`),

    // المبالغ والمخزون
    check('chk_price_non_negative', sql`CAST(${table.price} AS REAL) >= 0.0`),
    check('chk_stock_non_negative', sql`${table.stock} >= 0`),
    check('chk_low_stock_non_negative', sql`${table.lowStockThreshold} >= 0`),

    check(
      'chk_compare_at_price',
      sql`${table.compareAtPrice} IS NULL OR CAST(${table.compareAtPrice} AS REAL) >= CAST(${table.price} AS REAL)`
    ),
    check('chk_cost_non_negative', sql`${table.cost} IS NULL OR CAST(${table.cost} AS REAL) >= 0.0`),
    check(
      'chk_cost_price',
      sql`${table.cost} IS NULL OR CAST(${table.cost} AS REAL) <= CAST(${table.price} AS REAL)`
    ),
    check(
      'chk_min_price_non_negative',
      sql`${table.minPrice} IS NULL OR CAST(${table.minPrice} AS REAL) >= 0.0`
    ),
    check(
      'chk_min_price_limit',
      sql`${table.minPrice} IS NULL OR CAST(${table.minPrice} AS REAL) <= CAST(${table.price} AS REAL)`
    ),
    check(
      'chk_haggle_min_price',
      sql`${table.haggleEnabled} = 0 OR ${table.minPrice} IS NOT NULL`
    ),

    // الأبعاد والوزن (CAST لتحويل النص إلى رقم)
    check('chk_weight_positive', sql`${table.weight} IS NULL OR CAST(${table.weight} AS REAL) > 0.0`),
    check('chk_length_positive', sql`${table.length} IS NULL OR CAST(${table.length} AS REAL) > 0.0`),
    check('chk_width_positive', sql`${table.width} IS NULL OR CAST(${table.width} AS REAL) > 0.0`),
    check('chk_height_positive', sql`${table.height} IS NULL OR CAST(${table.height} AS REAL) > 0.0`),

    // صياغة الـ Slug: أحرف عربية/إنجليزية، أرقام، شرطات، وليس مسافات
    check('chk_prod_slug_format', sql`${table.slug} NOT LIKE '% %'`),
    // الباركود (إن وُجد) لا يقل عن 3 أحرف
    check('chk_barcode_format', sql`${table.barcode} IS NULL OR length(${table.barcode}) >= 3`),

    // حدود المصفوفات (باستخدام json_array_length)
    check('chk_images_limit', sql`json_array_length(${table.images}) <= 50`),
    check('chk_variants_limit', sql`json_array_length(${table.variants}) <= 100`),
    check('chk_short_description_length', sql`${table.shortDescription} IS NULL OR length(${table.shortDescription}) <= 500`),
  ]
);

// ============================================
// 📊 جدول إحصائيات المنتجات (منع تضخم الـ Write Locks)
// ============================================
export const productStats = sqliteTable(
  'product_stats',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),

    viewsCount: integer('views_count').notNull().default(0),
    salesCount: integer('sales_count').notNull().default(0),
    reviewsCount: integer('reviews_count').notNull().default(0),

    // الـ Rating كـ Integer (مثال: 4.5 → 450)
    rating: integer('rating').notNull().default(0),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ⚠️ ForeignKey منفصلة لتجنب تداخل الأنواع
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_stats_product_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    uniqueIndex('product_stats_product_idx').on(table.productId),
    index('product_stats_sales_idx').on(table.salesCount),
    index('product_stats_views_idx').on(table.viewsCount),

    check('chk_stats_rating_range', sql`${table.rating} >= 0 AND ${table.rating} <= 500`),
    check(
      'chk_stats_counts_non_negative',
      sql`${table.viewsCount} >= 0 AND ${table.salesCount} >= 0 AND ${table.reviewsCount} >= 0`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript المستنتجة
// ============================================
export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;
export type ProductStat = InferSelectModel<typeof productStats>;
export type NewProductStat = InferInsertModel<typeof productStats>;