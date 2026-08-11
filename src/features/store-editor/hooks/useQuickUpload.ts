// src/features/store-editor/hooks/useQuickUpload.ts

import { useState, useCallback, useRef, useEffect } from 'react';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
}

export interface UseQuickUploadOptions {
  uploadPreset?: string;
  cloudName?: string;
  timeout?: number;
}

export function useQuickUpload(options: UseQuickUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  // قراءة متغيرات البيئة مباشرةً
  const envUploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_1;
  const envCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_1;

  const {
    uploadPreset = envUploadPreset || 'dokany_quick_upload',
    cloudName = envCloudName || 'dokany',
    timeout = 60000,
  } = options;

  // تنظيف روابط المعاينة من الذاكرة عند Unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, []);

  const uploadToCloudinary = useCallback(
    async (file: File): Promise<CloudinaryUploadResult | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      // 🔍 [TRACE 1]: طباعة شجرة تتبع المتغيرات والملف
      console.group('🚀 [Cloudinary Upload Trace]');
      console.log('📌 Environment Check:', {
        isClientSide: typeof window !== 'undefined',
        rawEnvCloudName: envCloudName || 'UNDEFINED (لم يُقرأ من .env.local)',
        rawEnvPreset: envUploadPreset || 'UNDEFINED (لم يُقرأ من .env.local)',
      });
      console.log('📌 Active Configuration:', {
        usedCloudName: cloudName,
        usedUploadPreset: uploadPreset,
      });
      console.log('📁 Target File:', {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.type,
      });

      // 🚨 [TRACE 2]: التحقق السريع قبل إرسال الطلب
      if (!cloudName || cloudName === 'dokany') {
        const errorMsg = 'خطأ بيئة: لم يتم العثور على NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_1 في .env.local أو تم استخدام القيمة الافتراضية.';
        console.error('❌ [Trace Failed]:', errorMsg);
        console.groupEnd();
        setError(errorMsg);
        setIsUploading(false);
        return null;
      }

      if (abortControllerRef.current) {
        console.warn('⚠️ [Trace Notice]: تم إلغاء طلب الرفع السابق لبدء رفع جديد.');
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);

        const targetUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
        console.log('🌐 Target Endpoint:', targetUrl);

        // إلغاء الطلب عبر AbortController
        controller.signal.addEventListener('abort', () => {
          xhr.abort();
        });

        // 📊 متابعة تقدم الرفع
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setProgress(percentComplete);
            console.log(`⏳ Upload Progress: ${percentComplete}%`);
          }
        });

        // 📥 عند استقبال استجابة السيرفر
        xhr.addEventListener('load', () => {
          setIsUploading(false);
          console.log(`📡 Response Status: ${xhr.status} ${xhr.statusText}`);

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              setProgress(100);
              console.log('✅ [Upload Success]:', data);
              console.groupEnd();
              resolve({
                secure_url: data.secure_url,
                public_id: data.public_id,
                format: data.format,
                width: data.width,
                height: data.height,
                bytes: data.bytes,
                created_at: data.created_at,
              });
            } catch (err) {
              const msg = 'فشل معالجة استجابة JSON القادمة من Cloudinary';
              console.error('❌ [Parse Error]:', err, xhr.responseText);
              console.groupEnd();
              setError(msg);
              resolve(null);
            }
          } else {
            // 🚨 تحليل أخطاء سيرفر Cloudinary المتنوعة
            try {
              const errorData = JSON.parse(xhr.responseText);
              const apiErrorMsg = errorData.error?.message || 'خطأ غير معروف من Cloudinary';
              
              console.error('❌ [Cloudinary Error Details]:', {
                status: xhr.status,
                rawResponse: errorData,
                message: apiErrorMsg,
              });

              // إرشادات وحلول سريعة في الـ Console بناءً على رسالة الخطأ
              if (apiErrorMsg.includes('Invalid upload_preset')) {
                console.info('💡 نصيحة: تأكد من أن اسم الـ Upload Preset مطابق للوحة تحكم Cloudinary وأن نوعه Unsigned.');
              } else if (apiErrorMsg.includes('Must supply cloud_name')) {
                console.info('💡 نصيحة: اسم الـ Cloud Name غير صحيح أو فارغ.');
              }

              console.groupEnd();
              setError(`Cloudinary Error (${xhr.status}): ${apiErrorMsg}`);
            } catch {
              console.error('❌ [HTTP Error Unparsed]:', xhr.responseText);
              console.groupEnd();
              setError(`فشل رفع الصورة (رمز الحالة: ${xhr.status})`);
            }
            resolve(null);
          }
        });

        // 🌐 خطأ في الشبكة
        xhr.addEventListener('error', () => {
          setIsUploading(false);
          console.error('❌ [Network Error]: تعذر الاتصال بـ Cloudinary.');
          console.groupEnd();
          setError('خطأ في الاتصال أثناء رفع الملف، تحقق من شبكة الإنترنت');
          resolve(null);
        });

        // ⏰ تجاوز الوقت المحدد
        xhr.addEventListener('timeout', () => {
          setIsUploading(false);
          console.error(`❌ [Timeout Error]: تجاوز الطلب مدة الـ ${timeout}ms المحدد.`);
          console.groupEnd();
          setError('انتهت مهلة الرفع، يرجى المحاولة مرة أخرى');
          resolve(null);
        });

        // 🛑 إلغاء الرفع
        xhr.addEventListener('abort', () => {
          setIsUploading(false);
          console.warn('🛑 [Upload Aborted]: تم إلغاء رفع الملف.');
          console.groupEnd();
          setError('تم إلغاء الرفع');
          resolve(null);
        });

        xhr.timeout = timeout;
        xhr.open('POST', targetUrl);
        xhr.send(formData);
      });
    },
    [cloudName, uploadPreset, timeout, envCloudName, envUploadPreset]
  );

  const uploadWithPreview = useCallback(
    async (
      file: File
    ): Promise<{ result: CloudinaryUploadResult | null; preview: string }> => {
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.push(preview);

      const result = await uploadToCloudinary(file);
      return { result, preview };
    },
    [uploadToCloudinary]
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
    uploadToCloudinary,
    uploadWithPreview,
    cancelUpload,
    reset,
    isUploading,
    progress,
    error,
  };
}