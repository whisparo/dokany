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
  storeName: string; // الاسم اللي كتبه التاجر (مثلاً: "متجر الفرسان" أو "الفرسان")
  telegramUserId?: string | number;
}

async function generateLoginLink(userId: string, storeId: string): Promise<string> {
  return `https://dokanyy.vercel.app/dashboard?user=${userId}&store=${storeId}`;
}

/**
 * 🏪 إنشاء متجر جديد متوافق تماماً مع قيود SQLite و Drizzle Schemas ودعم كامل للعربي
 */
export async function createStore(
  d1Database: D1Database, 
  data: CreateStoreInput
): Promise<{ url: string; dashboardLink: string }> {
  const db = drizzle(d1Database);
  let userId: string;

  // 1️⃣ البحث الذكي والآمن عن المستخدم الحالي
  const searchConditions = [];
  if (data.telegramUserId) {
    searchConditions.push(eq(users.telegramId, String(data.telegramUserId)));
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
      updatePayload.merchantId = existingUser.id;
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
          merchantId: generatedId,
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

  // 2️⃣ [توليد الـ Slug وتنظيف اسم المتجر بذكاء]:
  // إزالة كلمة "متجر" أو "shop" المتكررة من بداية الاسم لتجنب تكرارها في الـ UI
  let cleanStoreName = data.storeName.trim();
  const storePrefixRegex = /^(متجر|shop|store)\s+/i;
  if (storePrefixRegex.test(cleanStoreName)) {
    cleanStoreName = cleanStoreName.replace(storePrefixRegex, '');
  }

  // بناء الـ Slug من الاسم النظيف
  let slugBase = cleanStoreName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // استبدال المسافات بشرطات
    .replace(/[^a-z0-9أ-ي-]/g, ''); // تنظيف من أي رموز غريبة

  if (!slugBase || slugBase === '-' || slugBase.length < 2) {
    slugBase = `store-${Math.random().toString(36).slice(2, 7)}`;
  }

  if (slugBase.startsWith('-')) {
    slugBase = 's' + slugBase;
  }

  // فك التشفير احتياطاً لضمان عدم تخزين رموز غريبة في قاعدة البيانات
  const decodedSlug = decodeURIComponent(slugBase);

  const existingStore = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, decodedSlug))
    .get();

  const slug = existingStore
    ? `${decodedSlug}-${Math.random().toString(36).slice(2, 6)}`
    : decodedSlug;

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

  // 5️⃣ إنشاء المتجر بالاسم النظيف والـ Slug السليم
  const insertedStores = await db
    .insert(stores)
    .values({
      id: crypto.randomUUID(), 
      ownerId: userId,
      name: cleanStoreName, // 👈 بنسجل الاسم النظيف هنا (بدون كلمة "متجر" المكررة)
      slug: slug,
      currency: 'EGP',
      country: 'EG',
      paymentGateway: 'cash', 
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

  console.log(`✅ [createStore] تم إنشاء المتجر بنجاح بالرابط: ${slug}`);

  // 6️⃣ روابط الـ Dashboard
  const dashboardLink = await generateLoginLink(userId, newStore.id);

  return {
    url: `https://dokany.pages.dev/${slug}`,
    dashboardLink,
  };
}