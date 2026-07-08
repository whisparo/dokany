// src/lib/validations/media.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  🖼️ MEDIA – نظام التحقق من ملفات الوسائط                    ║
// ║  📌 يتحقق من خصائص الملف قبل التحميل الفعلي.                ║
// ║     القيود النهائية للحجم والنوع تتم في الخدمة.              ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = MAX_FILE_SIZE_BYTES * 2;
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
const MAX_ALT_TEXT_LENGTH = 200;
const MAX_BULK_IMAGES = 10;

// 🗺️ خريطة ربط الامتداد بـ mimeType (قابلة للتوسيع)
const MIME_EXT_MAP: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
};

// 🛡️ دالة مساعدة للتحقق من اسم الملف (أمان ضد Path Traversal)
const safeFileName = z
  .string()
  .trim()
  .min(1, 'اسم الملف مطلوب')
  .max(MAX_FILENAME_LENGTH, `اسم الملف لا يمكن أن يتجاوز ${MAX_FILENAME_LENGTH} حرفاً`)
  .regex(/^[^\\/:*?"<>|]+$/, 'اسم الملف يحتوي على أحرف غير مسموح بها')
  .refine((name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'), 'اسم الملف غير آمن');

// 🛡️ دالة مساعدة للتحقق من اتساق الامتداد مع mimeType
const extMatchesMime = (fileName: string, mimeType: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  const allowedExts = MIME_EXT_MAP[mimeType];
  return allowedExts ? allowedExts.includes(ext) : false;
};

// ============================================================
// 📸 IMAGE UPLOAD – تحميل صورة
// ============================================================
export const imageUploadSchema = z.object({
  fileName: safeFileName
    .regex(/\.(jpg|jpeg|png|webp|gif)$/i, 'الملف يجب أن يكون صورة (jpg, png, webp, gif)'),
  fileSize: z
    .number()
    .int()
    .positive('حجم الملف يجب أن يكون أكبر من صفر')
    .max(MAX_FILE_SIZE_BYTES, `حجم الملف لا يمكن أن يتجاوز ${MAX_FILE_SIZE_MB}MB`),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES, {
    message: 'نوع الصورة غير مدعوم',
  }),
  alt: z
    .string()
    .trim()
    .max(MAX_ALT_TEXT_LENGTH)
    .optional(),
  isPrimary: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
}).strict()
  .refine(
    (d) => extMatchesMime(d.fileName, d.mimeType),
    { message: 'امتداد الملف لا يتطابق مع نوع الصورة', path: ['fileName'] }
  );

export type ImageUploadInput = z.infer<typeof imageUploadSchema>;

// ============================================================
// 🎥 VIDEO UPLOAD – تحميل فيديو
// ============================================================
export const videoUploadSchema = z.object({
  fileName: safeFileName
    .regex(/\.(mp4|webm)$/i, 'الملف يجب أن يكون فيديو (mp4, webm)'),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_VIDEO_SIZE_BYTES, `حجم الفيديو لا يمكن أن يتجاوز ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024}MB`),
  mimeType: z.enum(ALLOWED_VIDEO_TYPES, {
    message: 'نوع الفيديو غير مدعوم',
  }),
  thumbnail: z
    .object({
      fileName: safeFileName
        .regex(/\.(jpg|jpeg|png|webp|gif)$/i, 'الصورة المصغرة يجب أن تكون صورة'),
      fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
      mimeType: z.enum(ALLOWED_IMAGE_TYPES, {
        message: 'نوع الصورة المصغرة غير مدعوم',
      }),
    })
    .optional()
    .refine(
      (thumb) => {
        if (!thumb) return true;
        return extMatchesMime(thumb.fileName, thumb.mimeType);
      },
      { message: 'امتداد الصورة المصغرة لا يتطابق مع نوعها', path: ['thumbnail', 'fileName'] }
    ),
}).strict()
  .refine(
    (d) => extMatchesMime(d.fileName, d.mimeType),
    { message: 'امتداد الملف لا يتطابق مع نوع الفيديو', path: ['fileName'] }
  );

export type VideoUploadInput = z.infer<typeof videoUploadSchema>;

// ============================================================
// 📋 BULK IMAGE UPLOAD – رفع مجموعة صور
// ============================================================
export const bulkImageUploadSchema = z.object({
  images: z
    .array(imageUploadSchema)
    .min(1, 'يجب رفع صورة واحدة على الأقل')
    .max(MAX_BULK_IMAGES, `لا يمكن رفع أكثر من ${MAX_BULK_IMAGES} صور دفعة واحدة`),
}).strict()
  .refine(
    (d) => {
      const names = d.images.map((img) => img.fileName);
      return new Set(names).size === names.length;
    },
    { message: 'لا يمكن رفع نفس الملف مرتين في الدفعة الواحدة' }
  )
  .refine(
    (d) => {
      const orders = d.images
        .map((img) => img.order)
        .filter((o) => o !== undefined) as number[];
      return new Set(orders).size === orders.length;
    },
    { message: 'لا يمكن تكرار نفس قيمة الترتيب لصور مختلفة' }
  );

export type BulkImageUploadInput = z.infer<typeof bulkImageUploadSchema>;

// ============================================================
// 🗑️ DELETE MEDIA – حذف وسائط
// ============================================================
export const deleteMediaSchema = z.object({
  productId: z.string().uuid('معرف المنتج غير صالح'),
  mediaId: z.string().uuid('معرف الوسائط غير صالح'),
}).strict();

export type DeleteMediaInput = z.infer<typeof deleteMediaSchema>;