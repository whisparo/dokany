// src/features/store-editor/hooks/useQuickUpload.ts

import { useState, useCallback, useRef, useEffect } from 'react';

export interface MediaUploadResult {
  mediaId: string;
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'processing' | 'ready';
}

export interface UseQuickUploadOptions {
  timeout?: number;
  entityType?: 'store_asset' | 'product_image' | 'general';
  entityId?: string;
  storeAccountIndex?: number | string | null;
  storeId?: string;
  uploadPreset?: string;
}

interface CloudinarySignatureResponse {
  success: boolean;
  data: {
    signature: string;
    timestamp: number;
    cloudName: string;
    apiKey: string;
    publicId: string;
    folder: string;
    resourceType: 'image' | 'video' | 'raw';
    uploadPreset?: string;
  };
  error?: string;
}

interface MediaConfirmResponse {
  success: boolean;
  message?: string;
  data: {
    id: string;
    url: string;
    storeId: string;
    type: string;
    mimeType: string;
    filename: string;
    size: number;
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * ✅ Hook للرفع المباشر إلى Cloudinary باستخدام Signed Upload و Unsigned Preset كخيار افتراضي
 */
export function useQuickUpload(options: UseQuickUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const {
    timeout = 120000,
    entityType = 'general',
    entityId,
    storeId,
    uploadPreset = 'dokany_unsigned_preset',
  } = options;

  // تنظيف روابط المعاينة عند Unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, []);

  /**
   * ✅ الحصول على توقيع Cloudinary من Worker
   */
  const getCloudinarySignature = useCallback(
    async (file: File): Promise<CloudinarySignatureResponse['data']> => {
      if (!storeId) {
        throw new Error('معرف المتجر مطلوب للحصول على توقيع الرفع');
      }

      const response = await fetch('/api/media/cloudinary-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify({
          resourceType: file.type.startsWith('video/') ? 'video' : 'image',
          folder: `stores/${storeId}`,
          uploadPreset,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'فشل الحصول على توقيع Cloudinary');
      }

      const result = (await response.json()) as CloudinarySignatureResponse;
      if (!result.success || !result.data) {
        throw new Error(result.error || 'فشل الحصول على توقيع Cloudinary');
      }

      return result.data;
    },
    [storeId, uploadPreset]
  );

  /**
   * ✅ رفع الملف إلى Cloudinary
   */
  const uploadToCloudinaryWithSignature = useCallback(
    async (
      file: File,
      signatureData: Awaited<ReturnType<typeof getCloudinarySignature>>
    ): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureData.apiKey);
      formData.append('timestamp', String(signatureData.timestamp));
      formData.append('signature', signatureData.signature);
      formData.append('public_id', signatureData.publicId);
      formData.append('folder', signatureData.folder);

      const activePreset = signatureData.uploadPreset || uploadPreset;
      if (activePreset) {
        formData.append('upload_preset', activePreset);
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/auto/upload`;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.timeout = timeout;

        if (xhr.upload) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText) as { secure_url?: string };
              if (!response.secure_url) {
                reject(new Error('استجابة Cloudinary لا تحتوي على رابط آمن (secure_url)'));
                return;
              }
              resolve(response.secure_url);
            } catch {
              reject(new Error('فشل معالجة استجابة Cloudinary'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText) as {
                error?: { message?: string };
              };
              reject(
                new Error(
                  errorResponse?.error?.message || `فشل الرفع (HTTP ${xhr.status})`
                )
              );
            } catch {
              reject(new Error(`فشل الرفع (HTTP ${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('خطأ في الشبكة أثناء الرفع'));
        xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع، يرجى المحاولة مرة أخرى'));
        xhr.send(formData);
      });
    },
    [timeout, uploadPreset]
  );

  const uploadMedia = useCallback(
    async (file: File): Promise<MediaUploadResult | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      console.group('🚀 [Cloudinary Upload Pipeline]');
      console.log('📁 Target File:', {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.type,
      });

      if (abortControllerRef.current) {
        console.warn('⚠️ Aborting previous upload request.');
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Step 1: الحصول على التوقيع من Worker
        console.log('📡 Step 1: Fetching Cloudinary signature...');
        const signatureData = await getCloudinarySignature(file);
        console.log('✅ Signature obtained:', {
          cloudName: signatureData.cloudName,
          publicId: signatureData.publicId,
          folder: signatureData.folder,
        });

        // Step 2: رفع الملف إلى Cloudinary
        console.log('📡 Step 2: Uploading to Cloudinary...');
        const cloudinaryUrl = await uploadToCloudinaryWithSignature(file, signatureData);
        console.log('✅ Cloudinary Upload Success:', cloudinaryUrl);

        // Step 3: تأكيد الرفع مع السيرفر
        console.log('📡 Step 3: Confirming upload with backend...');
        const confirmRes = await fetch('/api/media/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-store-id': storeId || '',
          },
          body: JSON.stringify({
            url: cloudinaryUrl,
            originalUrl: cloudinaryUrl,
            type: file.type.startsWith('video/') ? 'video' : 'image',
            mimeType: file.type,
            filename: file.name,
            size: file.size,
            productId: entityType === 'product_image' ? entityId : undefined,
          }),
          signal: controller.signal,
        });

        if (!confirmRes.ok) {
          const errData = (await confirmRes.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(errData.error || errData.message || 'فشل تأكيد الرفع مع السيرفر');
        }

        const confirmData = (await confirmRes.json()) as MediaConfirmResponse;
        console.log('🎉 [Upload & Confirmation Complete]:', confirmData);
        console.groupEnd();

        setProgress(100);
        setIsUploading(false);

        const savedMedia = confirmData.data;

        return {
          mediaId: savedMedia?.id || 'temp-id',
          url: savedMedia?.url || cloudinaryUrl,
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
          status: 'processing',
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('🛑 Upload request was aborted.');
        } else {
          const errorMessage =
            err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الرفع';
          console.error('❌ [Upload Pipeline Failed]:', err);
          setError(errorMessage);
        }
        setIsUploading(false);
        console.groupEnd();
        return null;
      }
    },
    [entityType, entityId, storeId, getCloudinarySignature, uploadToCloudinaryWithSignature]
  );

  const uploadWithPreview = useCallback(
    async (file: File): Promise<{ result: MediaUploadResult | null; preview: string }> => {
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.push(preview);

      const result = await uploadMedia(file);
      return { result, preview };
    },
    [uploadMedia]
  );

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsUploading(false);
      setProgress(0);
    }
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return {
    uploadMedia,
    uploadWithPreview,
    cancelUpload,
    reset,
    isUploading,
    progress,
    error,
  };
}