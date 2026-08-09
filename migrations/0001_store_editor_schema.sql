CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    raw_url TEXT NOT NULL,                     -- رابط Cloudinary المباشر السريع
    processed_url TEXT NULL,                   -- رابط Backblaze B2 المنقى والمؤرشف
    media_type TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
    status TEXT NOT NULL DEFAULT 'raw',        -- 'raw' | 'processing' | 'processed' | 'failed'
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. تحديث جدول المنتجات الرئيسي (المعيار المالي INTEGER + SEO Slug فريد مركب)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,    -- توحيد المعيار المالي بأصغر وحدة عملة
    stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT unique_store_product_slug UNIQUE (store_id, slug) -- 🟢 فرادة الـ Slug على مستوى المتجر
);

-- 3. جدول الأقسام (دعم العرض الهرمي والترتيب)
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id TEXT NULL REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT unique_store_category_slug UNIQUE (store_id, slug)
);

-- 4. جدول محتوى الهيرو (مربوط بالـ Progressive Media Pipeline)
CREATE TABLE IF NOT EXISTS hero_slides (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE, -- 🟢 ربط تلقائي بـ B2 عند جاهزيته
    title TEXT NULL,
    subtitle TEXT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,      -- 1 = نشط، 0 = مخفي مؤقتاً
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 5. جدول تنوعات المنتجات (خصم ذري للمخزون، عزل SKU مرّكب، ودقة مالية)
CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku TEXT NULL,                             -- قد يكون NULL في الـ MVP
    price_cents INTEGER NULL,                 -- NULL تعني استخدام price_cents للمنتج الرئيسي
    stock INTEGER NOT NULL DEFAULT 0,          -- الخصم الذري المباشر
    options_json TEXT NOT NULL,                -- مثال: {"color": "Red", "size": "XL"}
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CONSTRAINT unique_store_variant_sku UNIQUE (store_id, sku) -- 🛑 فرادة مرّكبة تجنب التعارض بين المتاجر
);

-- الفهارس المركبة لتحسين أداء الاستعلامات والـ Multi-Tenancy
CREATE INDEX IF NOT EXISTS idx_media_store_status ON media(store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_hero_slides_store ON hero_slides(store_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_store ON product_variants(store_id);