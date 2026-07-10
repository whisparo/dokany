// src/lib/storage.ts
import type { Env } from '@/lib/env';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';

export function createB2Client(env: Env): S3Client {
  return new S3Client({
    region: 'auto', 
    endpoint: env.B2_ENDPOINT,
    credentials: {
      accessKeyId: env.B2_ACCESS_KEY_ID,
      secretAccessKey: env.B2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, 
  });
}

// 1. الرفع لـ B2
export async function uploadToB2(
  key: string,
  body: string | Buffer | Uint8Array, 
  env: Env
): Promise<void> {
  const client = createB2Client(env);
  
  await client.send(
    new PutObjectCommand({
      Bucket: env.B2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: key.endsWith('.parquet') ? 'application/octet-stream' : 'application/json',
    })
  );
}

// 2. التحميل من B2 
export async function downloadFromB2(
  key: string,
  env: Env
): Promise<string | null> {
  const client = createB2Client(env);
  
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.B2_BUCKET_NAME,
        Key: key,
      })
    );
    
    return await result.Body?.transformToString() || null;
  } catch (error) {
    // تشيك نظيف متوافق مع TypeScript للأقواس والأنواع
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

// 3. المسح من B2
export async function deleteFromB2(
  key: string,
  env: Env
): Promise<void> {
  const client = createB2Client(env);
  
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.B2_BUCKET_NAME,
      Key: key,
    })
  );
}

// 4. جلب قائمة الملفات
export async function listB2Objects(
  prefix: string,
  env: Env
): Promise<string[]> {
  const client = createB2Client(env);
  
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: env.B2_BUCKET_NAME,
      Prefix: prefix,
    })
  );
  
  return result.Contents?.map(obj => obj.Key || '') || [];
}