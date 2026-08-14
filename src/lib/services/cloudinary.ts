// src/lib/services/cloudinary.ts

import type { D1Database } from '@cloudflare/workers-types';

export type CloudinaryAccount = {
  id: number;
  cloudName: string;
  uploadPreset: string;
  apiKey: string;
  apiSecret: string;
};

export type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
  resource_type: 'image' | 'video' | 'raw';
};

export interface CloudinaryEnv {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_1?: string;
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_1?: string;
  NEXT_PUBLIC_CLOUDINARY_API_KEY_1?: string;
  CLOUDINARY_API_SECRET_1?: string;
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_2?: string;
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_2?: string;
  NEXT_PUBLIC_CLOUDINARY_API_KEY_2?: string;
  CLOUDINARY_API_SECRET_2?: string;
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_3?: string;
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_3?: string;
  NEXT_PUBLIC_CLOUDINARY_API_KEY_3?: string;
  CLOUDINARY_API_SECRET_3?: string;
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_4?: string;
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_4?: string;
  NEXT_PUBLIC_CLOUDINARY_API_KEY_4?: string;
  CLOUDINARY_API_SECRET_4?: string;
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_5?: string;
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_5?: string;
  NEXT_PUBLIC_CLOUDINARY_API_KEY_5?: string;
  CLOUDINARY_API_SECRET_5?: string;
  [key: string]: string | undefined;
}

/**
 * القراءة الحرفية لمتغيرات البيئة لدعم Next.js Bundler و Cloudflare Workers
 */
export function loadAccounts(env?: CloudinaryEnv): CloudinaryAccount[] {
  const raw = [
    {
      id: 1,
      cloudName: env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_1 ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_1,
      uploadPreset: env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_1 ?? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_1 ?? 'dokany_unsigned_preset',
      apiKey: env?.NEXT_PUBLIC_CLOUDINARY_API_KEY_1 ?? process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY_1 ?? '',
      apiSecret: env?.CLOUDINARY_API_SECRET_1 ?? process.env.CLOUDINARY_API_SECRET_1 ?? '',
    },
    {
      id: 2,
      cloudName: env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_2 ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_2,
      uploadPreset: env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_2 ?? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_2 ?? 'dokany_unsigned_preset',
      apiKey: env?.NEXT_PUBLIC_CLOUDINARY_API_KEY_2 ?? process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY_2 ?? '',
      apiSecret: env?.CLOUDINARY_API_SECRET_2 ?? process.env.CLOUDINARY_API_SECRET_2 ?? '',
    },
    {
      id: 3,
      cloudName: env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_3 ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_3,
      uploadPreset: env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_3 ?? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_3 ?? 'dokany_unsigned_preset',
      apiKey: env?.NEXT_PUBLIC_CLOUDINARY_API_KEY_3 ?? process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY_3 ?? '',
      apiSecret: env?.CLOUDINARY_API_SECRET_3 ?? process.env.CLOUDINARY_API_SECRET_3 ?? '',
    },
    {
      id: 4,
      cloudName: env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_4 ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_4,
      uploadPreset: env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_4 ?? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_4 ?? 'dokany_unsigned_preset',
      apiKey: env?.NEXT_PUBLIC_CLOUDINARY_API_KEY_4 ?? process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY_4 ?? '',
      apiSecret: env?.CLOUDINARY_API_SECRET_4 ?? process.env.CLOUDINARY_API_SECRET_4 ?? '',
    },
    {
      id: 5,
      cloudName: env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_5 ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_5,
      uploadPreset: env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_5 ?? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_5 ?? 'dokany_unsigned_preset',
      apiKey: env?.NEXT_PUBLIC_CLOUDINARY_API_KEY_5 ?? process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY_5 ?? '',
      apiSecret: env?.CLOUDINARY_API_SECRET_5 ?? process.env.CLOUDINARY_API_SECRET_5 ?? '',
    },
  ];

  return raw.filter((a): a is CloudinaryAccount => Boolean(a.cloudName));
}

/**
 * اختيار حساب عشوائي للحالات الاحتياطية العامة
 */
export function getNextCloudinaryAccount(env?: CloudinaryEnv): CloudinaryAccount {
  const accounts = loadAccounts(env);
  if (accounts.length === 0) {
    throw new Error('SYS_500: لم يتم ضبط حسابات Cloudinary في متغيرات البيئة');
  }
  return accounts[Math.floor(Math.random() * accounts.length)];
}

/**
 * تخصيص أنسب حساب متوازن للمتجر ببيئة D1
 */
