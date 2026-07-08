// src/lib/services/cloudinary-allocator.ts
import "server-only"; // 🔒 حماية تامة من التسريب للـ Client
import { sql, isNull, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { stores } from '@/lib/db/schema';
import { classifyError } from '@/lib/errors/classifier';

export type CloudinaryAccount = {
  id: number;
  cloudName: string;
  uploadPreset: string;
  apiKey: string;
  apiSecret: string; 
};

function loadAccounts(): CloudinaryAccount[] {
  const accounts: CloudinaryAccount[] = [];
  const MAX_ACCOUNTS = 10;

  for (let i = 1; i <= MAX_ACCOUNTS; i++) {
    const cloudName = process.env[`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_${i}`];
    if (!cloudName) continue;

    accounts.push({
      id: i,
      cloudName,
      uploadPreset: process.env[`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_${i}`] || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "dokany_unsigned",
      apiKey: process.env[`NEXT_PUBLIC_CLOUDINARY_API_KEY_${i}`] || "",
      apiSecret: process.env[`CLOUDINARY_API_SECRET_${i}`] || "", 
    });
  }
  return accounts;
}

const allAccounts = loadAccounts();

/**
 * 🎰 الـ Round‑Robin السحري المتوافق مع الـ Serverless
 */
export function getNextCloudinaryAccount(): CloudinaryAccount {
  if (allAccounts.length === 0) {
    throw classifyError(
      new Error("SYS_500: Cloudinary accounts are not configured in environment variables")
    );
  }
  
  const randomIndex = Math.floor(Math.random() * allAccounts.length);
  return allAccounts[randomIndex];
}

/**
 * 🧠 التوزيع الذكي المحدث (Zero N+1 Queries)
 */
export async function allocateCloudinaryAccount(d1Database: D1Database): Promise<number> {
  if (allAccounts.length === 0) return 1;

  const db = drizzle(d1Database);

  // 1. استعلام الإحصائية - فرضنا الـ Type الراجع مباشرة داخل الـ select بـ sql<number> صريحة ونظيفة
  const stats = await db
    .select({
      accountIndex: stores.cloudinaryAccountIndex,
      count: sql<number>`count(*)`
    })
    .from(stores)
    .where(isNull(stores.deletedAt))
    .groupBy(stores.cloudinaryAccountIndex);

  // 2. تحويل المخرجات لـ Map - الـ Compiler الحين عارف الـ Types تلقائياً (accountIndex هو number أو null)
  const statsMap = new Map<string, number>(
    stats.map((row) => [
      row.accountIndex !== null ? String(row.accountIndex) : "1", 
      row.count
    ])
  );

  let minCount = Infinity;
  let targetIndex = 1;

  // 3. البحث في الـ Memory عن الحساب الأقل استهلاكاً
  for (let i = 1; i <= allAccounts.length; i++) {
    const currentCount = statsMap.get(String(i)) || 0;
    if (currentCount < minCount) {
      minCount = currentCount;
      targetIndex = i;
    }
  }

  return targetIndex;
}

/**
 * 🏪 جلب إعدادات حساب Cloudinary الملتصق بالمتجر
 */
export function getStoreCloudinaryAccount(storeAccountIndex: string | number | null | undefined): CloudinaryAccount | undefined {
  if (!storeAccountIndex) return undefined;
  
  const index = typeof storeAccountIndex === 'number' 
    ? storeAccountIndex 
    : parseInt(storeAccountIndex, 10);

  if (isNaN(index) || index < 1 || index > allAccounts.length) return undefined;
  return allAccounts[index - 1];
}