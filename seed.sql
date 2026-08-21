-- 1. إصلاح المستخدم الموجود بالفعل وتزويده بـ merchant_id
UPDATE "user" 
SET merchant_id = 'merchant_moda_123' 
WHERE id = 'merchant_moda_123';

-- 2. إنشاء المستخدم لو مش موجود
INSERT INTO "user" (id, merchant_id, name, email, role, status, is_verified, created_at, updated_at) 
VALUES ('merchant_moda_123', 'merchant_moda_123', 'متجر مودة', 'moda@example.com', 'merchant', 'active', 1, (unixepoch() * 1000), (unixepoch() * 1000)) 
ON CONFLICT (id) DO NOTHING;

-- 3. إنشاء المتجر
INSERT INTO stores (id, owner_id, name, slug, country, currency, payment_gateway, snapshot_version, settings, theme, template_version, is_active, is_verified, is_featured, created_at, updated_at) 
VALUES ('store_moda_demo', 'merchant_moda_123', 'متجر مودة', 'moda-store', 'EG', 'EGP', 'cash', 1, '{}', '{}', 'v1', 1, 0, 0, (unixepoch() * 1000), (unixepoch() * 1000)) 
ON CONFLICT (id) DO NOTHING;

-- 4. إنشاء القسم
INSERT INTO categories (id, store_id, name, slug, level, "order", is_active, created_at, updated_at) 
VALUES ('cat_moda_fashion', 'store_moda_demo', 'ملابس وأزياء', 'fashion', 0, 1, 1, (unixepoch() * 1000), (unixepoch() * 1000)) 
ON CONFLICT (id) DO NOTHING;

-- 5. إنشاء المنتج
INSERT INTO products (id, store_id, category_id, name, slug, description, short_description, price, compare_at_price, cost, stock, low_stock_threshold, sku, is_published, is_featured, created_at, updated_at) 
VALUES ('prod_fashion_item', 'store_moda_demo', 'cat_moda_fashion', 'منتج مودة التجريبي', 'moda-demo-item', 'وصف منتج مودة التجريبي للاختبار.', 'منتج مودة', 45000, 50000, 30000, 20, 5, 'MODA-001', 1, 1, (unixepoch() * 1000), (unixepoch() * 1000)) 
ON CONFLICT (id) DO NOTHING;