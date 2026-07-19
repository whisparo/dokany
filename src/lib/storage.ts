// src/lib/storage.ts
import type { Env } from '@/lib/env';

/**
 * رفع ملف إلى Backblaze B2 باستخدام fetch
 * ✅ متوافق مع Edge: يقبل string, ArrayBuffer, ReadableStream
 */
export async function uploadToB2(
  key: string,
  body: string | ArrayBuffer | ReadableStream,
  env: Env
): Promise<void> {
  const url = `${env.B2_ENDPOINT}/${env.B2_BUCKET_NAME}/${key}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.B2_ACCESS_KEY_ID}:${env.B2_SECRET_ACCESS_KEY}`,
      'Content-Type': key.endsWith('.parquet') ? 'application/octet-stream' : 'application/json',
    },
    body: body as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`B2 upload failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * تحميل ملف من Backblaze B2
 */
export async function downloadFromB2(
  key: string,
  env: Env
): Promise<string | null> {
  const url = `${env.B2_ENDPOINT}/${env.B2_BUCKET_NAME}/${key}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.B2_ACCESS_KEY_ID}:${env.B2_SECRET_ACCESS_KEY}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`B2 download failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * حذف ملف من Backblaze B2
 */
export async function deleteFromB2(
  key: string,
  env: Env
): Promise<void> {
  const url = `${env.B2_ENDPOINT}/${env.B2_BUCKET_NAME}/${key}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${env.B2_ACCESS_KEY_ID}:${env.B2_SECRET_ACCESS_KEY}`,
    },
  });

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`B2 delete failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * جلب قائمة الملفات من Backblaze B2
 */
export async function listB2Objects(
  prefix: string,
  env: Env
): Promise<string[]> {
  const url = `${env.B2_ENDPOINT}/${env.B2_BUCKET_NAME}?prefix=${encodeURIComponent(prefix)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.B2_ACCESS_KEY_ID}:${env.B2_SECRET_ACCESS_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`B2 list failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.files?.map((file: any) => file.fileName) || [];
}