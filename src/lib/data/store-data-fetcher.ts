// src/lib/data/store-data-fetcher.ts

import { unstable_cache } from 'next/cache';
import type { Store, Product } from '@/types';
import type { RawStorePageData } from '@/lib/adapters/product-page.adapter';

// ============================================================
// 🗄️ دوال جلب البيانات (Mocks - سيتم استبدالها بـ D1 لاحقاً)
// ============================================================

async function fetchStoreInfo(storeSlug: string): Promise<Store | null> {
  // TODO: استبدال بـ D1 الفعلي مستقبلاً
  return {
    id: 'store-1',
    ownerId: 'user-default-owner', // 🔗 إجباري في الـ Schema لتفادي أي تعارض
    name: `متجر ${storeSlug}`,
    slug: storeSlug,
    shopName: `محل ${storeSlug}`,
    description: 'أفضل المتاجر للمنتجات المميزة',
    
    // ✅ الحقل الموحد اللي اتفقنا عليه بدل bannerImage
    coverImage: '/images/default-banner.png', 
    logo: null,

    // 📞 بيانات الاتصال
    phone: null,
    email: null,
    telegramChatId: null,
    telegramUsername: null,

    // 🌍 الموقع والعملة وبوابة الدفع (مطابقة تماماً للـ DB Constraints والـ Defaults)
    country: 'EG',
    city: 'Cairo',
    address: '123 Cairo St',
    currency: 'EGP',
    paymentGateway: 'cash',

    // 🎨 إعدادات الـ JSON والـ UI الموحدة
    theme: {
      fontFamily: 'sans-serif',
      colors: {
        primary: '#11CAA0',
        background: '#ffffff',
        text: '#000000',
        accent: '#11CAA0',
      },
    },
    settings: {
      theme: 'default',
      colors: { primary: '#11CAA0' },
      layout: [],
    },
    templateVersion: 'v1',
    cloudinaryAccountIndex: null,

    // 🏷️ الحالات والنشاط
    isActive: true,
    isVerified: false,
    isFeatured: false,

    // 🗄️ الرقابة والـ Soft Delete
    verifiedBy: null,
    verifiedAt: null,
    deletedBy: null,
    deletedAt: null,
    deletionReason: null,

    // ⏱️ التواقيت متوافقة مع الـ Date/String
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function fetchStoreProducts(
  storeId: string,
  options?: { page?: number; limit?: number }
): Promise<{ products: Product[]; total: number }> {
  // TODO: استبدال بـ D1 الفعلي
  const page = options?.page || 1;
  const limit = options?.limit || 20;

  const now = new Date().toISOString();
  const allProducts = [
    {
      id: '1',
      storeId,
      name: 'منتج 1',
      slug: 'product-1',
      description: 'وصف المنتج الأول',
      price: 10000,
      stock: 10,
      image:
        'https://images.unsplash.com/photo-1589465885857-44edb59bbff2?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '2',
      storeId,
      name: 'منتج 2',
      slug: 'product-2',
      description: 'وصف المنتج الثاني',
      price: 30000,
      stock: 0,
      image:
        'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?q=80&w=765&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '3',
      storeId,
      name: 'منتج 3',
      slug: 'product-3',
      description: 'وصف المنتج الثالث',
      price: 20000,
      stock: 5,
      image:
        'https://plus.unsplash.com/premium_photo-1675186049419-d48f4b28fe7c?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const start = (page - 1) * limit;
  const end = start + limit;
  const products = allProducts.slice(start, end);

  return {
    // ✅ بنقول للـ compiler بالذوق والعافية إن المنتجات اللي طالعة من الـ slice هي من نوع Product[]
    products: products as Product[],
    total: allProducts.length,
  };
}
/**
 * جلب منتج واحد بواسطة الـ slug (مع عزل المتجر)
 * @param storeId - معرف المتجر (لضمان عدم تسرب بين المتاجر)
 * @param slug - الـ slug الخاص بالمنتج
 */
async function fetchProductBySlug(
  storeId: string,
  slug: string
): Promise<Product | null> {
  // TODO: استبدال بـ D1 الفعلي
  // SELECT * FROM products WHERE store_id = ? AND slug = ? LIMIT 1

  const now = new Date().toISOString();
  
  // رجعنا التعريف الصريح لـ mockProducts كـ any مؤقتاً عشان نهرب من الـ Type validation في الـ Mock
  const mockProducts = [
    {
      id: '1',
      storeId,
      name: 'منتج 1',
      slug: 'product-1',
      description: 'وصف المنتج الأول',
      price: 10000,
      stock: 10,
      image:
        'https://images.unsplash.com/photo-1589465885857-44edb59bbff2?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '2',
      storeId,
      name: 'منتج 2',
      slug: 'product-2',
      description: 'وصف المنتج الثاني',
      price: 30000,
      stock: 0,
      image:
        'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?q=80&w=765&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '3',
      storeId,
      name: 'منتج 3',
      slug: 'product-3',
      description: 'وصف المنتج الثالث',
      price: 20000,
      stock: 5,
      image:
        'https://plus.unsplash.com/premium_photo-1675186049419-d48f4b28fe7c?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      createdAt: now,
      updatedAt: now,
    },
  ] as any[]; // 👈 عملناها any[] عشان نتفادى قيود الـ Schema في الـ Mock

  const foundProduct = mockProducts.find((p) => p.slug === slug);
  
  // ✅ وبنعمل Cast للـ return النهائي عشان يرجع كـ Product سليم 100% للـ Frontend
  return foundProduct ? (foundProduct as Product) : null;
}
// ============================================================
// 🧠 Data Fetchers مع Cache
// ============================================================

/**
 * جلب البيانات الخام لصفحة المتجر (القائمة + التوتال)
 */
export const getStoreRawData = unstable_cache(
  async (
    storeSlug: string,
    options?: { page?: number; limit?: number }
  ): Promise<RawStorePageData | null> => {
    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new Error('Invalid storeSlug');
    }

    const store = await fetchStoreInfo(storeSlug);
    if (!store) return null;

    const { products, total } = await fetchStoreProducts(store.id, options);

    return {
      store,
      filteredProducts: products,
      totalCount: total,
    };
  },
  ['store-raw-data'],
  {
    revalidate: 60,
    tags: ['store-data'],
  }
);

/**
 * جلب بيانات منتج واحد مع تخزين مؤقت
 * @param storeId - معرف المتجر
 * @param slug - الـ slug الخاص بالمنتج
 */
export const getProductData = unstable_cache(
  async (storeId: string, slug: string): Promise<Product | null> => {
    if (!storeId || !slug) {
      throw new Error('[getProductData] storeId and slug are required');
    }
    const product = await fetchProductBySlug(storeId, slug);
    return product;
  },
  [], // ✅ مفتاح فارغ: لا حاجة لتخصيص المفتاح، سيُولَّد تلقائياً
  {
    revalidate: 60,
    tags: ['product'],
  }
);
/**
 * جلب معلومات المتجر الأساسية مع التخزين المؤقت
 */
export const getStoreInfoData = unstable_cache(
  async (storeSlug: string): Promise<Store | null> => {
    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new Error('Invalid storeSlug');
    }
    return fetchStoreInfo(storeSlug);
  },
  ['store-info-data'],
  {
    revalidate: 60,
    tags: ['store-data'],
  }
);