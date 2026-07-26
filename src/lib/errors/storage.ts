// src/lib/errors/storage.ts

import { uploadToB2 } from '@/lib/storage'; // ✅ السطر ده كان ناقص
import type { Env } from '@/lib/env';

export async function saveErrorToB2(error: any, env: Env): Promise<string> {
  const timestamp = new Date().toISOString();
  const key = `errors/${timestamp}-${error.id || 'system'}.json`;

  // ✅ استخدام دالة uploadToB2 المجلوبة
  await uploadToB2(key, JSON.stringify(error, null, 2), env);

  return key;
}