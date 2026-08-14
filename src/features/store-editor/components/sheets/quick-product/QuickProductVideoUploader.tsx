// src/features/store-editor/components/sheets/quick-product/QuickProductVideoUploader.tsx

'use client';

import { useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import { generateUUID } from '@/lib/utils/id';
import { Typography } from '@/components/shared/Typography';
import { X, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickUpload } from '../../../hooks/useQuickUpload';

interface QuickProductVideoUploaderProps {
  videoUrl: string | null;
  onVideoChange: (url: string | null) => void;
  onError: (error: string | null) => void;
  disabled?: boolean;
  storeId?: string; // ✅ معرف المتجر للحصول على التوقيع
}

export function QuickProductVideoUploader({
  videoUrl,
  onVideoChange,
  onError,
  disabled = false,
  storeId,
}: QuickProductVideoUploaderProps) {
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

  /**
   * ✅ فحص مدة الفيديو في المتصفح قبل الرفع
   */
  const checkVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      const objectUrl = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(video.duration);
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('فشل قراءة ملف الفيديو'));
      };

      video.src = objectUrl;
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ✅ تحقق من نوع الملف
    if (!file.type.startsWith('video/')) {
      onError('يرجى اختيار ملف فيديو صحيح');
      return;
    }

    // ✅ تحقق من الحجم (حد 20MB)
    if (file.size > 20 * 1024 * 1024) {
      onError('حجم الفيديو يجب أن يكون أقل من 20 ميجابايت');
      return;
    }

    // ✅ تحقق من المدة (حد 10 ثوانٍ)
    try {
      const duration = await checkVideoDuration(file);
      if (duration > 10.5) {
        onError('عذراً، يجب ألا تزيد مدة الفيديو عن 10 ثوانٍ');
        return;
      }
    } catch {
      onError('تعذر التحقق من مدة الفيديو');
      return;
    }

    // ✅ إعادة تعيين حالة الخطأ السابقة
    reset();
    onError(null);

    const uploadId = generateUUID();
    const objectUrl = URL.createObjectURL(file);

    // ✅ Optimistic UI
    startUpload(uploadId, objectUrl, {
      mediaType: 'video',
      size: file.size,
      mimeType: file.type,
    });

    try {
      // ✅ استخدام الـ Hook للرفع مع التوقيع
      const { result, preview } = await uploadWithPreview(file);

      if (!result) {
        throw new Error(uploadError || 'فشل رفع الفيديو');
      }

      // ✅ تحديث الحالة بنجاح
      onVideoChange(result.url);
      completeUpload(uploadId, result.url);

      // ✅ تنظيف الرابط المؤقت بعد نجاح الرفع
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'فشل رفع الفيديو';
      onError(errorMessage);
      failUpload(uploadId, errorMessage);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ✅ إعادة تعيين حالة الخطأ عند إزالة الفيديو
  const handleRemoveVideo = () => {
    onVideoChange(null);
    onError(null);
    reset();
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        فيديو المنتج (اختياري - 10 ثوانٍ كحد أقصى)
      </label>
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-4 transition-all',
          videoUrl
            ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20'
            : isUploading
            ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-primary/50'
        )}
      >
        {videoUrl ? (
          <div className="relative">
            <video
              src={videoUrl}
              controls
              className="w-full h-40 object-cover rounded-lg bg-black"
            />
            <button
              type="button"
              onClick={handleRemoveVideo}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
              aria-label="إزالة الفيديو"
              disabled={disabled || isUploading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="file-upload-video"
            className="flex flex-col items-center justify-center gap-2 py-4 cursor-pointer"
          >
            <div className="p-3 bg-purple-500/10 rounded-full">
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
              ) : (
                <Video className="w-6 h-6 text-purple-600" />
              )}
            </div>
            <Typography
              variant="body-sm"
              className="text-center text-muted-foreground"
            >
              {isUploading
                ? `جاري رفع الفيديو... ${progress}%`
                : 'اضغط لرفع فيديو للمنتج'}
            </Typography>
            <Typography variant="caption" className="text-muted-foreground/70">
              MP4, WebM (حد أقصى 10 ثوانٍ / 20MB)
            </Typography>
            {isUploading && progress > 0 && progress < 100 && (
              <div className="w-full max-w-xs h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </label>
        )}
        <input
          id="file-upload-video"
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
        />
      </div>
    </div>
  );
}