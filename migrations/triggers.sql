CREATE TRIGGER IF NOT EXISTS trg_update_media_timestamp
AFTER UPDATE ON media
FOR EACH ROW
BEGIN
    UPDATE media SET updated_at = (unixepoch()) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_products_timestamp
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
    UPDATE products SET updated_at = (unixepoch()) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_categories_timestamp
AFTER UPDATE ON categories
FOR EACH ROW
BEGIN
    UPDATE categories SET updated_at = (unixepoch()) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_hero_slides_timestamp
AFTER UPDATE ON hero_slides
FOR EACH ROW
BEGIN
    UPDATE hero_slides SET updated_at = (unixepoch()) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_product_variants_timestamp
AFTER UPDATE ON product_variants
FOR EACH ROW
BEGIN
    UPDATE product_variants SET updated_at = (unixepoch()) WHERE id = NEW.id;
END;