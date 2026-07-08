// src/lib/db/schema/media.ts

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
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';

import { stores } from './stores';
import { products } from './products';
import { categories } from './categories';

// ============================================
// 📦 أنواع TypeScript (في أول الملف)
// ============================================

export type MediaType = 'image' | 'video' | 'document' | 'audio' | 'archive';

export type MediaMetadata = {
  publicId?: string;
  accountIndex?: number;
  width?: number;
  height?: number;
  duration?: number; 
  format?: string; 
  blurHash?: string; 
  dominantColor?: string; 
  sha256?: string; 
  altText?: string; 
  cdnUrl?: string; 
  originalUrl?: string; 
  [key: string]: unknown;
};

// ============================================
// 🖼️ جدول الوسائط (Media) - D1 Compatible
// ============================================

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),

    // 🔗 العلاقات
    storeId: text('store_id').notNull(),
    productId: text('product_id'),
    categoryId: text('category_id'),

    // 🌐 URLs
    url: text('url').notNull(), 
    originalUrl: text('original_url'), 
    cdnUrl: text('cdn_url'), 

    // 📦 البيانات الأساسية
    type: text('type').notNull(), 
    mimeType: text('mime_type').notNull(), 
    filename: text('filename').notNull(),
    
    // ✅ الحجم كـ number آمن ومتوافق مع SQLite
    size: integer('size', { mode: 'number' }).notNull(),
    
    // 📊 الـ Default المقفل للـ Edge Runtime
    metadata: text('metadata', { mode: 'json' })
      .$type<MediaMetadata>()
      .notNull()
      .default(sql`'{}'`),

    // 🎯 الترتيب والأهمية
    order: integer('order').notNull().default(0),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),

    // 📈 Usage tracking
    viewCount: integer('view_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    lastViewedAt: integer('last_viewed_at', { mode: 'timestamp' }),

    // 🗃️ Soft Delete
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),

    // ⏱️ التواقيت
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys
    // ============================================
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'media_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'media_product_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: 'media_category_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة
    // ============================================
    uniqueIndex('media_store_url_unique')
      .on(table.storeId, table.url)
      .where(sql`${table.deletedAt} IS NULL`),

    uniqueIndex('media_primary_product_unique')
      .on(table.productId)
      .where(sql`${table.isPrimary} = 1 AND ${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ فهارس الأداء
    // ============================================
    index('media_store_idx').on(table.storeId),
    index('media_type_idx').on(table.storeId, table.type),
    index('media_url_idx').on(table.url),
    index('media_filename_idx').on(table.filename),
    index('media_mime_type_idx').on(table.mimeType),
    
    index('media_product_idx')
      .on(table.productId)
      .where(sql`${table.productId} IS NOT NULL`),
    index('media_category_idx')
      .on(table.categoryId)
      .where(sql`${table.categoryId} IS NOT NULL`),
    
    index('media_product_order_idx')
      .on(table.productId, table.order)
      .where(sql`${table.productId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    
    index('media_views_idx').on(table.viewCount),
    index('media_last_viewed_idx').on(table.lastViewedAt),
    
    index('media_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    
    index('media_primary_idx')
      .on(table.productId)
      .where(sql`${table.isPrimary} = 1 AND ${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية (Check Constraints)
    // ============================================
    check('chk_media_type', sql`${table.type} IN ('image', 'video', 'document', 'audio', 'archive')`),
    check('chk_type_length', sql`length(${table.type}) BETWEEN 1 AND 20`),
    check('chk_filename_length', sql`length(${table.filename}) BETWEEN 1 AND 255`),
    check('chk_url_length', sql`length(${table.url}) BETWEEN 1 AND 2048`),
    check('chk_mime_type_length', sql`length(${table.mimeType}) BETWEEN 1 AND 100`),
    
    check(
      'chk_mime_type_format',
      sql`${table.mimeType} GLOB '*/*' AND ${table.mimeType} NOT GLOB '*[^a-zA-Z0-9/+.-]*'`
    ),
    
    check('chk_size_non_negative', sql`${table.size} >= 0`),
    check('chk_order_non_negative', sql`${table.order} >= 0`),
    check('chk_view_count_non_negative', sql`${table.viewCount} >= 0`),
    check('chk_download_count_non_negative', sql`${table.downloadCount} >= 0`),
    
    check(
      'chk_metadata_valid',
      sql`json_valid(${table.metadata}) = 1 AND json_type(${table.metadata}) = 'object'`
    ),
  ]
);

// ============================================
// 📚 أنواع TypeScript
// ============================================
export type Media = InferSelectModel<typeof media>;
export type NewMedia = InferInsertModel<typeof media>;

// ============================================
// 🛠️ دوال مساعدة (Validation)
// ============================================

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MAX_FILE_SIZE = {
  image: 10 * 1024 * 1024, 
  video: 100 * 1024 * 1024, 
  document: 20 * 1024 * 1024, 
};

export function validateMediaFile(file: File): { valid: boolean; error?: string; type?: MediaType } {
  const allAllowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];
  if (!allAllowed.includes(file.type)) {
    return { valid: false, error: 'Unsupported file type' };
  }
  
  let mediaType: MediaType = 'document';
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) mediaType = 'image';
  else if (ALLOWED_VIDEO_TYPES.includes(file.type)) mediaType = 'video';
  
  const maxSize = MAX_FILE_SIZE[mediaType as keyof typeof MAX_FILE_SIZE] || MAX_FILE_SIZE.document;
  if (file.size > maxSize) {
    return { valid: false, error: `File too large (max ${maxSize / 1024 / 1024}MB)` };
  }
  
  return { valid: true, type: mediaType };
}

export function validateMimeType(mimeType: string): boolean {
  return [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES].includes(mimeType);
}

export function getMediaTypeFromMimeType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export function generateUniqueFilename(originalFilename: string): string {
  const ext = originalFilename.split('.').pop() || 'bin';
  return `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ✅ تحديث عداد المشاهدات
 */
export async function incrementViewCount(mediaId: string, db: D1Database): Promise<void> {
  await db.prepare(`
    UPDATE media
    SET view_count = view_count + 1,
        last_viewed_at = (strftime('%s', 'now') * 1000)
    WHERE id = ? AND deleted_at IS NULL
  `).bind(mediaId).run();
}

/**
 * ✅ جلب primary image للمنتج
 */
export async function getPrimaryImage(productId: string, db: D1Database): Promise<Media | null> {
  const result = await db.prepare(`
    SELECT * FROM media
    WHERE product_id = ? 
      AND is_primary = 1 
      AND deleted_at IS NULL
    LIMIT 1
  `).bind(productId).first();
  
  return result as Media | null;
}

/**
 * ✅ جلب كل images للمنتج (مرتبة)
 */
export async function getProductImages(productId: string, db: D1Database): Promise<Media[]> {
  const result = await db.prepare(`
    SELECT * FROM media
    WHERE product_id = ? 
      AND type = 'image'
      AND deleted_at IS NULL
    ORDER BY "order" ASC, created_at ASC
  `).bind(productId).all();
  
  return (result.results || []) as Media[]; 
}