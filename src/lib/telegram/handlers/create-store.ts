// src/lib/telegram/handlers/create-store.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { stores, users } from '@/lib/db/schema'; 
import { eq } from 'drizzle-orm';
import { allocateCloudinaryAccount } from '@/lib/services/cloudinary'; 
import { classifyError } from '@/lib/errors/classifier';

interface CreateStoreInput {
  phone: string;
  name: string;
  storeName: string;
  telegramUserId?: string | number;
}

async function generateLoginLink(userId: string, storeId: string): Promise<string> {
  return `https://dokanyy.vercel.app/dashboard?user=${userId}&store=${storeId}`;
}

/**
 * 🏪 إنشاء متجر جديد ومستخدم ممتثل تماماً لـ الـ SQLite / D1 Types والسكيما الرسمية
 */
export async function createStore(
  d1Database: D1Database, 
  data: CreateStoreInput
): Promise<{ url: string; dashboardLink: string }> {
  const db = drizzle(d1Database);
  let userId: string;

  // 1️⃣ البحث عن المستخدم أو إنشائه
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, data.phone))
    .get();

  if (existingUser) {
    userId = existingUser.id;
    if (!existingUser.telegramId && data.telegramUserId) {
      try {
        await db
          .update(users)
          .set({ telegramId: String(data.telegramUserId), updatedAt: new Date() })
          .where(eq(users.id, existingUser.id));
        console.log(`✅ [createStore] تم تحديث telegramId للمستخدم ${existingUser.id}`);
      } catch (updateError) {
        console.error(`❌ [createStore] فشل تحديث telegramId للمستخدم ${existingUser.id}:`, updateError);
      }
    }
  } else {
    try {
      const generatedId = crypto.randomUUID(); 
      
      // ✅ مطابقة رياضية تامة لـ InferInsertModel الخاصة بجدول الـ user بناءً على السكيما المبعوتة
      const insertedUsers = await db
        .insert(users)
        .values({
          id: generatedId,
          name: data.name,
          phoneNumber: data.phone,
          authMethod: 'phone',
          status: 'active', // متوافق مع chk_user_status
          isVerified: true,
          emailVerified: false, // 🧠 قفلنا الخطأ هنا: مررناها صريحة لأنها notNull في السكيما والـ Compiler مستنيها
          telegramId: data.telegramUserId ? String(data.telegramUserId) : null,
          // تم حذف createdAt و updatedAt تماماً عشان الـ DB يحسبهم بالـ default الافتراضي (strftime)
        })
        .returning();
      
      const newUser = insertedUsers[0];
      if (!newUser) throw new Error('BIZ_500: Failed to capture newly created user identity');
      userId = newUser.id;
      console.log(`✅ [createStore] تم إنشاء مستخدم جديد ${userId}`);
    } catch (insertError) {
      console.error('❌ [createStore] فشل إنشاء المستخدم الجديد:', insertError);
      throw classifyError(insertError);
    }
  }

  // 2️⃣ توليد Slug نظيف
  let slugBase = data.storeName
    .trim()
    .replace(/\s+/g, '-') 
    .replace(/[^\u0600-\u06FFa-zA-Z0-9-]/g, '') 
    .normalize('NFC');

  if (!slugBase) slugBase = 'store';

  const existingStore = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, slugBase))
    .get();

  const slug = existingStore
    ? `${slugBase}-${Math.random().toString(36).slice(2, 6)}`
    : slugBase;

  // 3️⃣ تخصيص حساب Cloudinary
  const allocatedAccountIndex = await allocateCloudinaryAccount(d1Database);

  // 4️⃣ تجهيز كائن الـ Theme الصافي ليتوافق مع الـ SQLiteText
  const defaultTheme = {
    colors: {
      primary: '#2563eb',
      secondary: '#7c3aed',
      background: '#ffffff',
      text: '#111827',
    },
    radii: {
      card: '0.75rem',
      button: '0.5rem',
      input: '0.5rem',
    },
    fontFamily: 'Cairo, sans-serif',
  };

  // 5️⃣ إنشاء المتجر ومطابقته مع السكيما بدون أي ترقيع
  const insertedStores = await db
    .insert(stores)
    .values({
      id: crypto.randomUUID(), 
      ownerId: userId,
      name: data.storeName,
      slug: slug,
      currency: 'EGP',
      country: 'EG',
      templateVersion: 'v1',
      cloudinaryAccountIndex: allocatedAccountIndex, 
      theme: JSON.stringify(defaultTheme), 
      isActive: true,
      // الـ stores برضه لو ليها default للـ createdAt/updatedAt في السكيما شيل السطور اللي تحت، لو ملهاش سيب الـ Date
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const newStore = insertedStores[0];
  if (!newStore) {
    throw classifyError(
      new Error('BIZ_500: Failed to create and verify new store setup')
    );
  }

  console.log(`✅ [createStore] تم إنشاء المتجر بنجاح وتخصيص كلوديناري رقم: ${allocatedAccountIndex}`);

  // 6️⃣ روابط الـ Dashboard
  const dashboardLink = await generateLoginLink(userId, newStore.id);

  return {
    url: `https://dokanyy.vercel.app/m/${slug}`,
    dashboardLink,
  };
}