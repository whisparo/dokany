// src/lib/storage.ts
import { AwsClient } from 'aws4fetch';
import type { Env } from '@/lib/env';

/**
 * تنظيف وتنسيق الـ Key لمنع أخطاء الـ URL Encoding مع المسارات
 */
function cleanKey(key: string): string {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/**
 * تجهيز AwsClient متوافق مع S3 API لـ Backblaze B2
 */
function getB2Client(env: Env) {
  // استخراج الـ Region من الـ Endpoint تلقائياً (مثال: https://s3.us-west-004.backblazeb2.com)
  const endpoint = (env.B2_ENDPOINT || 'https://s3.us-west-004.backblazeb2.com').replace(/\/$/, '');
  const regionMatch = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/);
  const region = regionMatch ? regionMatch[1] : 'us-west-004';

  const client = new AwsClient({
    accessKeyId: env.B2_ACCESS_KEY_ID,
    secretAccessKey: env.B2_SECRET_ACCESS_KEY,
    service: 's3',
    region,
  });

  const baseUrl = `${endpoint}/${env.B2_BUCKET_NAME}`;

  return { client, baseUrl };
}

/**
 * رفع ملف إلى Backblaze B2 بتوقيع SigV4
 */
export async function uploadToB2(
  key: string,
  body: string | ArrayBuffer | ReadableStream,
  env: Env
): Promise<void> {
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  // client.fetch تقوم بتوليد Authorization Header (AWS SigV4) تلقائياً
  const response = await client.fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': key.endsWith('.parquet') ? 'application/octet-stream' : 'application/json',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', // لتسريع الأداء على Edge
    },
    body: body as BodyInit,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`B2 upload failed (${response.status}): ${errText || response.statusText}`);
  }
}

/**
 * تحميل ملف من Backblaze B2
 */
export async function downloadFromB2(
  key: string,
  env: Env
): Promise<string | null> {
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  const response = await client.fetch(url, {
    method: 'GET',
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
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  const response = await client.fetch(url, {
    method: 'DELETE',
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
  const { client, baseUrl } = getB2Client(env);
  // S3 API بترجع XML عند استدعاء list-type=2
  const url = `${baseUrl}?list-type=2&prefix=${encodeURIComponent(prefix)}`;

  const response = await client.fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`B2 list failed: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  
  // استخراج الـ Keys من الـ XML المرجَع من S3
  const keys: string[] = [];
  const matches = xmlText.matchAll(/<Key>(.*?)<\/Key>/g);
  for (const match of matches) {
    if (match[1]) {
      keys.push(decodeURIComponent(match[1]));
    }
  }

  return keys;
}