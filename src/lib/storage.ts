// src/lib/storage.ts

import { AwsClient } from 'aws4fetch';
import type { Env } from '@/lib/env';

// ============================================================
// 📦 Cache للـ AwsClient لتحسين الأداء
// ============================================================
let cachedClient: { client: AwsClient; baseUrl: string } | null = null;
let cachedEnvSignature: string | null = null;

// ============================================================
// 🧹 تنظيف وتنسيق الـ Key لمنع أخطاء الـ Double Encoding و Slashing
// ============================================================
function cleanKey(key: string): string {
  // إزالة الشرطات المائلة في البداية وتوحيد المكرر منها
  return key.replace(/^\/+/, '').replace(/\/+/g, '/');
}

// ============================================================
// 🎯 التخمين التلقائي لـ Content-Type بناءً على امتداد الملف
// ============================================================
function guessContentType(key: string, providedType?: string): string {
  if (providedType) return providedType;

  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'parquet':
      return 'application/octet-stream';
    case 'json':
      return 'application/json';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'txt':
      return 'text/plain';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'xml':
      return 'application/xml';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

// ============================================================
// 🛠️ تجهيز AwsClient متوافق مع S3 API لـ Backblaze B2
// ============================================================
function getB2Client(env: Env) {
  if (!env.B2_ACCESS_KEY_ID || !env.B2_SECRET_ACCESS_KEY || !env.B2_BUCKET_NAME) {
    throw new Error(
      'SYS_500: متغيرات بيئة Backblaze B2 غير مكتملة. تأكد من ضبط B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME'
    );
  }

  const envSignature = `${env.B2_ACCESS_KEY_ID}:${env.B2_BUCKET_NAME}`;

  if (cachedClient && cachedEnvSignature === envSignature) {
    return cachedClient;
  }

  const rawEndpoint = env.B2_ENDPOINT || 'https://s3.us-west-004.backblazeb2.com';
  const endpoint = rawEndpoint.replace(/\/$/, '');

  const regionMatch = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/);
  const region = regionMatch ? regionMatch[1] : 'us-west-004';

  const client = new AwsClient({
    accessKeyId: env.B2_ACCESS_KEY_ID,
    secretAccessKey: env.B2_SECRET_ACCESS_KEY,
    service: 's3',
    region,
  });

  const baseUrl = `${endpoint}/${env.B2_BUCKET_NAME}`;
  const result = { client, baseUrl };

  cachedClient = result;
  cachedEnvSignature = envSignature;

  return result;
}

// ============================================================
// 🌐 Helper لإجراء fetch مع timeout
// ============================================================
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  client: AwsClient,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const signedRequest = await client.sign(url, options);
    const response = await fetch(signedRequest, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`SYS_500: انتهت مهلة الطلب (${timeoutMs}ms) لـ ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 🔧 Helper لفك ترميز XML entities
// ============================================================
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ============================================================
// ⬆️ رفع ملف إلى Backblaze B2 بتوقيع SigV4
// ============================================================
export async function uploadToB2(
  key: string,
  body: string | ArrayBuffer | ReadableStream | Blob,
  env: Env,
  contentType?: string,
  timeoutMs: number = 60000
): Promise<void> {
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  const mimeType = guessContentType(key, contentType);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      body: body as BodyInit,
    },
    client,
    timeoutMs
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `SYS_500: فشل رفع الملف لـ B2 (${response.status}): ${errText || response.statusText}`
    );
  }
}

// ============================================================
// ⬇️ تحميل ملف من Backblaze B2
// ============================================================
export async function downloadFromB2(
  key: string,
  env: Env,
  timeoutMs: number = 30000
): Promise<string | null> {
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  const response = await fetchWithTimeout(
    url,
    { method: 'GET' },
    client,
    timeoutMs
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `SYS_500: فشل تحميل الملف من B2 (${response.status}): ${response.statusText}`
    );
  }

  return response.text();
}

// ============================================================
// 🗑️ حذف ملف من Backblaze B2
// ============================================================
export async function deleteFromB2(
  key: string,
  env: Env,
  timeoutMs: number = 15000
): Promise<void> {
  const safeKey = cleanKey(key);
  const { client, baseUrl } = getB2Client(env);
  const url = `${baseUrl}/${safeKey}`;

  const response = await fetchWithTimeout(
    url,
    { method: 'DELETE' },
    client,
    timeoutMs
  );

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(
      `SYS_500: فشل حذف الملف من B2 (${response.status}): ${response.statusText}`
    );
  }
}

// ============================================================
// 📋 جلب قائمة الملفات مع دعم Pagination عبر continuation-token
// ============================================================
export async function listB2Objects(
  prefix: string,
  env: Env,
  maxKeys: number = 1000,
  timeoutMs: number = 30000
): Promise<string[]> {
  const { client, baseUrl } = getB2Client(env);
  const keys: string[] = [];

  let continuationToken: string | null = null;
  let isTruncated = false;
  let pageCount = 0;
  const MAX_PAGES = 100;

  do {
    pageCount++;
    if (pageCount > MAX_PAGES) {
      console.warn(`⚠️ listB2Objects: وصلنا للحد الأقصى (${MAX_PAGES} صفحة)، إيقاف مبكر.`);
      break;
    }

    const url = new URL(baseUrl);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', cleanKey(prefix));
    url.searchParams.set('max-keys', String(maxKeys));

    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken);
    }

    const response = await fetchWithTimeout(
      url.toString(),
      { method: 'GET' },
      client,
      timeoutMs
    );

    if (!response.ok) {
      throw new Error(
        `SYS_500: فشل استعلام قائمة B2 (${response.status}): ${response.statusText}`
      );
    }

    const xmlText = await response.text();

    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(xmlText)) !== null) {
      if (match[1]) {
        const decodedXml = decodeXmlEntities(match[1]);
        try {
          keys.push(decodeURIComponent(decodedXml));
        } catch {
          keys.push(decodedXml);
        }
      }
    }

    isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xmlText);

    if (isTruncated) {
      const tokenMatch = xmlText.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
      continuationToken = tokenMatch ? decodeXmlEntities(tokenMatch[1]) : null;
    } else {
      continuationToken = null;
    }
  } while (isTruncated && continuationToken);

  return keys;
}

// ============================================================
// 🧹 مسح الـ cache
// ============================================================
export function clearB2ClientCache(): void {
  cachedClient = null;
  cachedEnvSignature = null;
}