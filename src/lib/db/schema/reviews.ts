// src/lib/db/schema/reviews.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql, eq, and, isNull, desc, asc, avg, count } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { classifyError } from '@/lib/errors/classifier';
import type { D1Database } from '@cloudflare/workers-types';

// ============================================
// 📦 أنواع TypeScript
// ============================================

export type ReviewStatus = 'pending' | 'published' | 'hidden' | 'reported' | 'deleted';
export type ReviewLanguage = 'ar' | 'en' | 'fr' | 'es';

export type ReviewMetadata = {
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
  os?: string;
  moderationNotes?: string;
  moderationAction?: 'approved' | 'rejected' | 'flagged';
  moderatedAt?: number;
  moderatedBy?: string;
  [key: string]: unknown;
};

// ============================================
// ⭐ جدول المراجعات (Reviews) - D1 Optimized
// ============================================

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // 🔗 العلاقات الأساسية (مرنة وبدون ربط صلب لتفادي الـ Locks في الـ D1)
    productId: text('product_id').notNull(),
    storeId: text('store_id').notNull(),
    customerId: text('customer_id'),
    orderId: text('order_id'),
    userId: text('user_id'), // الـ Admin الذي اتخذ إجراء الـ Moderation

    // 👤 بيانات الكاتب
    userName: text('user_name').notNull(),
    anonymous: integer('anonymous', { mode: 'boolean' }).notNull().default(false),

    // 📝 محتوى المراجعة
    title: text('title'),
    comment: text('comment').notNull(),
    
    // 🎨 الميديا والـ Arrays (مخزنة كـ JSON مع الحفاظ على الأداء)
    pros: text('pros', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    cons: text('cons', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    images: text('images', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    videos: text('videos', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`), // دعم الفيديوهات بشكل أصيل

    // ⭐ التقييم (1-5)
    rating: integer('rating').notNull(),

    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('published'),
    language: text('language').notNull().default('ar'),

    // 👍 التصويت والـ Engagement
    helpfulCount: integer('helpful_count').notNull().default(0),
    notHelpfulCount: integer('not_helpful_count').notNull().default(0),

    // 💬 الرد من التاجر
    reply: text('reply'),
    repliedAt: integer('replied_at', { mode: 'timestamp' }),
    repliedBy: text('replied_by'), 

    reportedCount: integer('reported_count').notNull().default(0),
    spamScore: integer('spam_score').notNull().default(0), // 0-100

    metadata: text('metadata', { mode: 'json' })
      .$type<ReviewMetadata>()
      .notNull()
      .default(sql`'{}'`),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    // ============================================
    // 🗝️ الفهارس الفريدة لمنع التكرار وسوء الاستخدام
    // ============================================
    uniqueIndex('reviews_customer_product_unique')
      .on(table.customerId, table.productId)
      .where(sql`customer_id IS NOT NULL AND deleted_at IS NULL`),

    uniqueIndex('reviews_order_product_unique')
      .on(table.orderId, table.productId)
      .where(sql`order_id IS NOT NULL AND deleted_at IS NULL`),

    // ============================================
    // ⚡ فهارس الأداء (D1 Tenant Isolation & Analytics)
    // ============================================
    index('reviews_product_idx').on(table.productId),
    index('reviews_store_idx').on(table.storeId),
    index('reviews_customer_idx').on(table.customerId).where(sql`customer_id IS NOT NULL`),
    index('reviews_order_idx').on(table.orderId).where(sql`order_id IS NOT NULL`),
    index('reviews_rating_idx').on(table.rating),
    
    index('reviews_product_rating_idx')
      .on(table.productId, table.rating)
      .where(sql`status = 'published' AND deleted_at IS NULL`),
    
    index('reviews_status_idx').on(table.status),
    index('reviews_verified_idx').on(table.verified).where(sql`status = 'published'`), 
    index('reviews_replied_idx').on(table.repliedAt).where(sql`replied_at IS NOT NULL`),
    index('reviews_reported_idx').on(table.reportedCount).where(sql`reported_count > 0`),
    index('reviews_spam_idx').on(table.spamScore).where(sql`spam_score > 70`),
    index('reviews_helpful_idx').on(table.helpfulCount),
    index('reviews_language_idx').on(table.language),
    index('reviews_created_idx').on(table.createdAt),
    
    index('reviews_product_created_idx')
      .on(table.productId, table.createdAt)
      .where(sql`status = 'published' AND deleted_at IS NULL`),
    
    index('reviews_deleted_idx').on(table.deletedAt).where(sql`deleted_at IS NULL`),
    index('reviews_store_status_idx').on(table.storeId, table.status),
    
    index('reviews_store_rating_idx')
      .on(table.storeId, table.rating)
      .where(sql`status = 'published' AND deleted_at IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية المتوافقة مع SQLite Engine
    // ============================================
    check('chk_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    check('chk_review_status', sql`${table.status} IN ('pending', 'published', 'hidden', 'reported', 'deleted')`),
    check('chk_language', sql`${table.language} IN ('ar', 'en', 'fr', 'es')`),
    check('chk_title_length', sql`${table.title} IS NULL OR length(${table.title}) BETWEEN 1 AND 200`),
    check('chk_comment_length', sql`length(${table.comment}) BETWEEN 1 AND 5000`),
    check('chk_reply_length', sql`${table.reply} IS NULL OR length(${table.reply}) <= 2000`),
    
    // قيود مصفوفات الميديا والـ JSON
    check('chk_images_limit', sql`json_array_length(${table.images}) <= 10`),
    check('chk_videos_limit', sql`json_array_length(${table.videos}) <= 2`), 
    check('chk_pros_limit', sql`json_array_length(${table.pros}) <= 10`),
    check('chk_cons_limit', sql`json_array_length(${table.cons}) <= 10`),
    
    check('chk_helpful_count_non_negative', sql`${table.helpfulCount} >= 0`),
    check('chk_not_helpful_count_non_negative', sql`${table.notHelpfulCount} >= 0`),
    check('chk_reported_count_non_negative', sql`${table.reportedCount} >= 0`),
    check('chk_spam_score_range', sql`${table.spamScore} BETWEEN 0 AND 100`),
    check('chk_verified_consistency', sql`(${table.verified} = 0) OR (${table.verified} = 1 AND ${table.orderId} IS NOT NULL)`),
    check('chk_replied_consistency', sql`(${table.reply} IS NULL AND ${table.repliedAt} IS NULL) OR (${table.reply} IS NOT NULL AND ${table.repliedAt} IS NOT NULL)`),
    check('chk_metadata_valid', sql`${table.metadata} IS NULL OR (json_valid(${table.metadata}) = 1 AND json_type(${table.metadata}) = 'object')`),
    check('chk_user_name_not_empty', sql`${table.userName} != ''`),
  ]
);

// ============================================
// 📚 أنواع TypeScript الصريحة لـ Drizzle
// ============================================
export type Review = InferSelectModel<typeof reviews>;
export type NewReview = InferInsertModel<typeof reviews>;

// ============================================
// 🛠️ الدوال المساعدة (Drizzle Native & Edge Ready)
// ============================================

/**
 * ✅ حساب متوسط التقييم لمنتج بشكل آمن
 */
export async function getAverageRating(
  d1Database: D1Database,
  productId: string
): Promise<{ average: number; count: number }> {
  const db = drizzle(d1Database);
  
  const result = await db
    .select({
      average: avg(reviews.rating),
      count: count(reviews.id),
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.productId, productId),
        eq(reviews.status, 'published'),
        isNull(reviews.deletedAt)
      )
    )
    .get();

  return {
    average: result?.average ? parseFloat(Number(result.average).toFixed(2)) : 0,
    count: result?.count || 0,
  };
}

/**
 * ✅ حساب متوسط التقييم لمتجر كامل (Tenant Isolation Analytics)
 */
export async function getStoreAverageRating(
  d1Database: D1Database,
  storeId: string
): Promise<{ average: number; count: number }> {
  const db = drizzle(d1Database);
  
  const result = await db
    .select({
      average: avg(reviews.rating),
      count: count(reviews.id),
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.storeId, storeId),
        eq(reviews.status, 'published'),
        isNull(reviews.deletedAt)
      )
    )
    .get();

  return {
    average: result?.average ? parseFloat(Number(result.average).toFixed(2)) : 0,
    count: result?.count || 0,
  };
}

/**
 * ✅ جلب مراجعات منتج مع الـ Pagination والـ Sorting الآلي
 */
export async function getProductReviews(
  d1Database: D1Database,
  productId: string,
  page: number = 1,
  limit: number = 20,
  sortBy: 'recent' | 'helpful' | 'rating_high' | 'rating_low' = 'recent'
): Promise<{ reviews: Review[]; total: number }> {
  const db = drizzle(d1Database);
  const offset = (page - 1) * limit;
  
  let orderClause = desc(reviews.createdAt);
  if (sortBy === 'helpful') orderClause = desc(reviews.helpfulCount);
  if (sortBy === 'rating_high') orderClause = desc(reviews.rating);
  if (sortBy === 'rating_low') orderClause = asc(reviews.rating);

  const baseConditions = and(
    eq(reviews.productId, productId),
    eq(reviews.status, 'published'),
    isNull(reviews.deletedAt)
  );

  const reviewsList = await db
    .select()
    .from(reviews)
    .where(baseConditions)
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset)
    .all();

  const totalCount = await db
    .select({ count: count(reviews.id) })
    .from(reviews)
    .where(baseConditions)
    .get();

  return {
    reviews: reviewsList,
    total: totalCount?.count || 0,
  };
}

