PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_account_id_not_empty" CHECK(length("__new_account"."account_id") > 0),
	CONSTRAINT "chk_provider_id_not_empty" CHECK(length("__new_account"."provider_id") > 0)
);
--> statement-breakpoint
INSERT INTO `__new_account`("id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at") SELECT "id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at" FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `account_user_provider_idx` ON `account` (`user_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `account_provider_idx` ON `account` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_unique` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `__new_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`deleted_by` text,
	`phone` text NOT NULL,
	`email` text,
	`name` text,
	`telegram_chat_id` text,
	`preferences` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_phone_not_empty" CHECK("__new_customers"."phone" != ''),
	CONSTRAINT "chk_email_format" CHECK("__new_customers"."email" IS NULL OR "__new_customers"."email" LIKE '%_@_%._%'),
	CONSTRAINT "chk_customer_name_not_empty" CHECK("__new_customers"."name" IS NULL OR "__new_customers"."name" != ''),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_customers"."deleted_at" IS NULL OR "__new_customers"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_preferences_currency" CHECK(
      json_extract("__new_customers"."preferences", '$.currency') IS NULL 
      OR json_extract("__new_customers"."preferences", '$.currency') GLOB '[A-Z][A-Z][A-Z]'
    )
);
--> statement-breakpoint
INSERT INTO `__new_customers`("id", "user_id", "deleted_by", "phone", "email", "name", "telegram_chat_id", "preferences", "deleted_at", "created_at", "updated_at") SELECT "id", "user_id", "deleted_by", "phone", "email", "name", "telegram_chat_id", "preferences", "deleted_at", "created_at", "updated_at" FROM `customers`;--> statement-breakpoint
DROP TABLE `customers`;--> statement-breakpoint
ALTER TABLE `__new_customers` RENAME TO `customers`;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`"email" COLLATE NOCASE`) WHERE "customers"."email" IS NOT NULL AND "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_telegram_unique` ON `customers` (`telegram_chat_id`) WHERE "customers"."telegram_chat_id" IS NOT NULL AND "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `customers_user_id_idx` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX `customers_deleted_by_idx` ON `customers` (`deleted_by`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_created_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE INDEX `customers_deleted_idx` ON `customers` (`deleted_at`) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` (`"email" COLLATE NOCASE`);--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`address_id` text,
	`shipping_address` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_email` text,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`coupon_code` text,
	`coupon_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_method` text,
	`customer_notes` text,
	`admin_notes` text,
	`internal_notes` text,
	`haggle_session_id` text,
	`original_total` integer,
	`haggle_discount` integer DEFAULT 0 NOT NULL,
	`group_buy_id` text,
	`source` text DEFAULT 'web',
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_term` text,
	`utm_content` text,
	`shipping_method` text DEFAULT 'standard',
	`tracking_number` text,
	`delivery_date` integer,
	`confirmed_at` integer,
	`shipped_at` integer,
	`delivered_at` integer,
	`cancelled_at` integer,
	`cancel_reason` text,
	`refunded_at` integer,
	`refund_amount` integer,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`haggle_session_id`) REFERENCES `haggle_sessions`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`group_buy_id`) REFERENCES `group_buys`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_order_status" CHECK("__new_orders"."status" IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
	CONSTRAINT "chk_payment_status" CHECK("__new_orders"."payment_status" IN ('pending', 'paid', 'failed', 'refunded', 'under_review')),
	CONSTRAINT "chk_payment_method" CHECK("__new_orders"."payment_method" IS NULL OR "__new_orders"."payment_method" IN ('cod', 'credit_card', 'wallet', 'bank_transfer', 'installments')),
	CONSTRAINT "chk_shipping_method" CHECK("__new_orders"."shipping_method" IN ('standard', 'express', 'same-day', 'pickup')),
	CONSTRAINT "chk_order_currency" CHECK("__new_orders"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "chk_total_non_negative" CHECK("__new_orders"."total" >= 0),
	CONSTRAINT "chk_subtotal_non_negative" CHECK("__new_orders"."subtotal" >= 0),
	CONSTRAINT "chk_shipping_non_negative" CHECK("__new_orders"."shipping_cost" >= 0),
	CONSTRAINT "chk_tax_non_negative" CHECK("__new_orders"."tax_amount" >= 0),
	CONSTRAINT "chk_discount_non_negative" CHECK("__new_orders"."discount" >= 0),
	CONSTRAINT "chk_haggle_discount_non_negative" CHECK("__new_orders"."haggle_discount" >= 0),
	CONSTRAINT "chk_order_total_calculation" CHECK(
      "__new_orders"."total" = (
        "__new_orders"."subtotal" + 
        "__new_orders"."shipping_cost" + 
        "__new_orders"."tax_amount" - 
        "__new_orders"."discount"
      )
    ),
	CONSTRAINT "chk_recipient_phone" CHECK(json_extract("__new_orders"."shipping_address", '$.recipientPhone') IS NOT NULL AND json_extract("__new_orders"."shipping_address", '$.recipientPhone') != ''),
	CONSTRAINT "chk_recipient_name" CHECK(json_extract("__new_orders"."shipping_address", '$.recipientName') IS NOT NULL AND json_extract("__new_orders"."shipping_address", '$.recipientName') != ''),
	CONSTRAINT "chk_country" CHECK(json_extract("__new_orders"."shipping_address", '$.country') IS NOT NULL AND json_extract("__new_orders"."shipping_address", '$.country') != ''),
	CONSTRAINT "chk_payment_method_required" CHECK(("__new_orders"."payment_method" IS NOT NULL) OR ("__new_orders"."payment_status" = 'pending')),
	CONSTRAINT "chk_payment_review" CHECK(NOT ("__new_orders"."status" IN ('processing', 'shipped', 'delivered') AND "__new_orders"."payment_status" = 'under_review')),
	CONSTRAINT "chk_discount_legit" CHECK("__new_orders"."discount" <= "__new_orders"."subtotal"),
	CONSTRAINT "chk_haggle_legit" CHECK(("__new_orders"."haggle_session_id" IS NULL) OR ("__new_orders"."haggle_discount" <= COALESCE("__new_orders"."original_total", 0))),
	CONSTRAINT "chk_no_delete_shipped" CHECK(("__new_orders"."deleted_at" IS NULL) OR ("__new_orders"."status" NOT IN ('shipped', 'delivered'))),
	CONSTRAINT "chk_coupon_consistency" CHECK(("__new_orders"."coupon_id" IS NULL) OR ("__new_orders"."coupon_code" IS NOT NULL)),
	CONSTRAINT "chk_confirmed_after_created" CHECK(("__new_orders"."confirmed_at" IS NULL OR "__new_orders"."confirmed_at" >= "__new_orders"."created_at")),
	CONSTRAINT "chk_shipped_after_confirmed" CHECK(("__new_orders"."shipped_at" IS NULL OR ("__new_orders"."confirmed_at" IS NOT NULL AND "__new_orders"."shipped_at" >= "__new_orders"."confirmed_at"))),
	CONSTRAINT "chk_delivered_after_shipped" CHECK(("__new_orders"."delivered_at" IS NULL OR ("__new_orders"."shipped_at" IS NOT NULL AND "__new_orders"."delivered_at" >= "__new_orders"."shipped_at"))),
	CONSTRAINT "chk_cancelled_after_created" CHECK(("__new_orders"."cancelled_at" IS NULL OR "__new_orders"."cancelled_at" >= "__new_orders"."created_at")),
	CONSTRAINT "chk_status_confirmed" CHECK(("__new_orders"."status" != 'confirmed' OR "__new_orders"."confirmed_at" IS NOT NULL)),
	CONSTRAINT "chk_status_shipped" CHECK(("__new_orders"."status" != 'shipped' OR "__new_orders"."shipped_at" IS NOT NULL)),
	CONSTRAINT "chk_status_delivered" CHECK(("__new_orders"."status" != 'delivered' OR "__new_orders"."delivered_at" IS NOT NULL)),
	CONSTRAINT "chk_status_cancelled" CHECK(("__new_orders"."status" != 'cancelled' OR "__new_orders"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "chk_refund_amount_positive" CHECK(("__new_orders"."refund_amount" IS NULL OR "__new_orders"."refund_amount" > 0)),
	CONSTRAINT "chk_refund_amount_max" CHECK(("__new_orders"."refund_amount" IS NULL OR "__new_orders"."refund_amount" <= "__new_orders"."total")),
	CONSTRAINT "chk_refund_consistency" CHECK(("__new_orders"."refunded_at" IS NULL OR "__new_orders"."refund_amount" IS NOT NULL)),
	CONSTRAINT "chk_original_total_exists" CHECK(("__new_orders"."haggle_session_id" IS NULL) OR ("__new_orders"."original_total" IS NOT NULL)),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_orders"."deleted_at" IS NULL OR "__new_orders"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_number", "store_id", "customer_id", "address_id", "shipping_address", "customer_name", "customer_phone", "customer_email", "currency", "subtotal", "shipping_cost", "tax_amount", "discount", "total", "coupon_code", "coupon_id", "status", "payment_status", "payment_method", "customer_notes", "admin_notes", "internal_notes", "haggle_session_id", "original_total", "haggle_discount", "group_buy_id", "source", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "shipping_method", "tracking_number", "delivery_date", "confirmed_at", "shipped_at", "delivered_at", "cancelled_at", "cancel_reason", "refunded_at", "refund_amount", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "order_number", "store_id", "customer_id", "address_id", "shipping_address", "customer_name", "customer_phone", "customer_email", "currency", "subtotal", "shipping_cost", "tax_amount", "discount", "total", "coupon_code", "coupon_id", "status", "payment_status", "payment_method", "customer_notes", "admin_notes", "internal_notes", "haggle_session_id", "original_total", "haggle_discount", "group_buy_id", "source", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "shipping_method", "tracking_number", "delivery_date", "confirmed_at", "shipped_at", "delivered_at", "cancelled_at", "cancel_reason", "refunded_at", "refund_amount", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_number_unique_idx` ON `orders` (`store_id`,`order_number`) WHERE "orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `orders_store_idx` ON `orders` (`store_id`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_store_status_created_idx` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_payment_created_idx` ON `orders` (`store_id`,`payment_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_group_buy_idx` ON `orders` (`group_buy_id`);--> statement-breakpoint
CREATE INDEX `orders_haggle_idx` ON `orders` (`haggle_session_id`);--> statement-breakpoint
CREATE INDEX `orders_cancelled_idx` ON `orders` (`cancelled_at`);--> statement-breakpoint
CREATE INDEX `orders_shipped_idx` ON `orders` (`shipped_at`);--> statement-breakpoint
CREATE INDEX `orders_delivery_idx` ON `orders` (`delivery_date`);--> statement-breakpoint
CREATE INDEX `orders_paid_idx` ON `orders` (`payment_status`) WHERE "orders"."payment_status" = 'paid';--> statement-breakpoint
CREATE INDEX `orders_confirmed_unshipped_idx` ON `orders` (`status`,`payment_status`) WHERE "orders"."status" = 'confirmed' AND "orders"."payment_status" = 'paid';--> statement-breakpoint
CREATE INDEX `orders_not_deleted_idx` ON `orders` (`id`) WHERE "orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `orders_marketing_analytics_idx` ON `orders` (`store_id`,`utm_source`,`utm_campaign`) WHERE "orders"."utm_source" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_payment_method_idx` ON `orders` (`payment_method`);--> statement-breakpoint
CREATE INDEX `orders_updated_at_idx` ON `orders` (`updated_at`);--> statement-breakpoint
CREATE INDEX `orders_deleted_at_idx` ON `orders` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`label` text DEFAULT 'home' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`recipient_name` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`country` text DEFAULT 'EG' NOT NULL,
	`city` text NOT NULL,
	`area` text,
	`street` text NOT NULL,
	`building` text,
	`floor` text,
	`apartment` text,
	`postal_code` text,
	`landmark` text,
	`latitude` real,
	`longitude` real,
	`notes` text,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_recipient_name_not_empty" CHECK(length("__new_addresses"."recipient_name") > 0),
	CONSTRAINT "chk_recipient_phone_not_empty" CHECK(length("__new_addresses"."recipient_phone") > 0),
	CONSTRAINT "chk_city_not_empty" CHECK(length("__new_addresses"."city") > 0),
	CONSTRAINT "chk_street_not_empty" CHECK(length("__new_addresses"."street") > 0),
	CONSTRAINT "chk_label_not_empty" CHECK(length("__new_addresses"."label") > 0),
	CONSTRAINT "chk_country_code" CHECK("__new_addresses"."country" GLOB '[A-Z][A-Z]'),
	CONSTRAINT "chk_phone_format" CHECK(("__new_addresses"."recipient_phone" GLOB '[+0-9]*') AND (length("__new_addresses"."recipient_phone") BETWEEN 7 AND 20)),
	CONSTRAINT "chk_lat_range" CHECK("__new_addresses"."latitude" IS NULL OR ("__new_addresses"."latitude" BETWEEN -90.0 AND 90.0)),
	CONSTRAINT "chk_lon_range" CHECK("__new_addresses"."longitude" IS NULL OR ("__new_addresses"."longitude" BETWEEN -180.0 AND 180.0)),
	CONSTRAINT "chk_default_not_deleted" CHECK(NOT ("__new_addresses"."is_default" = 1 AND "__new_addresses"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_addresses`("id", "customer_id", "label", "is_default", "recipient_name", "recipient_phone", "country", "city", "area", "street", "building", "floor", "apartment", "postal_code", "landmark", "latitude", "longitude", "notes", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "customer_id", "label", "is_default", "recipient_name", "recipient_phone", "country", "city", "area", "street", "building", "floor", "apartment", "postal_code", "landmark", "latitude", "longitude", "notes", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `addresses`;--> statement-breakpoint
DROP TABLE `addresses`;--> statement-breakpoint
ALTER TABLE `__new_addresses` RENAME TO `addresses`;--> statement-breakpoint
CREATE UNIQUE INDEX `addresses_default_unique_idx` ON `addresses` (`customer_id`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_customer_idx` ON `addresses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `addresses_customer_default_idx` ON `addresses` (`customer_id`,`is_default`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_country_city_idx` ON `addresses` (`country`,`city`);--> statement-breakpoint
CREATE INDEX `addresses_deleted_idx` ON `addresses` (`deleted_at`) WHERE "addresses"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `addresses_postal_code_idx` ON `addresses` (`postal_code`);--> statement-breakpoint
CREATE INDEX `addresses_phone_idx` ON `addresses` (`recipient_phone`);--> statement-breakpoint
CREATE INDEX `addresses_customer_label_idx` ON `addresses` (`customer_id`,`label`) WHERE "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`token_family` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_session_token_not_empty" CHECK(length("__new_session"."token") > 0)
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "expires_at", "token", "created_at", "updated_at", "user_id", "ip_address", "user_agent", "token_family") SELECT "id", "expires_at", "token", "created_at", "updated_at", "user_id", "ip_address", "user_agent", "token_family" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_expires_at_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `session_token_family_idx` ON `session` (`token_family`);--> statement-breakpoint
CREATE INDEX `session_user_expires_idx` ON `session` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `session_user_token_family_idx` ON `session` (`user_id`,`token_family`);--> statement-breakpoint
CREATE INDEX `session_ip_address_idx` ON `session` (`ip_address`) WHERE "session"."ip_address" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`customer_id` text,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant` text DEFAULT '{}' NOT NULL,
	`variant_sku` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_at_add` integer NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_cart_qty_positive" CHECK("__new_cart_items"."quantity" > 0),
	CONSTRAINT "chk_cart_price_positive" CHECK("__new_cart_items"."price_at_add" >= 0),
	CONSTRAINT "chk_cart_owner_exists" CHECK("__new_cart_items"."session_id" IS NOT NULL OR "__new_cart_items"."customer_id" IS NOT NULL),
	CONSTRAINT "chk_variant_sku_not_empty" CHECK("__new_cart_items"."variant_sku" != '')
);
--> statement-breakpoint
INSERT INTO `__new_cart_items`("id", "session_id", "customer_id", "store_id", "product_id", "variant", "variant_sku", "quantity", "price_at_add", "source", "created_at", "updated_at") SELECT "id", "session_id", "customer_id", "store_id", "product_id", "variant", "variant_sku", "quantity", "price_at_add", "source", "created_at", "updated_at" FROM `cart_items`;--> statement-breakpoint
DROP TABLE `cart_items`;--> statement-breakpoint
ALTER TABLE `__new_cart_items` RENAME TO `cart_items`;--> statement-breakpoint
CREATE INDEX `cart_session_idx` ON `cart_items` (`session_id`) WHERE "cart_items"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_customer_idx` ON `cart_items` (`customer_id`) WHERE "cart_items"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_store_idx` ON `cart_items` (`store_id`);--> statement-breakpoint
CREATE INDEX `cart_product_idx` ON `cart_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `cart_stale_idx` ON `cart_items` (`created_at`);--> statement-breakpoint
CREATE INDEX `cart_store_customer_idx` ON `cart_items` (`store_id`,`customer_id`) WHERE "cart_items"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_store_session_idx` ON `cart_items` (`store_id`,`session_id`) WHERE "cart_items"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cart_customer_unique_idx` ON `cart_items` (`customer_id`,`product_id`,`variant_sku`) WHERE "cart_items"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cart_session_unique_idx` ON `cart_items` (`session_id`,`product_id`,`variant_sku`) WHERE "cart_items"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image_url` text,
	`level` integer DEFAULT 0 NOT NULL,
	`path` text,
	`order` integer DEFAULT 0 NOT NULL,
	`products_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`media_ids` text DEFAULT '[]' NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_cat_name_not_empty" CHECK(length("__new_categories"."name") > 0),
	CONSTRAINT "chk_cat_slug_not_empty" CHECK(length("__new_categories"."slug") > 0),
	CONSTRAINT "chk_parent_not_self" CHECK("__new_categories"."parent_id" IS NULL OR "__new_categories"."parent_id" != "__new_categories"."id"),
	CONSTRAINT "chk_level_range" CHECK("__new_categories"."level" >= 0 AND "__new_categories"."level" <= 10),
	CONSTRAINT "chk_products_count_positive" CHECK("__new_categories"."products_count" >= 0),
	CONSTRAINT "chk_slug_format" CHECK("__new_categories"."slug" NOT LIKE '% %'),
	CONSTRAINT "chk_path_format" CHECK("__new_categories"."path" IS NULL OR "__new_categories"."path" GLOB '/*')
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "store_id", "parent_id", "name", "slug", "description", "image_url", "level", "path", "order", "products_count", "is_active", "media_ids", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "store_id", "parent_id", "name", "slug", "description", "image_url", "level", "path", "order", "products_count", "is_active", "media_ids", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`store_id`,`slug`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_store_parent_idx` ON `categories` (`store_id`,`parent_id`) WHERE "categories"."parent_id" IS NOT NULL AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_path_idx` ON `categories` (`path`) WHERE "categories"."path" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_level_idx` ON `categories` (`store_id`,`level`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_deleted_idx` ON `categories` (`deleted_at`) WHERE "categories"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_active_idx` ON `categories` (`store_id`,`is_active`) WHERE "categories"."is_active" = 1 AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_store_parent_order_idx` ON `categories` (`store_id`,`parent_id`,`order`) WHERE "categories"."is_active" = 1 AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_name_idx` ON `categories` (`store_id`,`"name" COLLATE NOCASE`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_customer_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`total_spent` integer DEFAULT 0 NOT NULL,
	`orders_count` integer DEFAULT 0 NOT NULL,
	`last_order_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_non_negative" CHECK("__new_customer_stats"."total_spent" >= 0 AND "__new_customer_stats"."orders_count" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_customer_stats`("id", "customer_id", "total_spent", "orders_count", "last_order_at", "updated_at") SELECT "id", "customer_id", "total_spent", "orders_count", "last_order_at", "updated_at" FROM `customer_stats`;--> statement-breakpoint
DROP TABLE `customer_stats`;--> statement-breakpoint
ALTER TABLE `__new_customer_stats` RENAME TO `customer_stats`;--> statement-breakpoint
CREATE UNIQUE INDEX `customer_stats_customer_idx` ON `customer_stats` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_stats_total_spent_idx` ON `customer_stats` (`total_spent`);--> statement-breakpoint
CREATE INDEX `customer_stats_orders_idx` ON `customer_stats` (`orders_count`);--> statement-breakpoint
CREATE INDEX `customer_stats_dashboard_idx` ON `customer_stats` (`customer_id`,`orders_count`,`total_spent`);--> statement-breakpoint
CREATE TABLE `__new_customer_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`loyalty_points` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_wallet_non_negative" CHECK("__new_customer_wallets"."balance" >= 0),
	CONSTRAINT "chk_loyalty_non_negative" CHECK("__new_customer_wallets"."loyalty_points" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_customer_wallets`("id", "customer_id", "balance", "loyalty_points", "updated_at") SELECT "id", "customer_id", "balance", "loyalty_points", "updated_at" FROM `customer_wallets`;--> statement-breakpoint
DROP TABLE `customer_wallets`;--> statement-breakpoint
ALTER TABLE `__new_customer_wallets` RENAME TO `customer_wallets`;--> statement-breakpoint
CREATE UNIQUE INDEX `customer_wallets_customer_idx` ON `customer_wallets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_wallets_balance_idx` ON `customer_wallets` (`balance`);--> statement-breakpoint
CREATE INDEX `customer_wallets_loyalty_idx` ON `customer_wallets` (`loyalty_points`);--> statement-breakpoint
CREATE TABLE `__new_group_buys` (
	`id` text PRIMARY KEY NOT NULL,
	`group_code` text NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`leader_id` text,
	`original_price` integer NOT NULL,
	`group_price` integer NOT NULL,
	`discount_percentage` integer NOT NULL,
	`required_participants` integer NOT NULL,
	`current_participants` integer DEFAULT 0 NOT NULL,
	`max_participants` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`leader_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_group_buy_status" CHECK("__new_group_buys"."status" IN ('active', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "chk_group_code_format" CHECK(length("__new_group_buys"."group_code") > 0),
	CONSTRAINT "chk_group_prices" CHECK("__new_group_buys"."group_price" < "__new_group_buys"."original_price"),
	CONSTRAINT "chk_group_price_positive" CHECK("__new_group_buys"."group_price" > 0),
	CONSTRAINT "chk_original_price_positive" CHECK("__new_group_buys"."original_price" > 0),
	CONSTRAINT "chk_discount_range" CHECK("__new_group_buys"."discount_percentage" > 0 AND "__new_group_buys"."discount_percentage" <= 100),
	CONSTRAINT "chk_required_participants" CHECK("__new_group_buys"."required_participants" >= 2),
	CONSTRAINT "chk_current_participants_positive" CHECK("__new_group_buys"."current_participants" >= 0),
	CONSTRAINT "chk_current_participants_upper" CHECK("__new_group_buys"."current_participants" <= COALESCE("__new_group_buys"."max_participants", "__new_group_buys"."required_participants")),
	CONSTRAINT "chk_max_participants" CHECK("__new_group_buys"."max_participants" IS NULL OR "__new_group_buys"."max_participants" >= "__new_group_buys"."required_participants"),
	CONSTRAINT "chk_group_buy_expires_after_created" CHECK("__new_group_buys"."expires_at" > "__new_group_buys"."created_at"),
	CONSTRAINT "chk_completed_at_consistency" CHECK(("__new_group_buys"."status" != 'completed' OR "__new_group_buys"."completed_at" IS NOT NULL)),
	CONSTRAINT "chk_group_buy_deleted_consistency" CHECK(("__new_group_buys"."deleted_at" IS NULL OR "__new_group_buys"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_group_buys`("id", "group_code", "store_id", "product_id", "leader_id", "original_price", "group_price", "discount_percentage", "required_participants", "current_participants", "max_participants", "status", "expires_at", "completed_at", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "group_code", "store_id", "product_id", "leader_id", "original_price", "group_price", "discount_percentage", "required_participants", "current_participants", "max_participants", "status", "expires_at", "completed_at", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `group_buys`;--> statement-breakpoint
DROP TABLE `group_buys`;--> statement-breakpoint
ALTER TABLE `__new_group_buys` RENAME TO `group_buys`;--> statement-breakpoint
CREATE UNIQUE INDEX `group_buys_code_unique_idx` ON `group_buys` (`group_code`) WHERE "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `group_buys_store_idx` ON `group_buys` (`store_id`);--> statement-breakpoint
CREATE INDEX `group_buys_product_idx` ON `group_buys` (`product_id`);--> statement-breakpoint
CREATE INDEX `group_buys_expires_idx` ON `group_buys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `group_buys_leader_idx` ON `group_buys` (`leader_id`);--> statement-breakpoint
CREATE INDEX `group_buys_active_status_idx` ON `group_buys` (`store_id`,`status`) WHERE "group_buys"."status" IN ('active', 'processing') AND "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `group_buys_deleted_idx` ON `group_buys` (`deleted_at`) WHERE "group_buys"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `group_buys_active_product_unique_idx` ON `group_buys` (`store_id`,`product_id`) WHERE "group_buys"."status" IN ('active', 'processing') AND "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_haggle_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_code` text NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`customer_id` text,
	`original_price` text NOT NULL,
	`min_allowed_price` text NOT NULL,
	`current_offer` text NOT NULL,
	`counter_offers` text DEFAULT '[]' NOT NULL,
	`rounds_count` integer DEFAULT 0 NOT NULL,
	`max_rounds` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`final_price` text,
	`order_id` text,
	`discount_amount` text DEFAULT '0' NOT NULL,
	`strategy_used` text,
	`expires_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_haggle_status" CHECK("__new_haggle_sessions"."status" IN ('active', 'counter_offered', 'accepted', 'rejected', 'expired', 'cancelled')),
	CONSTRAINT "chk_haggle_strategy" CHECK("__new_haggle_sessions"."strategy_used" IS NULL OR "__new_haggle_sessions"."strategy_used" IN ('aggressive', 'friendly', 'middle_ground')),
	CONSTRAINT "chk_session_code_format" CHECK(length("__new_haggle_sessions"."session_code") > 0),
	CONSTRAINT "chk_min_price" CHECK(CAST("__new_haggle_sessions"."min_allowed_price" AS REAL) > 0.0),
	CONSTRAINT "chk_original_price" CHECK(CAST("__new_haggle_sessions"."original_price" AS REAL) >= CAST("__new_haggle_sessions"."min_allowed_price" AS REAL)),
	CONSTRAINT "chk_discount" CHECK(CAST("__new_haggle_sessions"."discount_amount" AS REAL) >= 0.0),
	CONSTRAINT "chk_discount_limit" CHECK(CAST("__new_haggle_sessions"."discount_amount" AS REAL) <= (CAST("__new_haggle_sessions"."original_price" AS REAL) - CAST("__new_haggle_sessions"."min_allowed_price" AS REAL))),
	CONSTRAINT "chk_final_price_upper" CHECK("__new_haggle_sessions"."final_price" IS NULL OR CAST("__new_haggle_sessions"."final_price" AS REAL) <= CAST("__new_haggle_sessions"."original_price" AS REAL)),
	CONSTRAINT "chk_final_price_lower" CHECK("__new_haggle_sessions"."final_price" IS NULL OR CAST("__new_haggle_sessions"."final_price" AS REAL) >= CAST("__new_haggle_sessions"."min_allowed_price" AS REAL)),
	CONSTRAINT "chk_rounds" CHECK("__new_haggle_sessions"."rounds_count" <= "__new_haggle_sessions"."max_rounds" AND "__new_haggle_sessions"."rounds_count" >= 0),
	CONSTRAINT "chk_max_rounds" CHECK("__new_haggle_sessions"."max_rounds" > 0),
	CONSTRAINT "chk_expires_after_created" CHECK("__new_haggle_sessions"."expires_at" > "__new_haggle_sessions"."created_at"),
	CONSTRAINT "chk_strategy_required" CHECK(("__new_haggle_sessions"."status" NOT IN ('accepted', 'rejected') OR "__new_haggle_sessions"."strategy_used" IS NOT NULL)),
	CONSTRAINT "chk_haggle_deleted_consistency" CHECK(("__new_haggle_sessions"."deleted_at" IS NULL OR "__new_haggle_sessions"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_haggle_sessions`("id", "session_code", "store_id", "product_id", "customer_id", "original_price", "min_allowed_price", "current_offer", "counter_offers", "rounds_count", "max_rounds", "status", "final_price", "order_id", "discount_amount", "strategy_used", "expires_at", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "session_code", "store_id", "product_id", "customer_id", "original_price", "min_allowed_price", "current_offer", "counter_offers", "rounds_count", "max_rounds", "status", "final_price", "order_id", "discount_amount", "strategy_used", "expires_at", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `haggle_sessions`;--> statement-breakpoint
DROP TABLE `haggle_sessions`;--> statement-breakpoint
ALTER TABLE `__new_haggle_sessions` RENAME TO `haggle_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `haggle_code_unique_idx` ON `haggle_sessions` (`session_code`) WHERE "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `haggle_store_idx` ON `haggle_sessions` (`store_id`);--> statement-breakpoint
CREATE INDEX `haggle_product_idx` ON `haggle_sessions` (`product_id`);--> statement-breakpoint
CREATE INDEX `haggle_customer_idx` ON `haggle_sessions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `haggle_order_idx` ON `haggle_sessions` (`order_id`);--> statement-breakpoint
CREATE INDEX `haggle_expires_idx` ON `haggle_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `haggle_active_status_idx` ON `haggle_sessions` (`store_id`,`status`) WHERE "haggle_sessions"."status" = 'active' AND "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `haggle_deleted_idx` ON `haggle_sessions` (`deleted_at`) WHERE "haggle_sessions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `haggle_active_unique_idx` ON `haggle_sessions` (`customer_id`,`product_id`) WHERE "haggle_sessions"."status" IN ('active', 'counter_offered') AND "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`short_description` text,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`cost` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`sku` text,
	`barcode` text,
	`weight` text,
	`length` text,
	`width` text,
	`height` text,
	`media_ids` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`video_url` text,
	`image_src` text,
	`variants` text DEFAULT '[]' NOT NULL,
	`variant_prices` text DEFAULT '{}' NOT NULL,
	`haggle_enabled` integer DEFAULT false NOT NULL,
	`min_price` integer,
	`meta_title` text,
	`meta_description` text,
	`is_published` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_prod_name_not_empty" CHECK(length("__new_products"."name") > 0),
	CONSTRAINT "chk_prod_slug_not_empty" CHECK(length("__new_products"."slug") > 0),
	CONSTRAINT "chk_price_non_negative" CHECK("__new_products"."price" >= 0),
	CONSTRAINT "chk_stock_non_negative" CHECK("__new_products"."stock" >= 0),
	CONSTRAINT "chk_low_stock_non_negative" CHECK("__new_products"."low_stock_threshold" >= 0),
	CONSTRAINT "chk_compare_at_price" CHECK("__new_products"."compare_at_price" IS NULL OR "__new_products"."compare_at_price" >= "__new_products"."price"),
	CONSTRAINT "chk_cost_non_negative" CHECK("__new_products"."cost" IS NULL OR "__new_products"."cost" >= 0),
	CONSTRAINT "chk_cost_price" CHECK("__new_products"."cost" IS NULL OR "__new_products"."cost" <= "__new_products"."price"),
	CONSTRAINT "chk_min_price_non_negative" CHECK("__new_products"."min_price" IS NULL OR "__new_products"."min_price" >= 0),
	CONSTRAINT "chk_min_price_limit" CHECK("__new_products"."min_price" IS NULL OR "__new_products"."min_price" <= "__new_products"."price"),
	CONSTRAINT "chk_haggle_min_price" CHECK("__new_products"."haggle_enabled" = 0 OR "__new_products"."min_price" IS NOT NULL),
	CONSTRAINT "chk_weight_positive" CHECK("__new_products"."weight" IS NULL OR CAST("__new_products"."weight" AS REAL) > 0.0),
	CONSTRAINT "chk_length_positive" CHECK("__new_products"."length" IS NULL OR CAST("__new_products"."length" AS REAL) > 0.0),
	CONSTRAINT "chk_width_positive" CHECK("__new_products"."width" IS NULL OR CAST("__new_products"."width" AS REAL) > 0.0),
	CONSTRAINT "chk_height_positive" CHECK("__new_products"."height" IS NULL OR CAST("__new_products"."height" AS REAL) > 0.0),
	CONSTRAINT "chk_prod_slug_format" CHECK("__new_products"."slug" NOT LIKE '% %'),
	CONSTRAINT "chk_barcode_format" CHECK("__new_products"."barcode" IS NULL OR length("__new_products"."barcode") >= 3),
	CONSTRAINT "chk_images_limit" CHECK(json_array_length("__new_products"."images") <= 50),
	CONSTRAINT "chk_variants_limit" CHECK(json_array_length("__new_products"."variants") <= 100),
	CONSTRAINT "chk_short_description_length" CHECK("__new_products"."short_description" IS NULL OR length("__new_products"."short_description") <= 500)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "store_id", "category_id", "name", "slug", "description", "short_description", "price", "compare_at_price", "cost", "stock", "low_stock_threshold", "sku", "barcode", "weight", "length", "width", "height", "media_ids", "images", "video_url", "image_src", "variants", "variant_prices", "haggle_enabled", "min_price", "meta_title", "meta_description", "is_published", "is_featured", "metadata", "deleted_at", "created_at", "updated_at") SELECT "id", "store_id", "category_id", "name", "slug", "description", "short_description", "price", "compare_at_price", "cost", "stock", "low_stock_threshold", "sku", "barcode", "weight", "length", "width", "height", "media_ids", "images", "video_url", "image_src", "variants", "variant_prices", "haggle_enabled", "min_price", "meta_title", "meta_description", "is_published", "is_featured", "metadata", "deleted_at", "created_at", "updated_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`store_id`,`slug`) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`store_id`,`sku`) WHERE "products"."sku" IS NOT NULL AND "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `products_store_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`) WHERE "products"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `products_price_idx` ON `products` (`store_id`,`price`);--> statement-breakpoint
CREATE INDEX `products_published_idx` ON `products` (`store_id`,`is_published`) WHERE "products"."is_published" = 1;--> statement-breakpoint
CREATE INDEX `products_featured_idx` ON `products` (`store_id`,`is_featured`) WHERE "products"."is_featured" = 1;--> statement-breakpoint
CREATE INDEX `products_stock_idx` ON `products` (`store_id`,`stock`) WHERE "products"."stock" > 0;--> statement-breakpoint
CREATE INDEX `products_created_idx` ON `products` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_deleted_idx` ON `products` (`deleted_at`) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_barcode_idx` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `products_store_published_created_idx` ON `products` (`store_id`,`is_published`,`created_at`) WHERE "products"."is_published" = 1 AND "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `products_haggle_idx` ON `products` (`store_id`,`haggle_enabled`) WHERE "products"."haggle_enabled" = 1;--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`store_id`,`"name" COLLATE NOCASE`);--> statement-breakpoint
CREATE TABLE `__new_store_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`total_products` integer DEFAULT 0 NOT NULL,
	`total_orders` integer DEFAULT 0 NOT NULL,
	`total_customers` integer DEFAULT 0 NOT NULL,
	`total_revenue` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_products_positive" CHECK("__new_store_stats"."total_products" >= 0),
	CONSTRAINT "chk_stats_orders_positive" CHECK("__new_store_stats"."total_orders" >= 0),
	CONSTRAINT "chk_stats_customers_positive" CHECK("__new_store_stats"."total_customers" >= 0),
	CONSTRAINT "chk_stats_revenue_positive" CHECK("__new_store_stats"."total_revenue" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_store_stats`("id", "store_id", "total_products", "total_orders", "total_customers", "total_revenue", "updated_at") SELECT "id", "store_id", "total_products", "total_orders", "total_customers", "total_revenue", "updated_at" FROM `store_stats`;--> statement-breakpoint
DROP TABLE `store_stats`;--> statement-breakpoint
ALTER TABLE `__new_store_stats` RENAME TO `store_stats`;--> statement-breakpoint
CREATE UNIQUE INDEX `store_stats_store_idx` ON `store_stats` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_stats_revenue_idx` ON `store_stats` (`total_revenue`);--> statement-breakpoint
CREATE INDEX `store_stats_orders_idx` ON `store_stats` (`total_orders`);--> statement-breakpoint
CREATE INDEX `store_stats_products_idx` ON `store_stats` (`total_products`);--> statement-breakpoint
CREATE TABLE `__new_stores` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`deleted_by` text,
	`verified_by` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`shop_name` text,
	`description` text,
	`logo_url` text,
	`cover_image_url` text,
	`phone` text,
	`email` text,
	`telegram_chat_id` text,
	`telegram_username` text,
	`country` text DEFAULT 'EG' NOT NULL,
	`city` text,
	`address` text,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`payment_gateway` text DEFAULT 'stripe' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`theme` text DEFAULT '{}' NOT NULL,
	`template_version` text DEFAULT 'v1' NOT NULL,
	`cloudinary_account_index` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`deleted_at` integer,
	`deletion_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_store_name_not_empty" CHECK("__new_stores"."name" != ''),
	CONSTRAINT "chk_store_slug_not_empty" CHECK("__new_stores"."slug" != ''),
	CONSTRAINT "chk_store_slug_format" CHECK(length("__new_stores"."slug") >= 2 AND "__new_stores"."slug" NOT LIKE '-%' AND "__new_stores"."slug" NOT LIKE '%-'),
	CONSTRAINT "chk_country_code" CHECK(length("__new_stores"."country") = 2),
	CONSTRAINT "chk_currency_code" CHECK(length("__new_stores"."currency") = 3),
	CONSTRAINT "chk_payment_gateway" CHECK("__new_stores"."payment_gateway" IN ('stripe', 'paypal', 'paymob', 'cash')),
	CONSTRAINT "chk_store_phone_not_empty" CHECK("__new_stores"."phone" IS NULL OR "__new_stores"."phone" != ''),
	CONSTRAINT "chk_store_email_format" CHECK("__new_stores"."email" IS NULL OR "__new_stores"."email" LIKE '%_@_%._%'),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_stores"."deleted_at" IS NULL OR "__new_stores"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_verified_by_consistency" CHECK(("__new_stores"."is_verified" = 0 OR "__new_stores"."verified_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_stores`("id", "owner_id", "deleted_by", "verified_by", "name", "slug", "shop_name", "description", "logo_url", "cover_image_url", "phone", "email", "telegram_chat_id", "telegram_username", "country", "city", "address", "currency", "payment_gateway", "settings", "theme", "template_version", "cloudinary_account_index", "is_active", "is_verified", "is_featured", "verified_at", "deleted_at", "deletion_reason", "created_at", "updated_at") SELECT "id", "owner_id", "deleted_by", "verified_by", "name", "slug", "shop_name", "description", "logo_url", "cover_image_url", "phone", "email", "telegram_chat_id", "telegram_username", "country", "city", "address", "currency", "payment_gateway", "settings", "theme", "template_version", "cloudinary_account_index", "is_active", "is_verified", "is_featured", "verified_at", "deleted_at", "deletion_reason", "created_at", "updated_at" FROM `stores`;--> statement-breakpoint
DROP TABLE `stores`;--> statement-breakpoint
ALTER TABLE `__new_stores` RENAME TO `stores`;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_telegram_chat_unique` ON `stores` (`telegram_chat_id`) WHERE "stores"."telegram_chat_id" IS NOT NULL AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_telegram_username_unique` ON `stores` (`telegram_username`) WHERE "stores"."telegram_username" IS NOT NULL AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_owner_idx` ON `stores` (`owner_id`);--> statement-breakpoint
CREATE INDEX `stores_deleted_by_idx` ON `stores` (`deleted_by`);--> statement-breakpoint
CREATE INDEX `stores_slug_active_idx` ON `stores` (`slug`,`is_active`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_geo_active_idx` ON `stores` (`country`,`city`,`is_active`) WHERE "stores"."is_active" = 1 AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_featured_idx` ON `stores` (`is_featured`) WHERE "stores"."is_featured" = 1 AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_deleted_idx` ON `stores` (`deleted_at`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_created_idx` ON `stores` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_telegram_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text,
	`customer_id` text,
	`user_id` text,
	`order_id` text,
	`chat_session_id` text,
	`chat_id` text NOT NULL,
	`telegram_user_id` text,
	`telegram_message_id` integer,
	`reply_to_message_id` integer,
	`update_id` integer,
	`webhook_id` text,
	`direction` text NOT NULL,
	`message_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`content` text,
	`caption` text,
	`command` text,
	`language` text DEFAULT 'ar' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`file_id` text,
	`file_unique_id` text,
	`buttons` text DEFAULT '[]' NOT NULL,
	`inline_keyboard` text,
	`reply_keyboard` text,
	`entities` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`processed_at` integer,
	`processing_error` text,
	`sent_at` integer,
	`delivered_at` integer,
	`read_at` integer,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_retry_at` integer,
	`failure_reason` text,
	`failure_code` text,
	`spam_score` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_direction" CHECK("__new_telegram_messages"."direction" IN ('incoming', 'outgoing')),
	CONSTRAINT "chk_message_type" CHECK("__new_telegram_messages"."message_type" IN ('text', 'photo', 'sticker', 'contact', 'callback_query', 'command', 'video', 'document', 'audio', 'voice', 'location', 'other')),
	CONSTRAINT "chk_message_status" CHECK("__new_telegram_messages"."status" IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
	CONSTRAINT "chk_language" CHECK("__new_telegram_messages"."language" IN ('ar', 'en', 'fr', 'es')),
	CONSTRAINT "chk_message_ownership" CHECK(NOT ("__new_telegram_messages"."store_id" IS NULL AND "__new_telegram_messages"."customer_id" IS NOT NULL)),
	CONSTRAINT "chk_telegram_message_id_positive" CHECK("__new_telegram_messages"."telegram_message_id" IS NULL OR "__new_telegram_messages"."telegram_message_id" > 0),
	CONSTRAINT "chk_reply_to_message_id_positive" CHECK("__new_telegram_messages"."reply_to_message_id" IS NULL OR "__new_telegram_messages"."reply_to_message_id" > 0),
	CONSTRAINT "chk_update_id_positive" CHECK("__new_telegram_messages"."update_id" IS NULL OR "__new_telegram_messages"."update_id" > 0),
	CONSTRAINT "chk_command_format" CHECK("__new_telegram_messages"."command" IS NULL OR ("__new_telegram_messages"."command" GLOB '/*' AND length("__new_telegram_messages"."command") <= 50)),
	CONSTRAINT "chk_content_length" CHECK("__new_telegram_messages"."content" IS NULL OR length("__new_telegram_messages"."content") <= 4096),
	CONSTRAINT "chk_caption_length" CHECK("__new_telegram_messages"."caption" IS NULL OR length("__new_telegram_messages"."caption") <= 1024),
	CONSTRAINT "chk_attachments_limit" CHECK(json_array_length("__new_telegram_messages"."attachments") <= 10),
	CONSTRAINT "chk_buttons_limit" CHECK(json_array_length("__new_telegram_messages"."buttons") <= 20),
	CONSTRAINT "chk_entities_limit" CHECK(json_array_length("__new_telegram_messages"."entities") <= 100),
	CONSTRAINT "chk_retry_count_non_negative" CHECK("__new_telegram_messages"."retry_count" >= 0),
	CONSTRAINT "chk_spam_score_range" CHECK("__new_telegram_messages"."spam_score" BETWEEN 0 AND 100),
	CONSTRAINT "chk_sent_consistency" CHECK("__new_telegram_messages"."sent_at" IS NULL OR "__new_telegram_messages"."status" NOT IN ('pending')),
	CONSTRAINT "chk_delivered_consistency" CHECK("__new_telegram_messages"."delivered_at" IS NULL OR "__new_telegram_messages"."status" IN ('delivered', 'read')),
	CONSTRAINT "chk_read_consistency" CHECK("__new_telegram_messages"."read_at" IS NULL OR "__new_telegram_messages"."status" = 'read'),
	CONSTRAINT "chk_failure_consistency" CHECK(("__new_telegram_messages"."status" != 'failed' AND "__new_telegram_messages"."failure_reason" IS NULL) OR ("__new_telegram_messages"."status" = 'failed' AND "__new_telegram_messages"."failure_reason" IS NOT NULL)),
	CONSTRAINT "chk_metadata_valid" CHECK("__new_telegram_messages"."metadata" IS NULL OR (json_valid("__new_telegram_messages"."metadata") = 1 AND json_type("__new_telegram_messages"."metadata") = 'object'))
);
--> statement-breakpoint
INSERT INTO `__new_telegram_messages`("id", "store_id", "customer_id", "user_id", "order_id", "chat_session_id", "chat_id", "telegram_user_id", "telegram_message_id", "reply_to_message_id", "update_id", "webhook_id", "direction", "message_type", "status", "content", "caption", "command", "language", "attachments", "file_id", "file_unique_id", "buttons", "inline_keyboard", "reply_keyboard", "entities", "metadata", "processed_at", "processing_error", "sent_at", "delivered_at", "read_at", "retry_count", "last_retry_at", "failure_reason", "failure_code", "spam_score", "created_at", "updated_at", "deleted_at") SELECT "id", "store_id", "customer_id", "user_id", "order_id", "chat_session_id", "chat_id", "telegram_user_id", "telegram_message_id", "reply_to_message_id", "update_id", "webhook_id", "direction", "message_type", "status", "content", "caption", "command", "language", "attachments", "file_id", "file_unique_id", "buttons", "inline_keyboard", "reply_keyboard", "entities", "metadata", "processed_at", "processing_error", "sent_at", "delivered_at", "read_at", "retry_count", "last_retry_at", "failure_reason", "failure_code", "spam_score", "created_at", "updated_at", "deleted_at" FROM `telegram_messages`;--> statement-breakpoint
DROP TABLE `telegram_messages`;--> statement-breakpoint
ALTER TABLE `__new_telegram_messages` RENAME TO `telegram_messages`;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_messages_telegram_id_unique` ON `telegram_messages` (`telegram_message_id`) WHERE "telegram_messages"."telegram_message_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_messages_update_id_unique` ON `telegram_messages` (`update_id`) WHERE "telegram_messages"."update_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_store_idx` ON `telegram_messages` (`store_id`) WHERE "telegram_messages"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_customer_idx` ON `telegram_messages` (`customer_id`) WHERE "telegram_messages"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_user_idx` ON `telegram_messages` (`user_id`) WHERE "telegram_messages"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_order_idx` ON `telegram_messages` (`order_id`) WHERE "telegram_messages"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_chat_session_idx` ON `telegram_messages` (`chat_session_id`) WHERE "telegram_messages"."chat_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_chat_idx` ON `telegram_messages` (`chat_id`);--> statement-breakpoint
CREATE INDEX `telegram_messages_chat_created_idx` ON `telegram_messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `telegram_messages_telegram_user_idx` ON `telegram_messages` (`telegram_user_id`) WHERE "telegram_messages"."telegram_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_telegram_message_idx` ON `telegram_messages` (`telegram_message_id`) WHERE "telegram_messages"."telegram_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_update_id_idx` ON `telegram_messages` (`update_id`) WHERE "telegram_messages"."update_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_webhook_idx` ON `telegram_messages` (`webhook_id`) WHERE "telegram_messages"."webhook_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_direction_idx` ON `telegram_messages` (`direction`);--> statement-breakpoint
CREATE INDEX `telegram_messages_type_idx` ON `telegram_messages` (`message_type`);--> statement-breakpoint
CREATE INDEX `telegram_messages_status_idx` ON `telegram_messages` (`status`);--> statement-breakpoint
CREATE INDEX `telegram_messages_language_idx` ON `telegram_messages` (`language`);--> statement-breakpoint
CREATE INDEX `telegram_messages_file_id_idx` ON `telegram_messages` (`file_id`) WHERE "telegram_messages"."file_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_spam_idx` ON `telegram_messages` (`spam_score`) WHERE "telegram_messages"."spam_score" > 70;--> statement-breakpoint
CREATE INDEX `telegram_messages_created_idx` ON `telegram_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `telegram_messages_sent_idx` ON `telegram_messages` (`sent_at`) WHERE "telegram_messages"."sent_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_deleted_idx` ON `telegram_messages` (`deleted_at`) WHERE "telegram_messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_store_status_idx` ON `telegram_messages` (`store_id`,`status`) WHERE "telegram_messages"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `telegram_messages_chat_direction_idx` ON `telegram_messages` (`chat_id`,`direction`);--> statement-breakpoint
CREATE INDEX `telegram_messages_chat_type_idx` ON `telegram_messages` (`chat_id`,`message_type`);--> statement-breakpoint
CREATE TABLE `__new_chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`store_id` text,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`visitor_fingerprint` text,
	`state` text DEFAULT '{}' NOT NULL,
	`timestamps` text DEFAULT '{}' NOT NULL,
	`last_activity_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_platform" CHECK("__new_chat_sessions"."platform" IN ('telegram', 'web', 'whatsapp', 'messenger')),
	CONSTRAINT "chk_platform_length" CHECK(length("__new_chat_sessions"."platform") BETWEEN 1 AND 50),
	CONSTRAINT "chk_external_id_not_empty" CHECK(length("__new_chat_sessions"."external_id") > 0),
	CONSTRAINT "chk_external_id_length" CHECK(length("__new_chat_sessions"."external_id") <= 255),
	CONSTRAINT "chk_session_routing_integrity" CHECK(("__new_chat_sessions"."platform" = 'web' AND "__new_chat_sessions"."store_id" IS NOT NULL) OR ("__new_chat_sessions"."platform" IN ('telegram', 'whatsapp', 'messenger') AND length("__new_chat_sessions"."external_id") > 0)),
	CONSTRAINT "chk_state_step" CHECK(
        json_extract("__new_chat_sessions"."state", '$.step') IS NULL 
        OR json_extract("__new_chat_sessions"."state", '$.step') IN ('phone','name','store','niche','completed','expired')
      ),
	CONSTRAINT "chk_timestamps_object" CHECK(json_valid("__new_chat_sessions"."timestamps") = 1 AND json_type("__new_chat_sessions"."timestamps") = 'object'),
	CONSTRAINT "chk_visitor_fingerprint" CHECK(
        "__new_chat_sessions"."visitor_fingerprint" IS NULL 
        OR (
          length("__new_chat_sessions"."visitor_fingerprint") = 64 
          AND "__new_chat_sessions"."visitor_fingerprint" GLOB '[a-fA-F0-9]*'
          AND "__new_chat_sessions"."visitor_fingerprint" NOT GLOB '*[^a-fA-F0-9]*'
        )
      )
);
--> statement-breakpoint
INSERT INTO `__new_chat_sessions`("id", "user_id", "store_id", "platform", "external_id", "visitor_fingerprint", "state", "timestamps", "last_activity_at", "deleted_at", "created_at", "updated_at") SELECT "id", "user_id", "store_id", "platform", "external_id", "visitor_fingerprint", "state", "timestamps", "last_activity_at", "deleted_at", "created_at", "updated_at" FROM `chat_sessions`;--> statement-breakpoint
DROP TABLE `chat_sessions`;--> statement-breakpoint
ALTER TABLE `__new_chat_sessions` RENAME TO `chat_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_platform_external_unique` ON `chat_sessions` (`platform`,`external_id`) WHERE "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_last_activity_idx` ON `chat_sessions` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `chat_sessions_created_idx` ON `chat_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_sessions_deleted_idx` ON `chat_sessions` (`deleted_at`) WHERE "chat_sessions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_user_idx` ON `chat_sessions` (`user_id`) WHERE "chat_sessions"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_store_idx` ON `chat_sessions` (`store_id`) WHERE "chat_sessions"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_platform_idx` ON `chat_sessions` (`platform`);--> statement-breakpoint
CREATE INDEX `chat_sessions_visitor_idx` ON `chat_sessions` (`visitor_fingerprint`) WHERE "chat_sessions"."visitor_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_store_platform_idx` ON `chat_sessions` (`store_id`,`platform`) WHERE "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_user_platform_idx` ON `chat_sessions` (`user_id`,`platform`) WHERE "chat_sessions"."user_id" IS NOT NULL AND "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_media` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text,
	`category_id` text,
	`url` text NOT NULL,
	`original_url` text,
	`cdn_url` text,
	`type` text NOT NULL,
	`mime_type` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_media_type" CHECK("__new_media"."type" IN ('image', 'video', 'document', 'audio', 'archive')),
	CONSTRAINT "chk_type_length" CHECK(length("__new_media"."type") BETWEEN 1 AND 20),
	CONSTRAINT "chk_filename_length" CHECK(length("__new_media"."filename") BETWEEN 1 AND 255),
	CONSTRAINT "chk_url_length" CHECK(length("__new_media"."url") BETWEEN 1 AND 2048),
	CONSTRAINT "chk_mime_type_length" CHECK(length("__new_media"."mime_type") BETWEEN 1 AND 100),
	CONSTRAINT "chk_mime_type_format" CHECK("__new_media"."mime_type" GLOB '*/*' AND "__new_media"."mime_type" NOT GLOB '*[^a-zA-Z0-9/+.-]*'),
	CONSTRAINT "chk_size_non_negative" CHECK("__new_media"."size" >= 0),
	CONSTRAINT "chk_order_non_negative" CHECK("__new_media"."order" >= 0),
	CONSTRAINT "chk_view_count_non_negative" CHECK("__new_media"."view_count" >= 0),
	CONSTRAINT "chk_download_count_non_negative" CHECK("__new_media"."download_count" >= 0),
	CONSTRAINT "chk_metadata_valid" CHECK(json_valid("__new_media"."metadata") = 1 AND json_type("__new_media"."metadata") = 'object')
);
--> statement-breakpoint
INSERT INTO `__new_media`("id", "store_id", "product_id", "category_id", "url", "original_url", "cdn_url", "type", "mime_type", "filename", "size", "metadata", "order", "is_primary", "view_count", "download_count", "last_viewed_at", "deleted_at", "created_at", "updated_at") SELECT "id", "store_id", "product_id", "category_id", "url", "original_url", "cdn_url", "type", "mime_type", "filename", "size", "metadata", "order", "is_primary", "view_count", "download_count", "last_viewed_at", "deleted_at", "created_at", "updated_at" FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
ALTER TABLE `__new_media` RENAME TO `media`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_store_url_unique` ON `media` (`store_id`,`url`) WHERE "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `media_primary_product_unique` ON `media` (`product_id`) WHERE "media"."is_primary" = 1 AND "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `media_store_idx` ON `media` (`store_id`);--> statement-breakpoint
CREATE INDEX `media_type_idx` ON `media` (`store_id`,`type`);--> statement-breakpoint
CREATE INDEX `media_url_idx` ON `media` (`url`);--> statement-breakpoint
CREATE INDEX `media_filename_idx` ON `media` (`filename`);--> statement-breakpoint
CREATE INDEX `media_mime_type_idx` ON `media` (`mime_type`);--> statement-breakpoint
CREATE INDEX `media_product_idx` ON `media` (`product_id`) WHERE "media"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `media_category_idx` ON `media` (`category_id`) WHERE "media"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `media_product_order_idx` ON `media` (`product_id`,`order`) WHERE "media"."product_id" IS NOT NULL AND "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `media_views_idx` ON `media` (`view_count`);--> statement-breakpoint
CREATE INDEX `media_last_viewed_idx` ON `media` (`last_viewed_at`);--> statement-breakpoint
CREATE INDEX `media_deleted_idx` ON `media` (`deleted_at`) WHERE "media"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `media_primary_idx` ON `media` (`product_id`) WHERE "media"."is_primary" = 1 AND "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`store_id` text NOT NULL,
	`variant_sku` text NOT NULL,
	`product_name` text NOT NULL,
	`product_slug` text,
	`product_image` text,
	`product_sku` text NOT NULL,
	`product_options` text DEFAULT '{}' NOT NULL,
	`ordered_qty` integer DEFAULT 1 NOT NULL,
	`cancelled_qty` integer DEFAULT 0 NOT NULL,
	`shipped_qty` integer DEFAULT 0 NOT NULL,
	`returned_qty` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	`line_total` integer NOT NULL,
	`original_price` integer NOT NULL,
	`haggle_discount` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`tax_rate` integer DEFAULT 0 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`shipping_method` text,
	`commission_rate` integer DEFAULT 0 NOT NULL,
	`commission_amount` integer DEFAULT 0 NOT NULL,
	`net_amount` integer NOT NULL,
	`weight` text,
	`length` text,
	`width` text,
	`height` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`tracking_number` text,
	`tracking_url` text,
	`carrier` text,
	`shipped_at` integer,
	`delivered_at` integer,
	`return_status` text,
	`return_reason` text,
	`return_requested_at` integer,
	`return_processed_at` integer,
	`refund_amount` integer DEFAULT 0 NOT NULL,
	`warehouse_location` text,
	`batch_number` text,
	`expiry_date` integer,
	`notes` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_item_status" CHECK("__new_order_items"."status" IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
	CONSTRAINT "chk_fulfillment_status" CHECK("__new_order_items"."fulfillment_status" IN ('unfulfilled', 'partial', 'fulfilled')),
	CONSTRAINT "chk_return_status" CHECK("__new_order_items"."return_status" IS NULL OR "__new_order_items"."return_status" IN ('requested', 'approved', 'rejected', 'processed', 'refunded')),
	CONSTRAINT "chk_qty_positive" CHECK("__new_order_items"."ordered_qty" > 0),
	CONSTRAINT "chk_cancelled_positive" CHECK("__new_order_items"."cancelled_qty" >= 0),
	CONSTRAINT "chk_shipped_positive" CHECK("__new_order_items"."shipped_qty" >= 0),
	CONSTRAINT "chk_returned_positive" CHECK("__new_order_items"."returned_qty" >= 0),
	CONSTRAINT "chk_qty_integrity" CHECK("__new_order_items"."cancelled_qty" + "__new_order_items"."shipped_qty" <= "__new_order_items"."ordered_qty"),
	CONSTRAINT "chk_return_limit" CHECK("__new_order_items"."returned_qty" <= "__new_order_items"."shipped_qty"),
	CONSTRAINT "chk_tax_rate_range" CHECK("__new_order_items"."tax_rate" >= 0 AND "__new_order_items"."tax_rate" <= 100),
	CONSTRAINT "chk_commission_rate_range" CHECK("__new_order_items"."commission_rate" >= 0 AND "__new_order_items"."commission_rate" <= 100),
	CONSTRAINT "chk_price_positive" CHECK("__new_order_items"."price" >= 0),
	CONSTRAINT "chk_line_total_positive" CHECK("__new_order_items"."line_total" >= 0),
	CONSTRAINT "chk_original_price_positive" CHECK("__new_order_items"."original_price" >= 0),
	CONSTRAINT "chk_haggle_discount_non_negative" CHECK("__new_order_items"."haggle_discount" >= 0),
	CONSTRAINT "chk_discount_non_negative" CHECK("__new_order_items"."discount" >= 0),
	CONSTRAINT "chk_tax_non_negative" CHECK("__new_order_items"."tax_amount" >= 0),
	CONSTRAINT "chk_shipping_non_negative" CHECK("__new_order_items"."shipping_cost" >= 0),
	CONSTRAINT "chk_commission_non_negative" CHECK("__new_order_items"."commission_amount" >= 0),
	CONSTRAINT "chk_net_amount_positive" CHECK("__new_order_items"."net_amount" >= 0),
	CONSTRAINT "chk_sku_not_empty" CHECK("__new_order_items"."product_sku" != ''),
	CONSTRAINT "chk_variant_sku_not_empty" CHECK("__new_order_items"."variant_sku" != ''),
	CONSTRAINT "chk_product_name_not_empty" CHECK("__new_order_items"."product_name" != '')
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "order_id", "product_id", "store_id", "variant_sku", "product_name", "product_slug", "product_image", "product_sku", "product_options", "ordered_qty", "cancelled_qty", "shipped_qty", "returned_qty", "price", "line_total", "original_price", "haggle_discount", "discount", "tax_amount", "tax_rate", "shipping_cost", "shipping_method", "commission_rate", "commission_amount", "net_amount", "weight", "length", "width", "height", "status", "fulfillment_status", "tracking_number", "tracking_url", "carrier", "shipped_at", "delivered_at", "return_status", "return_reason", "return_requested_at", "return_processed_at", "refund_amount", "warehouse_location", "batch_number", "expiry_date", "notes", "metadata", "created_at", "updated_at") SELECT "id", "order_id", "product_id", "store_id", "variant_sku", "product_name", "product_slug", "product_image", "product_sku", "product_options", "ordered_qty", "cancelled_qty", "shipped_qty", "returned_qty", "price", "line_total", "original_price", "haggle_discount", "discount", "tax_amount", "tax_rate", "shipping_cost", "shipping_method", "commission_rate", "commission_amount", "net_amount", "weight", "length", "width", "height", "status", "fulfillment_status", "tracking_number", "tracking_url", "carrier", "shipped_at", "delivered_at", "return_status", "return_reason", "return_requested_at", "return_processed_at", "refund_amount", "warehouse_location", "batch_number", "expiry_date", "notes", "metadata", "created_at", "updated_at" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_variant_unique` ON `order_items` (`order_id`,`variant_sku`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`) WHERE "order_items"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `order_items_store_idx` ON `order_items` (`store_id`);--> statement-breakpoint
CREATE INDEX `order_items_variant_sku_idx` ON `order_items` (`variant_sku`);--> statement-breakpoint
CREATE INDEX `order_items_product_sku_idx` ON `order_items` (`product_sku`);--> statement-breakpoint
CREATE INDEX `order_items_status_idx` ON `order_items` (`status`);--> statement-breakpoint
CREATE INDEX `order_items_fulfillment_idx` ON `order_items` (`fulfillment_status`);--> statement-breakpoint
CREATE INDEX `order_items_tracking_idx` ON `order_items` (`tracking_number`) WHERE "order_items"."tracking_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `order_items_carrier_idx` ON `order_items` (`carrier`) WHERE "order_items"."carrier" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `order_items_return_status_idx` ON `order_items` (`return_status`) WHERE "order_items"."return_status" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `order_items_store_order_idx` ON `order_items` (`store_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_store_status_idx` ON `order_items` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_items_order_status_idx` ON `order_items` (`order_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text DEFAULT '{}' NOT NULL,
	`type` text DEFAULT 'json' NOT NULL,
	`description` text,
	`category` text,
	`environment` text DEFAULT 'production' NOT NULL,
	`store_id` text,
	`is_public` integer DEFAULT false NOT NULL,
	`validation` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "chk_key_format" CHECK(
        "__new_platform_settings"."key" GLOB '[a-z0-9]*'
        AND "__new_platform_settings"."key" NOT GLOB '*..*'
        AND "__new_platform_settings"."key" NOT GLOB '*__*'
        AND "__new_platform_settings"."key" NOT GLOB '*.-*'
        AND "__new_platform_settings"."key" NOT GLOB '*-.*'
      ),
	CONSTRAINT "chk_key_length" CHECK(length("__new_platform_settings"."key") BETWEEN 1 AND 100),
	CONSTRAINT "chk_category_format" CHECK("__new_platform_settings"."category" IS NULL OR "__new_platform_settings"."category" GLOB '[a-z0-9._-]*'),
	CONSTRAINT "chk_category_length" CHECK("__new_platform_settings"."category" IS NULL OR length("__new_platform_settings"."category") <= 50),
	CONSTRAINT "chk_value_type" CHECK("__new_platform_settings"."type" IN ('string', 'number', 'boolean', 'json', 'array')),
	CONSTRAINT "chk_environment" CHECK("__new_platform_settings"."environment" IN ('production', 'staging', 'development', 'test')),
	CONSTRAINT "chk_version_positive" CHECK("__new_platform_settings"."version" >= 1),
	CONSTRAINT "chk_value_valid" CHECK("__new_platform_settings"."value" IS NULL OR json_valid("__new_platform_settings"."value") = 1)
);
--> statement-breakpoint
INSERT INTO `__new_platform_settings`("id", "key", "value", "type", "description", "category", "environment", "store_id", "is_public", "validation", "version", "updated_by", "created_at", "updated_at") SELECT "id", "key", "value", "type", "description", "category", "environment", "store_id", "is_public", "validation", "version", "updated_by", "created_at", "updated_at" FROM `platform_settings`;--> statement-breakpoint
DROP TABLE `platform_settings`;--> statement-breakpoint
ALTER TABLE `__new_platform_settings` RENAME TO `platform_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_settings_key_env_unique` ON `platform_settings` (`key`,`environment`) WHERE "platform_settings"."store_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_settings_key_store_env_unique` ON `platform_settings` (`key`,`store_id`,`environment`) WHERE "platform_settings"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_category_idx` ON `platform_settings` (`category`);--> statement-breakpoint
CREATE INDEX `platform_settings_type_idx` ON `platform_settings` (`type`);--> statement-breakpoint
CREATE INDEX `platform_settings_environment_idx` ON `platform_settings` (`environment`);--> statement-breakpoint
CREATE INDEX `platform_settings_public_idx` ON `platform_settings` (`is_public`) WHERE "platform_settings"."is_public" = 1 AND "platform_settings"."environment" = 'production';--> statement-breakpoint
CREATE INDEX `platform_settings_store_idx` ON `platform_settings` (`store_id`) WHERE "platform_settings"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_store_env_idx` ON `platform_settings` (`store_id`,`environment`) WHERE "platform_settings"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_category_env_idx` ON `platform_settings` (`category`,`environment`);--> statement-breakpoint
CREATE TABLE `__new_audit_logs_default` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`store_id` text,
	`user_name` text,
	`user_role` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name` text,
	`changes` text DEFAULT '{}',
	`ip_address` text,
	`user_agent` text,
	`referrer` text,
	`request_id` text,
	`success` integer DEFAULT true NOT NULL,
	`error_message` text,
	`metadata` text DEFAULT '{}',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "audit_logs_default_chk_entity_type_not_empty" CHECK(length("__new_audit_logs_default"."entity_type") > 0),
	CONSTRAINT "audit_logs_default_chk_entity_id_not_empty" CHECK(length("__new_audit_logs_default"."entity_id") > 0),
	CONSTRAINT "audit_logs_default_chk_error_message" CHECK(("__new_audit_logs_default"."success" = 1 AND "__new_audit_logs_default"."error_message" IS NULL) OR ("__new_audit_logs_default"."success" = 0 AND "__new_audit_logs_default"."error_message" IS NOT NULL)),
	CONSTRAINT "audit_logs_default_chk_user_or_store" CHECK("__new_audit_logs_default"."user_id" IS NOT NULL OR "__new_audit_logs_default"."store_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs_default`("id", "user_id", "store_id", "user_name", "user_role", "action", "entity_type", "entity_id", "entity_name", "changes", "ip_address", "user_agent", "referrer", "request_id", "success", "error_message", "metadata", "created_at") SELECT "id", "user_id", "store_id", "user_name", "user_role", "action", "entity_type", "entity_id", "entity_name", "changes", "ip_address", "user_agent", "referrer", "request_id", "success", "error_message", "metadata", "created_at" FROM `audit_logs_default`;--> statement-breakpoint
DROP TABLE `audit_logs_default`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs_default` RENAME TO `audit_logs_default`;--> statement-breakpoint
CREATE INDEX `audit_logs_default_user_idx` ON `audit_logs_default` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_store_idx` ON `audit_logs_default` (`store_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_entity_idx` ON `audit_logs_default` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_action_idx` ON `audit_logs_default` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_created_idx` ON `audit_logs_default` (`"created_at" DESC`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_store_created_idx` ON `audit_logs_default` (`store_id`,`"created_at" DESC`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_request_id_idx` ON `audit_logs_default` (`request_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_success_idx` ON `audit_logs_default` (`success`) WHERE "audit_logs_default"."success" = 0;--> statement-breakpoint
CREATE TABLE `__new_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "chk_verification_identifier_not_empty" CHECK(length("__new_verification"."identifier") > 0),
	CONSTRAINT "chk_verification_value_not_empty" CHECK(length("__new_verification"."value") > 0)
);
--> statement-breakpoint
INSERT INTO `__new_verification`("id", "identifier", "value", "expires_at", "created_at", "updated_at") SELECT "id", "identifier", "value", "expires_at", "created_at", "updated_at" FROM `verification`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
ALTER TABLE `__new_verification` RENAME TO `verification`;--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `verification_identifier_value_unique` ON `verification` (`identifier`,`value`);--> statement-breakpoint
CREATE TABLE `__new_coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`min_order_amount` text DEFAULT '0' NOT NULL,
	`max_discount_amount` text,
	`applicable_categories` text DEFAULT '[]' NOT NULL,
	`applicable_products` text DEFAULT '[]' NOT NULL,
	`max_uses` integer,
	`max_uses_per_customer` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_coupon_type" CHECK("__new_coupons"."type" IN ('percentage', 'fixed')),
	CONSTRAINT "chk_code_format" CHECK(length("__new_coupons"."code") > 0 AND "__new_coupons"."code" GLOB '[A-Z0-9_-]*'),
	CONSTRAINT "chk_value_positive" CHECK(CAST("__new_coupons"."value" AS REAL) > 0.0),
	CONSTRAINT "chk_min_order_positive" CHECK(CAST("__new_coupons"."min_order_amount" AS REAL) >= 0.0),
	CONSTRAINT "chk_max_discount_positive" CHECK("__new_coupons"."max_discount_amount" IS NULL OR CAST("__new_coupons"."max_discount_amount" AS REAL) > 0.0),
	CONSTRAINT "chk_percentage_range" CHECK("__new_coupons"."type" != 'percentage' OR (CAST("__new_coupons"."value" AS REAL) >= 1.0 AND CAST("__new_coupons"."value" AS REAL) <= 100.0)),
	CONSTRAINT "chk_max_uses" CHECK("__new_coupons"."max_uses" IS NULL OR "__new_coupons"."max_uses" > 0),
	CONSTRAINT "chk_used_count_range" CHECK("__new_coupons"."max_uses" IS NULL OR "__new_coupons"."used_count" <= "__new_coupons"."max_uses"),
	CONSTRAINT "chk_max_uses_per_customer" CHECK("__new_coupons"."max_uses_per_customer" >= 0),
	CONSTRAINT "chk_coupon_dates" CHECK(
      "__new_coupons"."starts_at" IS NULL OR 
      "__new_coupons"."expires_at" IS NULL OR 
      "__new_coupons"."expires_at" > "__new_coupons"."starts_at"
    ),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_coupons"."deleted_at" IS NULL OR "__new_coupons"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_coupons`("id", "store_id", "code", "description", "type", "value", "min_order_amount", "max_discount_amount", "applicable_categories", "applicable_products", "max_uses", "max_uses_per_customer", "used_count", "starts_at", "expires_at", "is_active", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "store_id", "code", "description", "type", "value", "min_order_amount", "max_discount_amount", "applicable_categories", "applicable_products", "max_uses", "max_uses_per_customer", "used_count", "starts_at", "expires_at", "is_active", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `coupons`;--> statement-breakpoint
DROP TABLE `coupons`;--> statement-breakpoint
ALTER TABLE `__new_coupons` RENAME TO `coupons`;--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_store_unique_idx` ON `coupons` (`store_id`,`code`) WHERE "coupons"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `coupons_store_idx` ON `coupons` (`store_id`);--> statement-breakpoint
CREATE INDEX `coupons_active_idx` ON `coupons` (`store_id`,`is_active`) WHERE "coupons"."is_active" = 1 AND "coupons"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `coupons_deleted_idx` ON `coupons` (`deleted_at`) WHERE "coupons"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_custom_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`domain` text NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verification_token` text,
	`verified_by` text,
	`dns_records` text DEFAULT '[]' NOT NULL,
	`ssl_status` text DEFAULT 'pending' NOT NULL,
	`ssl_certificate_at` integer,
	`ssl_expires_at` integer,
	`ssl_issuer` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`is_subdomain` integer DEFAULT false NOT NULL,
	`is_wildcard` integer DEFAULT false NOT NULL,
	`parent_domain` text,
	`redirect_config` text DEFAULT '{}' NOT NULL,
	`hsts_config` text DEFAULT '{"enabled":true,"maxAge":31536000,"includeSubdomains":false,"preload":false}' NOT NULL,
	`domain_expires_at` integer,
	`auto_renew_enabled` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_domain_not_empty" CHECK(length("__new_custom_domains"."domain") > 0),
	CONSTRAINT "chk_domain_length" CHECK(length("__new_custom_domains"."domain") <= 253),
	CONSTRAINT "chk_domain_format" CHECK(
        "__new_custom_domains"."domain" GLOB '*.*' 
        AND "__new_custom_domains"."domain" NOT GLOB '*..*'
        AND "__new_custom_domains"."domain" NOT GLOB '*[!a-z0-9.-]*'
      ),
	CONSTRAINT "chk_verification_status" CHECK("__new_custom_domains"."verification_status" IN ('pending', 'verified', 'failed')),
	CONSTRAINT "chk_verified_by" CHECK("__new_custom_domains"."verified_by" IS NULL OR "__new_custom_domains"."verified_by" IN ('dns_txt', 'cname', 'http_file', 'manual')),
	CONSTRAINT "chk_ssl_status" CHECK("__new_custom_domains"."ssl_status" IN ('pending', 'active', 'failed', 'expired', 'disabled')),
	CONSTRAINT "chk_ssl_consistency" CHECK(("__new_custom_domains"."ssl_status" != 'active') OR ("__new_custom_domains"."ssl_status" = 'active' AND "__new_custom_domains"."ssl_certificate_at" IS NOT NULL AND "__new_custom_domains"."ssl_expires_at" IS NOT NULL)),
	CONSTRAINT "chk_subdomain_consistency" CHECK(("__new_custom_domains"."is_subdomain" = 0 AND "__new_custom_domains"."parent_domain" IS NULL) OR ("__new_custom_domains"."is_subdomain" = 1 AND "__new_custom_domains"."parent_domain" IS NOT NULL)),
	CONSTRAINT "chk_wildcard_format" CHECK(("__new_custom_domains"."is_wildcard" = 0) OR ("__new_custom_domains"."is_wildcard" = 1 AND "__new_custom_domains"."domain" LIKE '*.%')),
	CONSTRAINT "chk_domain_expires" CHECK("__new_custom_domains"."domain_expires_at" IS NULL OR "__new_custom_domains"."domain_expires_at" > "__new_custom_domains"."created_at"),
	CONSTRAINT "chk_hsts_max_age" CHECK(json_extract("__new_custom_domains"."hsts_config", '$.maxAge') IS NULL OR json_extract("__new_custom_domains"."hsts_config", '$.maxAge') BETWEEN 0 AND 63072000),
	CONSTRAINT "chk_primary_integrity" CHECK(("__new_custom_domains"."is_primary" = 0) OR ("__new_custom_domains"."is_primary" = 1 AND "__new_custom_domains"."verification_status" = 'verified' AND "__new_custom_domains"."is_active" = 1))
);
--> statement-breakpoint
INSERT INTO `__new_custom_domains`("id", "store_id", "domain", "verification_status", "verification_token", "verified_by", "dns_records", "ssl_status", "ssl_certificate_at", "ssl_expires_at", "ssl_issuer", "is_active", "is_primary", "is_subdomain", "is_wildcard", "parent_domain", "redirect_config", "hsts_config", "domain_expires_at", "auto_renew_enabled", "verified_at", "created_at", "updated_at", "deleted_at") SELECT "id", "store_id", "domain", "verification_status", "verification_token", "verified_by", "dns_records", "ssl_status", "ssl_certificate_at", "ssl_expires_at", "ssl_issuer", "is_active", "is_primary", "is_subdomain", "is_wildcard", "parent_domain", "redirect_config", "hsts_config", "domain_expires_at", "auto_renew_enabled", "verified_at", "created_at", "updated_at", "deleted_at" FROM `custom_domains`;--> statement-breakpoint
DROP TABLE `custom_domains`;--> statement-breakpoint
ALTER TABLE `__new_custom_domains` RENAME TO `custom_domains`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_active_domain` ON `custom_domains` (`domain`) WHERE "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_primary_store_domain` ON `custom_domains` (`store_id`) WHERE "custom_domains"."is_primary" = 1 AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_store` ON `custom_domains` (`store_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_domains_verification_status` ON `custom_domains` (`verification_status`) WHERE "custom_domains"."verification_status" != 'verified' AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_active` ON `custom_domains` (`is_active`) WHERE "custom_domains"."is_active" = 1 AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_ssl_status` ON `custom_domains` (`ssl_status`) WHERE "custom_domains"."ssl_status" != 'active' AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_parent` ON `custom_domains` (`parent_domain`) WHERE "custom_domains"."parent_domain" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_expires` ON `custom_domains` (`domain_expires_at`) WHERE "custom_domains"."domain_expires_at" IS NOT NULL AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_routing_lookup` ON `custom_domains` (`domain`,`is_active`) WHERE "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `custom_domains_deleted_idx` ON `custom_domains` (`deleted_at`) WHERE "custom_domains"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "chk_idempotency_key_not_empty" CHECK(length("__new_idempotency"."key") > 0),
	CONSTRAINT "chk_idempotency_expiry_valid" CHECK("__new_idempotency"."expires_at" >= "__new_idempotency"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_idempotency`("key", "status", "result", "created_at", "expires_at", "completed_at") SELECT "key", "status", "result", "created_at", "expires_at", "completed_at" FROM `idempotency`;--> statement-breakpoint
DROP TABLE `idempotency`;--> statement-breakpoint
ALTER TABLE `__new_idempotency` RENAME TO `idempotency`;--> statement-breakpoint
CREATE INDEX `idempotency_expires_at_idx` ON `idempotency` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idempotency_status_expires_idx` ON `idempotency` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_product_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`views_count` integer DEFAULT 0 NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`reviews_count` integer DEFAULT 0 NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_rating_range" CHECK("__new_product_stats"."rating" >= 0 AND "__new_product_stats"."rating" <= 500),
	CONSTRAINT "chk_stats_counts_non_negative" CHECK("__new_product_stats"."views_count" >= 0 AND "__new_product_stats"."sales_count" >= 0 AND "__new_product_stats"."reviews_count" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_product_stats`("id", "product_id", "views_count", "sales_count", "reviews_count", "rating", "updated_at") SELECT "id", "product_id", "views_count", "sales_count", "reviews_count", "rating", "updated_at" FROM `product_stats`;--> statement-breakpoint
DROP TABLE `product_stats`;--> statement-breakpoint
ALTER TABLE `__new_product_stats` RENAME TO `product_stats`;--> statement-breakpoint
CREATE UNIQUE INDEX `product_stats_product_idx` ON `product_stats` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_stats_sales_idx` ON `product_stats` (`sales_count`);--> statement-breakpoint
CREATE INDEX `product_stats_views_idx` ON `product_stats` (`views_count`);