export async function allocateCloudinaryAccount(
  d1Database: D1Database,
  env?: CloudinaryEnv
): Promise<number> {
  const accounts = loadAccounts(env);
  if (accounts.length === 0) return 1;

  try {
    const { drizzle } = await import('drizzle-orm/d1');
    const { sql, isNull } = await import('drizzle-orm');
    const { stores } = await import('@/lib/db/schema');

    const db = drizzle(d1Database);
    const stats = await db
      .select({
        accountIndex: stores.cloudinaryAccountIndex,
        count: sql<number>`count(*)`,
      })
      .from(stores)
      .where(isNull(stores.deletedAt))
      .groupBy(stores.cloudinaryAccountIndex);

    const statsMap = new Map<string, number>(
      stats.map((row) => [
        row.accountIndex !== null ? String(row.accountIndex) : '1',
        row.count,
      ])
    );

    let minCount = Infinity;
    let targetIndex = 1;

    for (let i = 1; i <= accounts.length; i++) {
      const currentCount = statsMap.get(String(i)) || 0;
      if (currentCount < minCount) {
        minCount = currentCount;
        targetIndex = i;
      }
    }

    return targetIndex;
  } catch (err) {
    console.error('⚠️ [Cloudinary Allocation Failed]:', err);
    return 1;
  }
}

/**
 * جلب بيانات حساب محدد برقم المؤشر (Account Index)
 */
export function getStoreCloudinaryAccount(
  storeAccountIndex: string | number | null | undefined,
  env?: CloudinaryEnv
): CloudinaryAccount {
  const accounts = loadAccounts(env);
  if (accounts.length === 0) {
    throw new Error('SYS_500: لم يتم ضبط حسابات Cloudinary في متغيرات البيئة');
  }

  if (!storeAccountIndex) return accounts[0];

  const index =
    typeof storeAccountIndex === 'number'
      ? storeAccountIndex
      : parseInt(storeAccountIndex, 10);

  if (isNaN(index) || index < 1 || index > accounts.length) {
    return accounts[0];
  }

  return accounts[index - 1];
}

/**
 * رفع الوسائط إلى Cloudinary مع دعم البيئات المزدوجة (Edge/Server & Client Browser)
 * ودعم توجيه الرفع للحساب المخصص للمتجر
 */
export async function uploadToCloudinary(
  file: File,
  storeAccountIndex?: number | string | null,
  onProgress?: (progress: number) => void,
  env?: CloudinaryEnv
): Promise<string> {
  if (!file) {
    throw new Error('لم يتم تحديد ملف للرفع');
  }

  // استخدام حساب المتجر المخصص، أو السقوط للحساب العشوائي
  const account = storeAccountIndex
    ? getStoreCloudinaryAccount(storeAccountIndex, env)
    : getNextCloudinaryAccount(env);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', account.uploadPreset);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/auto/upload`;

  // 1. إذا كان التنفيذ في المتصفح وتوفر XMLHttpRequest، نستخدمه لحساب الـ Progress
  if (typeof window !== 'undefined' && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
            if (!response.secure_url) {
              reject(new Error('استجابة Cloudinary لا تحتوي على رابط آمن (secure_url)'));
              return;
            }
            resolve(response.secure_url);
          } catch {
            reject(new Error('فشل معالجة استجابة الخادم'));
          }
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText) as { error?: { message?: string } };
            reject(new Error(errorResponse?.error?.message || `فشل رفع الملف (HTTP ${xhr.status})`));
          } catch {
            reject(new Error(`فشل رفع الملف (HTTP ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('حدث خطأ في الاتصال بالشبكة أثناء الرفع'));
      xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع، يرجى المحاولة مرة أخرى'));
      xhr.timeout = 60000;
      xhr.send(formData);
    });
  }

  // 2. إذا كان التنفيذ في بيئة Edge/Server (Cloudflare Workers / Next.js Runtime)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(errorData?.error?.message || `فشل رفع الملف (HTTP ${response.status})`);
    }

    const data = (await response.json()) as CloudinaryUploadResponse;
    if (!data.secure_url) {
      throw new Error('استجابة Cloudinary لا تحتوي على رابط آمن (secure_url)');
    }

    if (onProgress) onProgress(100);
    return data.secure_url;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('انتهت مهلة الرفع، يرجى المحاولة مرة أخرى');
      }
      throw error;
    }
    throw new Error('حدث خطأ غير متوقع أثناء رفع الملف');
  }
}