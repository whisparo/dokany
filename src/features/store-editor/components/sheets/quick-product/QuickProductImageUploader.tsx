// src/features/store-editor/components/sheets/quick-product/QuickProductImageUploader.tsx

'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { useEditorStore } from '../../../store/useEditorStore';
import { generateUUID } from '@/lib/utils/id';
import { Typography } from '@/components/shared/Typography';
import { X, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickUpload } from '../../../hooks/useQuickUpload';

interface QuickProductImageUploaderProps {
  tempUrl: string | null;
  onImageChange: (url: string | null) => void;
  onError: (error: string | null) => void;
  disabled?: boolean;
  storeId?: string; // ✅ معرف المتجر للحصول على توقيع الرفع
}

export function QuickProductImageUploader({
  tempUrl,
  onImageChange,
  onError,
  disabled = false,
  storeId,
}: QuickProductImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { startUpload, completeUpload, failUpload } = useEditorStore();

  // ✅ استخدام Hook المحدث مع storeId
  const { uploadWithPreview, progress, error: uploadError, reset } = useQuickUpload({
    storeId,
    entityType: 'product_image',
  });

  // ✅ مزامنة حالة التحميل مع الـ Hook
  useEffect(() => {
    setIsUploading(!uploadError && progress > 0 && progress < 100);
  }, [progress, uploadError]);

  // ✅ إخطار المكون الأب بأخطاء الرفع فقط عند تغير الخطأ
  useEffect(() => {
    if (uploadError) {
      onError(uploadError);
    }
  }, [uploadError, onError]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ✅ تحقق من نوع الملف
    if (!file.type.startsWith('image/')) {
      onError('يرجى اختيار صورة فقط');
      return;
    }

    // ✅ تحقق من الحجم (حد 5MB)
    if (file.size > 5 * 1024 * 1024) {
      onError('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    // ✅ إعادة تعيين حالة الخطأ السابقة
    reset();
    onError(null);

    const uploadId = generateUUID();
    const objectUrl = URL.createObjectURL(file);

    // ✅ Optimistic UI
    startUpload(uploadId, objectUrl, {
      mediaType: 'image',
      size: file.size,
      mimeType: file.type,
    });

    try {
      // ✅ استخدام الـ Hook للرفع مع التوقيع
      const { result, preview } = await uploadWithPreview(file);

      if (!result) {
        throw new Error(uploadError || 'فشل رفع الصورة');
      }

      // ✅ تحديث الحالة بنجاح
      onImageChange(result.url);
      completeUpload(uploadId, result.url);

      // ✅ تنظيف الرابط المؤقت بعد نجاح الرفع
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'فشل رفع الصورة';
      onError(errorMessage);
      failUpload(uploadId, errorMessage);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ✅ إعادة تعيين حالة الخطأ عند إزالة الصورة
  const handleRemoveImage = () => {
    onImageChange(null);
    onError(null);
    reset();
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">صورة المنتج *</label>
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-4 transition-all',
          tempUrl
            ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20'
            : isUploading
            ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-primary/50'
        )}
      >
        {tempUrl ? (
          <div className="relative w-full h-40 overflow-hidden rounded-lg">
            <Image
              src={tempUrl}
              alt="معاينة المنتج"
              fill
              unoptimized
              className="object-cover"
            />
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
              aria-label="إزالة الصورة"
              disabled={disabled || isUploading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="file-upload-image"
            className="flex flex-col items-center justify-center gap-2 py-4 cursor-pointer"
          >
            <div className="p-3 bg-primary/10 rounded-full">
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-primary" />
              )}
            </div>
            <Typography
              variant="body-sm"
              className="text-center text-muted-foreground"
            >
              {isUploading
                ? `جاري رفع الصورة... ${progress}%`
                : 'اضغط لرفع صورة المنتج'}
            </Typography>
            <Typography variant="caption" className="text-muted-foreground/70">
              JPG, PNG, WebP (حد أقصى 5MB)
            </Typography>
            {isUploading && progress > 0 && progress < 100 && (
              <div className="w-full max-w-xs h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </label>
        )}
        <input
          id="file-upload-image"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
        />
      </div>
    </div>
  );
}