/**
 * ✅ التحقق من أحقية العميل في كتابة المراجعة (تفادي الـ Fake Reviews)
 */
export async function canWriteReview(
  d1Database: D1Database,
  customerId: string,
  productId: string
): Promise<{ canWrite: boolean; reason?: string }> {
  const db = drizzle(d1Database);

  const existingReview = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.customerId, customerId),
        eq(reviews.productId, productId),
        isNull(reviews.deletedAt)
      )
    )
    .get();

  if (existingReview) {
    return { canWrite: false, reason: 'You already wrote a review for this product' };
  }

  return { canWrite: true };
}

/**
 * ✅ التصويت على مراجعة (Helpful / Not Helpful)
 */
export async function voteReview(
  d1Database: D1Database,
  reviewId: string,
  vote: 'helpful' | 'not_helpful'
): Promise<Review> {
  const db = drizzle(d1Database);
  
  const updateFields = vote === 'helpful' 
    ? { helpfulCount: sql`${reviews.helpfulCount} + 1` }
    : { notHelpfulCount: sql`${reviews.notHelpfulCount} + 1` };

  const result = await db
    .update(reviews)
    .set(updateFields)
    .where(and(eq(reviews.id, reviewId), isNull(reviews.deletedAt)))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Review not found or already deleted')
    );
  }
  return result;
}

