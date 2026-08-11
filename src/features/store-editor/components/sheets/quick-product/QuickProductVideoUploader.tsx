// src/features/store-editor/components/sheets/quick-product/QuickProductVideoUploader.tsx

'use client';

import { useRef, useState } from 'react';
import { uploadToCloudinary } from '@/lib/services/cloudinary';
import { useEditorStore } from '../../../store/useEditorStore';
import { generateId } from '@/lib/utils/id';
import { Typography } from '@/components/shared/Typography';
import { X, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickProductVideoUploaderProps {
  videoUrl: string | null;
  onVideoChange: (url: string | null) => void;
  onError: (error: string | null) => void;
  disabled?: boolean;
}

export function QuickProductVideoUploader({
  videoUrl,
  onVideoChange,
  onError,
  disabled = false,
}: QuickProductVideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tempPreviewUrlRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { startUpload, updateUploadProgress, completeUpload, failUpload } = useEditorStore();

  /**
   * ✅ فحص مدة الفيديو في المتصفح قبل الرفع
   * بيوفر bandwidth لأننا بنرفض الفيديوهات الطويلة قبل الرفع
   */
  const checkVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => reject(new Error('فشل قراءة ملف الفيديو'));
      video.src = URL.createObjectURL(file);
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

    // ✅ تحقق من المدة (حد 10 ثوانٍ + هامش بسيط)
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

    setIsUploading(true);
    onError(null);

    const uploadId = generateId();
    const tempPreviewUrl = URL.createObjectURL(file);
    tempPreviewUrlRef.current = tempPreviewUrl;

    // ✅ Optimistic UI: إضافة الرفع فوراً
    startUpload(uploadId, tempPreviewUrl, {
      mediaType: 'video',
      size: file.size,
      mimeType: file.type,
    });

    try {
      // ✅ رفع إلى Cloudinary مع progress tracking
      const cloudinaryUrl = await uploadToCloudinary(file, (progress) => {
        updateUploadProgress(uploadId, progress);
      });

      // ✅ تحديث الحالة
      onVideoChange(cloudinaryUrl);
      completeUpload(uploadId, cloudinaryUrl);
      setIsUploading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'فشل رفع الفيديو';
      onError(errorMessage);
      failUpload(uploadId, errorMessage);
      setIsUploading(false);
    } finally {
      // ✅ تنظيف الـ preview URL (بعد ما نخلص استخدامه)
      if (tempPreviewUrlRef.current) {
        URL.revokeObjectURL(tempPreviewUrlRef.current);
        tempPreviewUrlRef.current = null;
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        فيديو المنتج (اختياري - 10 ثوانٍ كحد أقصى)
      </label>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-4 transition-all",
          videoUrl
            ? "border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20"
            : isUploading
            ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-slate-300 dark:border-slate-700 hover:border-primary/50"
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
              onClick={() => {
                onVideoChange(null);
                onError(null);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
              aria-label="إزالة الفيديو"
              disabled={disabled}
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
            <Typography variant="body-sm" className="text-center text-muted-foreground">
              {isUploading ? 'جاري رفع الفيديو...' : 'اضغط لرفع فيديو للمنتج'}
            </Typography>
            <Typography variant="caption" className="text-muted-foreground/70">
              MP4, WebM (حد أقصى 10 ثوانٍ / 20MB)
            </Typography>
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