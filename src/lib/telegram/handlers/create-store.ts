// src/lib/telegram/handlers/create-store.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { stores, users } from '@/lib/db/schema'; 
import { eq, or } from 'drizzle-orm';
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
 * 🏪 إنشاء متجر جديد متوافق تماماً مع قيود SQLite و Drizzle Schemas
 */
export async function createStore(
  d1Database: D1Database, 
  data: CreateStoreInput
): Promise<{ url: string; dashboardLink: string }> {
  const db = drizzle(d1Database);
  let userId: string;

  // 1️⃣ البحث الذكي والآمن عن المستخدم الحالي لمنع التكرار وضرب الـ unique indexes
  const searchConditions = [];
  if (data.telegramUserId) {
    searchConditions.push(eq(users.telegramId, String(data.telegramUserId)));
    // احتياطاً لو تم استخدام الـ telegramId كـ primary key في الخطوات السابقة
    searchConditions.push(eq(users.id, String(data.telegramUserId)));
  }
  searchConditions.push(eq(users.phoneNumber, data.phone));

  const existingUser = await db
    .select()
    .from(users)
    .where(or(...searchConditions))
    .get();

  if (existingUser) {
    userId = existingUser.id;
    const updatePayload: Record<string, any> = {};
    
    if (!existingUser.telegramId && data.telegramUserId) {
      updatePayload.telegramId = String(data.telegramUserId);
    }
    if (!existingUser.merchantId) {
      updatePayload.merchantId = existingUser.id; // التاجر هو الـ merchantId لنفسه
    }
    if (!existingUser.name || existingUser.name.trim() === '') {
      updatePayload.name = data.name;
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db
          .update(users)
          .set({ ...updatePayload, updatedAt: new Date() })
          .where(eq(users.id, existingUser.id));
        console.log(`✅ [createStore] تم تحديث بيانات المستخدم الحالي بنجاح: ${existingUser.id}`);
      } catch (updateError) {
        console.error(`❌ [createStore] فشل تحديث بيانات المستخدم ${existingUser.id}:`, updateError);
      }
    }
  } else {
    // مستخدم جديد تماماً
    try {
      const generatedId = crypto.randomUUID(); 
      
      const insertedUsers = await db
        .insert(users)
        .values({
          id: generatedId,
          name: data.name,
          phoneNumber: data.phone,
          authMethod: 'phone',
          status: 'active', 
          isVerified: true,
          emailVerified: false, 
          telegramId: data.telegramUserId ? String(data.telegramUserId) : null,
          merchantId: generatedId, // إرضاء قيد chk_merchant_id_consistency
        })
        .returning();
      
      const newUser = insertedUsers[0];
      if (!newUser) throw new Error('BIZ_500: Failed to capture newly created user identity');
      userId = newUser.id;
      console.log(`✅ [createStore] تم إنشاء مستخدم جديد تماماً: ${userId}`);
    } catch (insertError) {
      console.error('❌ [createStore] فشل إنشاء المستخدم الجديد:', insertError);
      throw classifyError(insertError);
    }
  }

  // 2️⃣ [حل معضلة الـ Slug العربي]: تنظيف الاسم وتوليد سلاج متوافق 100% مع قيد الـ GLOB '[a-z0-9]*[a-z0-9-]*'
  let slugBase = data.storeName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') 
    // حذف أي حروف غير إنجليزية أو أرقام أو شرطة للالتزام بالقيد الصارم للـ DB
    .replace(/[^a-z0-9-]/g, '');

  // لو الاسم كله عربي فـ slugBase هيطلع فاضي تماماً، هنا نتدخل ونولد اسم عشوائي متوافق
  if (!slugBase || slugBase === '-' || slugBase.length < 2) {
    slugBase = `store-${Math.random().toString(36).slice(2, 7)}`;
  }

  // للتأكيد التام أن أول حرف ليس شرطة لعدم مخالفة الـ GLOB
  if (slugBase.startsWith('-')) {
    slugBase = 's' + slugBase;
  }

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

  // 4️⃣ كائن الـ Theme
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

  // 5️⃣ إنشاء المتجر
  const insertedStores = await db
    .insert(stores)
    .values({
      id: crypto.randomUUID(), 
      ownerId: userId,
      name: data.storeName,
      slug: slug,
      currency: 'EGP',
      country: 'EG',
      paymentGateway: 'cash', // تم التغيير لـ cash كخيار افتراضي آمن أو اتركه stripe حسب منطقك
      templateVersion: 'v1',
      cloudinaryAccountIndex: allocatedAccountIndex, 
      theme: JSON.stringify(defaultTheme), 
      isActive: true,
      isVerified: false,
      isFeatured: false,
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
    url: `https://dokany.pages.dev/m/${slug}`,
    dashboardLink,
  };
}