/**
 * ✅ رد التاجر الرسمي على مراجعة العميل
 */
export async function replyToReview(
  d1Database: D1Database,
  reviewId: string,
  reply: string,
  repliedBy: string
): Promise<Review> {
  const db = drizzle(d1Database);

  const result = await db
    .update(reviews)
    .set({
      reply,
      repliedAt: new Date(),
      repliedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, reviewId), isNull(reviews.deletedAt)))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Review not found for merchant reply')
    );
  }
  return result;
}

/**
 * ✅ التبليغ عن مراجعة مسيئة مع ميزة الإخفاء التلقائي بعد 5 بلاغات
 */
export async function reportReview(
  d1Database: D1Database,
  reviewId: string
): Promise<Review> {
  const db = drizzle(d1Database);

  const result = await db
    .update(reviews)
    .set({
      reportedCount: sql`${reviews.reportedCount} + 1`,
      status: sql`CASE WHEN ${reviews.reportedCount} + 1 >= 5 THEN 'reported' ELSE ${reviews.status} END`,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, reviewId), isNull(reviews.deletedAt)))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Review not found for reporting')
    );
  }
  return result;
}

/**
 * ✅ التحكم الإداري بالمراجعات (الموافقة، الرفض، الحجب)
 */
export async function moderateReview(
  d1Database: D1Database,
  reviewId: string,
  action: 'approve' | 'reject' | 'hide',
  userId: string
): Promise<Review> {
  const db = drizzle(d1Database);
  const statusMap: Record<string, ReviewStatus> = {
    approve: 'published',
    reject: 'hidden',
    hide: 'hidden',
  };

  const result = await db
    .update(reviews)
    .set({
      status: statusMap[action],
      userId,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, reviewId), isNull(reviews.deletedAt)))
    .returning()
    .get();

  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Review not found for moderation'),
      { userId }
    );
  }
  return result;
}

/**
 * ✅ حساب مصفوفة توزيع النجوم لعرضها على شكل الرسم البياني
 */
export async function getRatingDistribution(
  d1Database: D1Database,
  productId: string
): Promise<Record<number, number>> {
  const db = drizzle(d1Database);

  const result = await db
    .select({
      rating: reviews.rating,
      count: count(reviews.id),
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.productId, productId),
        eq(reviews.status, 'published'),
        isNull(reviews.deletedAt)
      )
    )
    .groupBy(reviews.rating)
    .all();

  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const row of result) {
    distribution[row.rating] = row.count;
  }

  return distribution;
}

/**
 * ✅ كشف ومراقبة المراجعات ذات الـ Spam Score العالي
 */
export async function detectSpamReviews(d1Database: D1Database): Promise<Review[]> {
  const db = drizzle(d1Database);

  return await db
    .select()
    .from(reviews)
    .where(
      and(
        sql`${reviews.spamScore} > 70`,
        eq(reviews.status, 'published'),
        isNull(reviews.deletedAt)
      )
    )
    .orderBy(desc(reviews.spamScore))
    .all();
}