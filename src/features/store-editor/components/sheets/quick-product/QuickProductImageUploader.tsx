// src/features/store-editor/components/sheets/quick-product/QuickProductImageUploader.tsx

'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { uploadToCloudinary } from '@/lib/services/cloudinary';
import { useEditorStore } from '../../../store/useEditorStore';
import { generateId } from '@/lib/utils/id';
import { Typography } from '@/components/shared/Typography';
import { X, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickProductImageUploaderProps {
  tempUrl: string | null;
  onImageChange: (url: string | null) => void;
  onError: (error: string | null) => void;
  disabled?: boolean;
}

export function QuickProductImageUploader({
  tempUrl,
  onImageChange,
  onError,
  disabled = false,
}: QuickProductImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const tempPreviewUrlRef = useRef<string | null>(null);
  const { startUpload, updateUploadProgress, completeUpload, failUpload } = useEditorStore();

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

    setIsUploading(true);
    onError(null);

    const uploadId = generateId();
    const tempPreviewUrl = URL.createObjectURL(file);
    tempPreviewUrlRef.current = tempPreviewUrl;

    // ✅ Optimistic UI: إضافة الرفع فوراً
    startUpload(uploadId, tempPreviewUrl, {
      mediaType: 'image',
      size: file.size,
      mimeType: file.type,
    });

    try {
      // ✅ رفع إلى Cloudinary مع progress tracking
      const cloudinaryUrl = await uploadToCloudinary(file, (progress) => {
        updateUploadProgress(uploadId, progress);
      });

      // ✅ تحديث الحالة
      onImageChange(cloudinaryUrl);
      completeUpload(uploadId, cloudinaryUrl);
      setIsUploading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'فشل رفع الصورة';
      onError(errorMessage);
      failUpload(uploadId, errorMessage);
      setIsUploading(false);
    } finally {
      // ✅ تنظيف الـ preview URL
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
      <label className="block text-sm font-medium mb-1.5">صورة المنتج *</label>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-4 transition-all",
          tempUrl
            ? "border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20"
            : isUploading
            ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-slate-300 dark:border-slate-700 hover:border-primary/50"
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
              onClick={() => {
                onImageChange(null);
                onError(null);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
              aria-label="إزالة الصورة"
              disabled={disabled}
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
            <Typography variant="body-sm" className="text-center text-muted-foreground">
              {isUploading ? 'جاري رفع الصورة...' : 'اضغط لرفع صورة المنتج'}
            </Typography>
            <Typography variant="caption" className="text-muted-foreground/70">
              JPG, PNG, WebP (حد أقصى 5MB)
            </Typography>
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