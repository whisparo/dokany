CREATE TABLE `addresses` (
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
	`latitude` text,
	`longitude` text,
	`notes` text,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_recipient_name_not_empty" CHECK("addresses"."recipient_name" != ''),
	CONSTRAINT "chk_recipient_phone_not_empty" CHECK("addresses"."recipient_phone" != ''),
	CONSTRAINT "chk_city_not_empty" CHECK("addresses"."city" != ''),
	CONSTRAINT "chk_street_not_empty" CHECK("addresses"."street" != ''),
	CONSTRAINT "chk_label_not_empty" CHECK("addresses"."label" != ''),
	CONSTRAINT "chk_country_code" CHECK("addresses"."country" GLOB '[A-Z][A-Z]'),
	CONSTRAINT "chk_phone_format" CHECK(("addresses"."recipient_phone" GLOB '[+0-9]*') AND (length("addresses"."recipient_phone") BETWEEN 7 AND 20)),
	CONSTRAINT "chk_lat_range" CHECK("addresses"."latitude" IS NULL OR (CAST("addresses"."latitude" AS REAL) BETWEEN -90.0 AND 90.0)),
	CONSTRAINT "chk_lon_range" CHECK("addresses"."longitude" IS NULL OR (CAST("addresses"."longitude" AS REAL) BETWEEN -180.0 AND 180.0)),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("addresses"."deleted_at" IS NULL OR "addresses"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_default_not_deleted" CHECK(NOT ("addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `addresses_default_unique_idx` ON `addresses` (`customer_id`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_customer_idx` ON `addresses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `addresses_customer_default_idx` ON `addresses` (`customer_id`,`is_default`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_country_city_idx` ON `addresses` (`country`,`city`);--> statement-breakpoint
CREATE INDEX `addresses_deleted_idx` ON `addresses` (`deleted_at`) WHERE "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_postal_code_idx` ON `addresses` (`postal_code`);--> statement-breakpoint
CREATE INDEX `addresses_phone_idx` ON `addresses` (`recipient_phone`);--> statement-breakpoint
CREATE INDEX `addresses_customer_label_idx` ON `addresses` (`customer_id`,`label`) WHERE "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `audit_logs_default` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	CONSTRAINT "audit_logs_default_chk_entity_type_not_empty" CHECK(length("audit_logs_default"."entity_type") > 0),
	CONSTRAINT "audit_logs_default_chk_entity_id_not_empty" CHECK(length("audit_logs_default"."entity_id") > 0),
	CONSTRAINT "audit_logs_default_chk_error_message" CHECK(("audit_logs_default"."success" = 1 AND "audit_logs_default"."error_message" IS NULL) OR ("audit_logs_default"."success" = 0 AND "audit_logs_default"."error_message" IS NOT NULL)),
	CONSTRAINT "audit_logs_default_chk_user_or_store" CHECK("audit_logs_default"."user_id" IS NOT NULL OR "audit_logs_default"."store_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_default_user_idx` ON `audit_logs_default` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_store_idx` ON `audit_logs_default` (`store_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_entity_idx` ON `audit_logs_default` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_action_idx` ON `audit_logs_default` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_created_idx` ON `audit_logs_default` ("created_at" DESC);--> statement-breakpoint
CREATE INDEX `audit_logs_default_store_created_idx` ON `audit_logs_default` (`store_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `audit_logs_default_request_id_idx` ON `audit_logs_default` (`request_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_default_success_idx` ON `audit_logs_default` (`success`) WHERE "audit_logs_default"."success" = 0;--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_expires_at` integer,
	`scope` text,
	`id_token` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`token_family` text NOT NULL,
	`device_fingerprint` text,
	`refresh_expires_at` integer NOT NULL,
	`is_revoked` integer DEFAULT false NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_session_revoke_reason" CHECK("session"."revoked_reason" IN ('user_logout', 'security_breach', 'admin_revoke', 'expired', 'token_rotation')),
	CONSTRAINT "chk_revoked_consistency" CHECK(("session"."is_revoked" = 0 OR "session"."revoked_at" IS NOT NULL)),
	CONSTRAINT "chk_refresh_expires_gt_expires" CHECK("session"."refresh_expires_at" > "session"."expires_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_token_family_idx` ON `session` (`token_family`);--> statement-breakpoint
CREATE INDEX `session_user_token_family_idx` ON `session` (`user_id`,`token_family`);--> statement-breakpoint
CREATE INDEX `session_expires_at_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_identifier_value_unique` ON `verification` (`identifier`,`value`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`customer_id` text,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant` text DEFAULT '{}',
	`variant_sku` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_at_add` text NOT NULL,
	`source` text DEFAULT 'web',
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_cart_qty_positive" CHECK("cart_items"."quantity" > 0),
	CONSTRAINT "chk_cart_qty_limit" CHECK("cart_items"."quantity" <= 999),
	CONSTRAINT "chk_cart_price_positive" CHECK(CAST("cart_items"."price_at_add" AS REAL) >= 0),
	CONSTRAINT "chk_cart_owner_exists" CHECK(
        ("cart_items"."session_id" IS NOT NULL OR "cart_items"."customer_id" IS NOT NULL) 
        AND NOT ("cart_items"."session_id" IS NOT NULL AND "cart_items"."customer_id" IS NOT NULL)
      ),
	CONSTRAINT "chk_variant_sku_not_empty" CHECK("cart_items"."variant_sku" != '')
);
--> statement-breakpoint
CREATE INDEX `cart_session_idx` ON `cart_items` (`session_id`) WHERE "cart_items"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_customer_idx` ON `cart_items` (`customer_id`) WHERE "cart_items"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cart_store_idx` ON `cart_items` (`store_id`);--> statement-breakpoint
CREATE INDEX `cart_product_idx` ON `cart_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `cart_stale_idx` ON `cart_items` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cart_customer_unique_idx` ON `cart_items` (`customer_id`,`product_id`,`variant_sku`) WHERE "cart_items"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cart_session_unique_idx` ON `cart_items` (`session_id`,`product_id`,`variant_sku`) WHERE "cart_items"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `categories` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_cat_name_not_empty" CHECK(length("categories"."name") > 0),
	CONSTRAINT "chk_cat_slug_not_empty" CHECK(length("categories"."slug") > 0),
	CONSTRAINT "chk_parent_not_self" CHECK("categories"."parent_id" IS NULL OR "categories"."parent_id" != "categories"."id"),
	CONSTRAINT "chk_level_range" CHECK("categories"."level" >= 0 AND "categories"."level" <= 10),
	CONSTRAINT "chk_products_count_positive" CHECK("categories"."products_count" >= 0),
	CONSTRAINT "chk_slug_format" CHECK("categories"."slug" NOT LIKE '% %'),
	CONSTRAINT "chk_path_format" CHECK("categories"."path" IS NULL OR "categories"."path" GLOB '/*'),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("categories"."deleted_at" IS NULL OR "categories"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`store_id`,`slug`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_store_parent_idx` ON `categories` (`store_id`,`parent_id`) WHERE "categories"."parent_id" IS NOT NULL AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_path_idx` ON `categories` (`path`) WHERE "categories"."path" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_level_idx` ON `categories` (`store_id`,`level`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_deleted_idx` ON `categories` (`deleted_at`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_active_idx` ON `categories` (`store_id`,`is_active`) WHERE "categories"."is_active" = 1 AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_store_parent_order_idx` ON `categories` (`store_id`,`parent_id`,`order`) WHERE "categories"."is_active" = 1 AND "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `categories_name_idx` ON `categories` (`store_id`,"name" COLLATE NOCASE) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`store_id` text,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`visitor_fingerprint` text,
	`state` text DEFAULT '{}' NOT NULL,
	`timestamps` text DEFAULT '{}' NOT NULL,
	`last_activity_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_platform" CHECK("chat_sessions"."platform" IN ('telegram', 'web', 'whatsapp', 'messenger')),
	CONSTRAINT "chk_platform_length" CHECK(length("chat_sessions"."platform") BETWEEN 1 AND 50),
	CONSTRAINT "chk_external_id_not_empty" CHECK(length("chat_sessions"."external_id") > 0),
	CONSTRAINT "chk_external_id_length" CHECK(length("chat_sessions"."external_id") <= 255),
	CONSTRAINT "chk_session_routing_integrity" CHECK(("chat_sessions"."platform" = 'web' AND "chat_sessions"."store_id" IS NOT NULL) OR ("chat_sessions"."platform" IN ('telegram', 'whatsapp', 'messenger') AND length("chat_sessions"."external_id") > 0)),
	CONSTRAINT "chk_state_step" CHECK(
        json_extract("chat_sessions"."state", '$.step') IS NULL 
        OR json_extract("chat_sessions"."state", '$.step') IN ('phone','name','store','niche','completed','expired')
      ),
	CONSTRAINT "chk_timestamps_object" CHECK(json_valid("chat_sessions"."timestamps") = 1 AND json_type("chat_sessions"."timestamps") = 'object'),
	CONSTRAINT "chk_visitor_fingerprint" CHECK(
        "chat_sessions"."visitor_fingerprint" IS NULL 
        OR (
          length("chat_sessions"."visitor_fingerprint") = 64 
          AND "chat_sessions"."visitor_fingerprint" GLOB '[a-fA-F0-9]*'
          AND "chat_sessions"."visitor_fingerprint" NOT GLOB '*[^a-fA-F0-9]*'
        )
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_platform_external_unique` ON `chat_sessions` (`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `chat_sessions_last_activity_idx` ON `chat_sessions` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `chat_sessions_created_idx` ON `chat_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_sessions_deleted_idx` ON `chat_sessions` (`deleted_at`) WHERE "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_user_idx` ON `chat_sessions` (`user_id`) WHERE "chat_sessions"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_store_idx` ON `chat_sessions` (`store_id`) WHERE "chat_sessions"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_platform_idx` ON `chat_sessions` (`platform`);--> statement-breakpoint
CREATE INDEX `chat_sessions_visitor_idx` ON `chat_sessions` (`visitor_fingerprint`) WHERE "chat_sessions"."visitor_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_store_platform_idx` ON `chat_sessions` (`store_id`,`platform`) WHERE "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_user_platform_idx` ON `chat_sessions` (`user_id`,`platform`) WHERE "chat_sessions"."user_id" IS NOT NULL AND "chat_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `coupons` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_coupon_type" CHECK("coupons"."type" IN ('percentage', 'fixed')),
	CONSTRAINT "chk_code_format" CHECK(length("coupons"."code") > 0 AND "coupons"."code" GLOB '[A-Z0-9_-]*'),
	CONSTRAINT "chk_value_positive" CHECK(CAST("coupons"."value" AS REAL) > 0.0),
	CONSTRAINT "chk_min_order_positive" CHECK(CAST("coupons"."min_order_amount" AS REAL) >= 0.0),
	CONSTRAINT "chk_max_discount_positive" CHECK("coupons"."max_discount_amount" IS NULL OR CAST("coupons"."max_discount_amount" AS REAL) > 0.0),
	CONSTRAINT "chk_percentage_range" CHECK("coupons"."type" != 'percentage' OR (CAST("coupons"."value" AS REAL) >= 1.0 AND CAST("coupons"."value" AS REAL) <= 100.0)),
	CONSTRAINT "chk_max_uses" CHECK("coupons"."max_uses" IS NULL OR "coupons"."max_uses" > 0),
	CONSTRAINT "chk_used_count_range" CHECK("coupons"."max_uses" IS NULL OR "coupons"."used_count" <= "coupons"."max_uses"),
	CONSTRAINT "chk_max_uses_per_customer" CHECK("coupons"."max_uses_per_customer" >= 0),
	CONSTRAINT "chk_coupon_dates" CHECK(
      "coupons"."starts_at" IS NULL OR 
      "coupons"."expires_at" IS NULL OR 
      "coupons"."expires_at" > "coupons"."starts_at"
    ),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("coupons"."deleted_at" IS NULL OR "coupons"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_store_unique_idx` ON `coupons` (`store_id`,`code`) WHERE "coupons"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `coupons_store_idx` ON `coupons` (`store_id`);--> statement-breakpoint
CREATE INDEX `coupons_active_idx` ON `coupons` (`store_id`,`is_active`) WHERE "coupons"."is_active" = 1 AND "coupons"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `coupons_deleted_idx` ON `coupons` (`deleted_at`) WHERE "coupons"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `custom_domains` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_domain_not_empty" CHECK(length("custom_domains"."domain") > 0),
	CONSTRAINT "chk_domain_length" CHECK(length("custom_domains"."domain") <= 253),
	CONSTRAINT "chk_domain_format" CHECK(
        "custom_domains"."domain" GLOB '*.*' 
        AND "custom_domains"."domain" NOT GLOB '*..*'
        AND "custom_domains"."domain" NOT GLOB '*[!a-z0-9.-]*'
      ),
	CONSTRAINT "chk_verification_status" CHECK("custom_domains"."verification_status" IN ('pending', 'verified', 'failed')),
	CONSTRAINT "chk_verified_by" CHECK("custom_domains"."verified_by" IS NULL OR "custom_domains"."verified_by" IN ('dns_txt', 'cname', 'http_file', 'manual')),
	CONSTRAINT "chk_ssl_status" CHECK("custom_domains"."ssl_status" IN ('pending', 'active', 'failed', 'expired', 'disabled')),
	CONSTRAINT "chk_ssl_consistency" CHECK(("custom_domains"."ssl_status" != 'active') OR ("custom_domains"."ssl_status" = 'active' AND "custom_domains"."ssl_certificate_at" IS NOT NULL AND "custom_domains"."ssl_expires_at" IS NOT NULL)),
	CONSTRAINT "chk_subdomain_consistency" CHECK(("custom_domains"."is_subdomain" = 0 AND "custom_domains"."parent_domain" IS NULL) OR ("custom_domains"."is_subdomain" = 1 AND "custom_domains"."parent_domain" IS NOT NULL)),
	CONSTRAINT "chk_wildcard_format" CHECK(("custom_domains"."is_wildcard" = 0) OR ("custom_domains"."is_wildcard" = 1 AND "custom_domains"."domain" LIKE '*.%')),
	CONSTRAINT "chk_domain_expires" CHECK("custom_domains"."domain_expires_at" IS NULL OR "custom_domains"."domain_expires_at" > "custom_domains"."created_at"),
	CONSTRAINT "chk_hsts_max_age" CHECK(json_extract("custom_domains"."hsts_config", '$.maxAge') IS NULL OR json_extract("custom_domains"."hsts_config", '$.maxAge') BETWEEN 0 AND 63072000),
	CONSTRAINT "chk_primary_integrity" CHECK(("custom_domains"."is_primary" = 0) OR ("custom_domains"."is_primary" = 1 AND "custom_domains"."verification_status" = 'verified' AND "custom_domains"."is_active" = 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_active_domain` ON `custom_domains` (`domain`) WHERE "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_primary_store_domain` ON `custom_domains` (`store_id`) WHERE "custom_domains"."is_primary" = 1 AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_store` ON `custom_domains` (`store_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_domains_verification_status` ON `custom_domains` (`verification_status`) WHERE "custom_domains"."verification_status" != 'verified' AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_active` ON `custom_domains` (`is_active`) WHERE "custom_domains"."is_active" = 1 AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_ssl_status` ON `custom_domains` (`ssl_status`) WHERE "custom_domains"."ssl_status" != 'active' AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_parent` ON `custom_domains` (`parent_domain`) WHERE "custom_domains"."parent_domain" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_expires` ON `custom_domains` (`domain_expires_at`) WHERE "custom_domains"."domain_expires_at" IS NOT NULL AND "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_custom_domains_routing_lookup` ON `custom_domains` (`domain`,`is_active`) WHERE "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `customer_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`total_spent` text DEFAULT '0' NOT NULL,
	`orders_count` integer DEFAULT 0 NOT NULL,
	`last_order_at` integer,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_non_negative" CHECK(
      CAST(coalesce("customer_stats"."total_spent", '0') AS REAL) >= 0.0 
      AND "customer_stats"."orders_count" >= 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_stats_customer_idx` ON `customer_stats` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_stats_total_spent_idx` ON `customer_stats` (`total_spent`);--> statement-breakpoint
CREATE INDEX `customer_stats_orders_idx` ON `customer_stats` (`orders_count`);--> statement-breakpoint
CREATE INDEX `customer_stats_dashboard_idx` ON `customer_stats` (`customer_id`,`orders_count`,`total_spent`);--> statement-breakpoint
CREATE TABLE `customer_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`loyalty_points` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_wallet_non_negative" CHECK(CAST(coalesce("customer_wallets"."balance", '0') AS REAL) >= 0.0),
	CONSTRAINT "chk_loyalty_non_negative" CHECK("customer_wallets"."loyalty_points" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_wallets_customer_idx` ON `customer_wallets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_wallets_balance_idx` ON `customer_wallets` (`balance`);--> statement-breakpoint
CREATE INDEX `customer_wallets_loyalty_idx` ON `customer_wallets` (`loyalty_points`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`deleted_by` text,
	`phone` text NOT NULL,
	`email` text,
	`name` text,
	`telegram_chat_id` text,
	`preferences` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_phone_format" CHECK("customers"."phone" GLOB '+[1-9][0-9][0-9][0-9][0-9][0-9][0-9]*'),
	CONSTRAINT "chk_email_format" CHECK("customers"."email" IS NULL OR "customers"."email" LIKE '%_@_%._%'),
	CONSTRAINT "chk_customer_name_not_empty" CHECK("customers"."name" IS NULL OR "customers"."name" != ''),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("customers"."deleted_at" IS NULL OR "customers"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_preferences_currency" CHECK(
      json_extract("customers"."preferences", '$.currency') IS NULL 
      OR json_extract("customers"."preferences", '$.currency') GLOB '[A-Z][A-Z][A-Z]'
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` ("email" COLLATE NOCASE) WHERE "customers"."email" IS NOT NULL AND "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_telegram_unique` ON `customers` (`telegram_chat_id`) WHERE "customers"."telegram_chat_id" IS NOT NULL AND "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `customers_user_id_idx` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX `customers_deleted_by_idx` ON `customers` (`deleted_by`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_created_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE INDEX `customers_deleted_idx` ON `customers` (`deleted_at`) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` ("email" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `group_buys` (
	`id` text PRIMARY KEY NOT NULL,
	`group_code` text NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`leader_id` text,
	`original_price` text NOT NULL,
	`group_price` text NOT NULL,
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
	CONSTRAINT "chk_group_buy_status" CHECK("group_buys"."status" IN ('active', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "chk_group_code_format" CHECK(length("group_buys"."group_code") > 0),
	CONSTRAINT "chk_group_prices" CHECK(CAST("group_buys"."group_price" AS REAL) < CAST("group_buys"."original_price" AS REAL)),
	CONSTRAINT "chk_group_price_positive" CHECK(CAST("group_buys"."group_price" AS REAL) > 0.0),
	CONSTRAINT "chk_original_price_positive" CHECK(CAST("group_buys"."original_price" AS REAL) > 0.0),
	CONSTRAINT "chk_discount_range" CHECK("group_buys"."discount_percentage" > 0 AND "group_buys"."discount_percentage" <= 100),
	CONSTRAINT "chk_required_participants" CHECK("group_buys"."required_participants" >= 2),
	CONSTRAINT "chk_current_participants_positive" CHECK("group_buys"."current_participants" >= 0),
	CONSTRAINT "chk_current_participants_upper" CHECK("group_buys"."current_participants" <= COALESCE("group_buys"."max_participants", "group_buys"."required_participants")),
	CONSTRAINT "chk_max_participants" CHECK("group_buys"."max_participants" IS NULL OR "group_buys"."max_participants" >= "group_buys"."required_participants"),
	CONSTRAINT "chk_group_buy_expires_after_created" CHECK("group_buys"."expires_at" > CAST(strftime('%s', 'now') * 1000 AS INTEGER)),
	CONSTRAINT "chk_completed_at_consistency" CHECK(("group_buys"."status" != 'completed' OR "group_buys"."completed_at" IS NOT NULL)),
	CONSTRAINT "chk_group_buy_deleted_consistency" CHECK(("group_buys"."deleted_at" IS NULL OR "group_buys"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_buys_code_unique_idx` ON `group_buys` (`group_code`) WHERE "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `group_buys_store_idx` ON `group_buys` (`store_id`);--> statement-breakpoint
CREATE INDEX `group_buys_product_idx` ON `group_buys` (`product_id`);--> statement-breakpoint
CREATE INDEX `group_buys_expires_idx` ON `group_buys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `group_buys_leader_idx` ON `group_buys` (`leader_id`);--> statement-breakpoint
CREATE INDEX `group_buys_active_status_idx` ON `group_buys` (`store_id`,`status`) WHERE "group_buys"."status" IN ('active', 'processing') AND "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `group_buys_deleted_idx` ON `group_buys` (`deleted_at`) WHERE "group_buys"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `group_buys_active_product_unique_idx` ON `group_buys` (`store_id`,`product_id`) WHERE "group_buys"."status" IN ('active', 'processing') AND "group_buys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `haggle_sessions` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_haggle_status" CHECK("haggle_sessions"."status" IN ('active', 'counter_offered', 'accepted', 'rejected', 'expired', 'cancelled')),
	CONSTRAINT "chk_haggle_strategy" CHECK("haggle_sessions"."strategy_used" IS NULL OR "haggle_sessions"."strategy_used" IN ('aggressive', 'friendly', 'middle_ground')),
	CONSTRAINT "chk_session_code_format" CHECK(length("haggle_sessions"."session_code") > 0),
	CONSTRAINT "chk_min_price" CHECK(CAST("haggle_sessions"."min_allowed_price" AS REAL) > 0.0),
	CONSTRAINT "chk_original_price" CHECK(CAST("haggle_sessions"."original_price" AS REAL) >= CAST("haggle_sessions"."min_allowed_price" AS REAL)),
	CONSTRAINT "chk_discount" CHECK(CAST("haggle_sessions"."discount_amount" AS REAL) >= 0.0),
	CONSTRAINT "chk_discount_limit" CHECK(CAST("haggle_sessions"."discount_amount" AS REAL) <= (CAST("haggle_sessions"."original_price" AS REAL) - CAST("haggle_sessions"."min_allowed_price" AS REAL))),
	CONSTRAINT "chk_final_price_upper" CHECK("haggle_sessions"."final_price" IS NULL OR CAST("haggle_sessions"."final_price" AS REAL) <= CAST("haggle_sessions"."original_price" AS REAL)),
	CONSTRAINT "chk_final_price_lower" CHECK("haggle_sessions"."final_price" IS NULL OR CAST("haggle_sessions"."final_price" AS REAL) >= CAST("haggle_sessions"."min_allowed_price" AS REAL)),
	CONSTRAINT "chk_rounds" CHECK("haggle_sessions"."rounds_count" <= "haggle_sessions"."max_rounds" AND "haggle_sessions"."rounds_count" >= 0),
	CONSTRAINT "chk_max_rounds" CHECK("haggle_sessions"."max_rounds" > 0),
	CONSTRAINT "chk_expires_after_created" CHECK("haggle_sessions"."expires_at" > CAST(strftime('%s', 'now') * 1000 AS INTEGER)),
	CONSTRAINT "chk_strategy_required" CHECK(("haggle_sessions"."status" NOT IN ('accepted', 'rejected') OR "haggle_sessions"."strategy_used" IS NOT NULL)),
	CONSTRAINT "chk_haggle_deleted_consistency" CHECK(("haggle_sessions"."deleted_at" IS NULL OR "haggle_sessions"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `haggle_code_unique_idx` ON `haggle_sessions` (`session_code`) WHERE "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `haggle_store_idx` ON `haggle_sessions` (`store_id`);--> statement-breakpoint
CREATE INDEX `haggle_product_idx` ON `haggle_sessions` (`product_id`);--> statement-breakpoint
CREATE INDEX `haggle_customer_idx` ON `haggle_sessions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `haggle_order_idx` ON `haggle_sessions` (`order_id`);--> statement-breakpoint
CREATE INDEX `haggle_expires_idx` ON `haggle_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `haggle_active_status_idx` ON `haggle_sessions` (`store_id`,`status`) WHERE "haggle_sessions"."status" = 'active' AND "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `haggle_deleted_idx` ON `haggle_sessions` (`deleted_at`) WHERE "haggle_sessions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `haggle_active_unique_idx` ON `haggle_sessions` (`customer_id`,`product_id`) WHERE "haggle_sessions"."status" IN ('active', 'counter_offered') AND "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `media` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_media_type" CHECK("media"."type" IN ('image', 'video', 'document', 'audio', 'archive')),
	CONSTRAINT "chk_type_length" CHECK(length("media"."type") BETWEEN 1 AND 20),
	CONSTRAINT "chk_filename_length" CHECK(length("media"."filename") BETWEEN 1 AND 255),
	CONSTRAINT "chk_url_length" CHECK(length("media"."url") BETWEEN 1 AND 2048),
	CONSTRAINT "chk_mime_type_length" CHECK(length("media"."mime_type") BETWEEN 1 AND 100),
	CONSTRAINT "chk_mime_type_format" CHECK("media"."mime_type" GLOB '*/*' AND "media"."mime_type" NOT GLOB '*[^a-zA-Z0-9/+.-]*'),
	CONSTRAINT "chk_size_non_negative" CHECK("media"."size" >= 0),
	CONSTRAINT "chk_order_non_negative" CHECK("media"."order" >= 0),
	CONSTRAINT "chk_view_count_non_negative" CHECK("media"."view_count" >= 0),
	CONSTRAINT "chk_download_count_non_negative" CHECK("media"."download_count" >= 0),
	CONSTRAINT "chk_metadata_valid" CHECK(json_valid("media"."metadata") = 1 AND json_type("media"."metadata") = 'object')
);
--> statement-breakpoint
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
CREATE INDEX `media_deleted_idx` ON `media` (`deleted_at`) WHERE "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `media_primary_idx` ON `media` (`product_id`) WHERE "media"."is_primary" = 1 AND "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `order_items` (
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
	`price` text NOT NULL,
	`line_total` text NOT NULL,
	`original_price` text NOT NULL,
	`haggle_discount` text DEFAULT '0' NOT NULL,
	`discount` text DEFAULT '0' NOT NULL,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`tax_rate` integer DEFAULT 0 NOT NULL,
	`tax_percentage` text DEFAULT '0' NOT NULL,
	`shipping_cost` text DEFAULT '0' NOT NULL,
	`shipping_method` text,
	`commission_rate` integer DEFAULT 0 NOT NULL,
	`commission_amount` text DEFAULT '0' NOT NULL,
	`net_amount` text NOT NULL,
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
	`refund_amount` text DEFAULT '0' NOT NULL,
	`warehouse_location` text,
	`batch_number` text,
	`expiry_date` integer,
	`notes` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_item_status" CHECK("order_items"."status" IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
	CONSTRAINT "chk_fulfillment_status" CHECK("order_items"."fulfillment_status" IN ('unfulfilled', 'partial', 'fulfilled')),
	CONSTRAINT "chk_return_status" CHECK("order_items"."return_status" IS NULL OR "order_items"."return_status" IN ('requested', 'approved', 'rejected', 'processed', 'refunded')),
	CONSTRAINT "chk_qty_positive" CHECK("order_items"."ordered_qty" > 0),
	CONSTRAINT "chk_cancelled_positive" CHECK("order_items"."cancelled_qty" >= 0),
	CONSTRAINT "chk_shipped_positive" CHECK("order_items"."shipped_qty" >= 0),
	CONSTRAINT "chk_returned_positive" CHECK("order_items"."returned_qty" >= 0),
	CONSTRAINT "chk_qty_integrity" CHECK("order_items"."cancelled_qty" + "order_items"."shipped_qty" <= "order_items"."ordered_qty"),
	CONSTRAINT "chk_return_limit" CHECK("order_items"."returned_qty" <= "order_items"."shipped_qty"),
	CONSTRAINT "chk_tax_rate_range" CHECK("order_items"."tax_rate" >= 0 AND "order_items"."tax_rate" <= 100),
	CONSTRAINT "chk_commission_rate_range" CHECK("order_items"."commission_rate" >= 0 AND "order_items"."commission_rate" <= 100),
	CONSTRAINT "chk_sku_not_empty" CHECK("order_items"."product_sku" != ''),
	CONSTRAINT "chk_variant_sku_not_empty" CHECK("order_items"."variant_sku" != ''),
	CONSTRAINT "chk_product_name_not_empty" CHECK("order_items"."product_name" != '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_variant_unique` ON `order_items` (`order_id`,`product_id`,`variant_sku`);--> statement-breakpoint
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
CREATE TABLE `orders` (
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
	`subtotal` text DEFAULT '0' NOT NULL,
	`shipping_cost` text DEFAULT '0' NOT NULL,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`discount` text DEFAULT '0' NOT NULL,
	`total` text NOT NULL,
	`coupon_code` text,
	`coupon_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_method` text,
	`customer_notes` text,
	`admin_notes` text,
	`internal_notes` text,
	`haggle_session_id` text,
	`original_total` text,
	`haggle_discount` text DEFAULT '0' NOT NULL,
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
	`refund_amount` text,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`haggle_session_id`) REFERENCES `haggle_sessions`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`group_buy_id`) REFERENCES `group_buys`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_order_status" CHECK("orders"."status" IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
	CONSTRAINT "chk_payment_status" CHECK("orders"."payment_status" IN ('pending', 'paid', 'failed', 'refunded', 'under_review')),
	CONSTRAINT "chk_payment_method" CHECK("orders"."payment_method" IS NULL OR "orders"."payment_method" IN ('cod', 'credit_card', 'wallet', 'bank_transfer', 'installments')),
	CONSTRAINT "chk_shipping_method" CHECK("orders"."shipping_method" IN ('standard', 'express', 'same-day', 'pickup')),
	CONSTRAINT "chk_order_currency" CHECK("orders"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "chk_total_non_negative" CHECK(CAST("orders"."total" AS REAL) >= 0.0),
	CONSTRAINT "chk_subtotal_non_negative" CHECK(CAST("orders"."subtotal" AS REAL) >= 0.0),
	CONSTRAINT "chk_shipping_non_negative" CHECK(CAST("orders"."shipping_cost" AS REAL) >= 0.0),
	CONSTRAINT "chk_tax_non_negative" CHECK(CAST("orders"."tax_amount" AS REAL) >= 0.0),
	CONSTRAINT "chk_discount_non_negative" CHECK(CAST("orders"."discount" AS REAL) >= 0.0),
	CONSTRAINT "chk_haggle_discount_non_negative" CHECK(CAST("orders"."haggle_discount" AS REAL) >= 0.0),
	CONSTRAINT "chk_order_total_calculation" CHECK(
      CAST("orders"."total" AS REAL) = (
        CAST("orders"."subtotal" AS REAL) + 
        CAST("orders"."shipping_cost" AS REAL) + 
        CAST("orders"."tax_amount" AS REAL) - 
        CAST("orders"."discount" AS REAL)
      )
    ),
	CONSTRAINT "chk_recipient_phone" CHECK(json_extract("orders"."shipping_address", '$.recipientPhone') IS NOT NULL AND json_extract("orders"."shipping_address", '$.recipientPhone') != ''),
	CONSTRAINT "chk_recipient_name" CHECK(json_extract("orders"."shipping_address", '$.recipientName') IS NOT NULL AND json_extract("orders"."shipping_address", '$.recipientName') != ''),
	CONSTRAINT "chk_country" CHECK(json_extract("orders"."shipping_address", '$.country') IS NOT NULL AND json_extract("orders"."shipping_address", '$.country') != ''),
	CONSTRAINT "chk_payment_method_required" CHECK(("orders"."payment_method" IS NOT NULL) OR ("orders"."payment_status" = 'pending')),
	CONSTRAINT "chk_payment_review" CHECK(NOT ("orders"."status" IN ('processing', 'shipped', 'delivered') AND "orders"."payment_status" = 'under_review')),
	CONSTRAINT "chk_discount_legit" CHECK(CAST("orders"."discount" AS REAL) <= CAST("orders"."subtotal" AS REAL)),
	CONSTRAINT "chk_haggle_legit" CHECK(("orders"."haggle_session_id" IS NULL) OR (CAST("orders"."haggle_discount" AS REAL) <= COALESCE(CAST("orders"."original_total" AS REAL), 0.0))),
	CONSTRAINT "chk_no_delete_shipped" CHECK(("orders"."deleted_at" IS NULL) OR ("orders"."status" NOT IN ('shipped', 'delivered'))),
	CONSTRAINT "chk_coupon_consistency" CHECK(("orders"."coupon_id" IS NULL) OR ("orders"."coupon_code" IS NOT NULL)),
	CONSTRAINT "chk_confirmed_after_created" CHECK(("orders"."confirmed_at" IS NULL OR "orders"."confirmed_at" >= "orders"."created_at")),
	CONSTRAINT "chk_shipped_after_confirmed" CHECK(("orders"."shipped_at" IS NULL OR ("orders"."confirmed_at" IS NOT NULL AND "orders"."shipped_at" >= "orders"."confirmed_at"))),
	CONSTRAINT "chk_delivered_after_shipped" CHECK(("orders"."delivered_at" IS NULL OR ("orders"."shipped_at" IS NOT NULL AND "orders"."delivered_at" >= "orders"."shipped_at"))),
	CONSTRAINT "chk_cancelled_after_created" CHECK(("orders"."cancelled_at" IS NULL OR "orders"."cancelled_at" >= "orders"."created_at")),
	CONSTRAINT "chk_status_confirmed" CHECK(("orders"."status" != 'confirmed' OR "orders"."confirmed_at" IS NOT NULL)),
	CONSTRAINT "chk_status_shipped" CHECK(("orders"."status" != 'shipped' OR "orders"."shipped_at" IS NOT NULL)),
	CONSTRAINT "chk_status_delivered" CHECK(("orders"."status" != 'delivered' OR "orders"."delivered_at" IS NOT NULL)),
	CONSTRAINT "chk_status_cancelled" CHECK(("orders"."status" != 'cancelled' OR "orders"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "chk_refund_amount_positive" CHECK(("orders"."refund_amount" IS NULL OR CAST("orders"."refund_amount" AS REAL) > 0.0)),
	CONSTRAINT "chk_refund_amount_max" CHECK(("orders"."refund_amount" IS NULL OR CAST("orders"."refund_amount" AS REAL) <= CAST("orders"."total" AS REAL))),
	CONSTRAINT "chk_refund_consistency" CHECK(("orders"."refunded_at" IS NULL OR "orders"."refund_amount" IS NOT NULL)),
	CONSTRAINT "chk_original_total_exists" CHECK(("orders"."haggle_session_id" IS NULL) OR ("orders"."original_total" IS NOT NULL)),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("orders"."deleted_at" IS NULL OR "orders"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
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
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`store_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`fee_percentage` integer DEFAULT 0 NOT NULL,
	`net_amount` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text,
	`provider_transaction_id` text,
	`gateway_name` text,
	`gateway_version` text,
	`gateway_environment` text DEFAULT 'production',
	`provider_response_code` text,
	`provider_response_message` text,
	`provider_raw_response` text,
	`webhook_payload` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`billing_address` text,
	`customer_email` text,
	`customer_phone` text,
	`customer_name` text,
	`ip_address` text,
	`user_agent` text,
	`device_fingerprint` text,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`last_attempt_at` integer,
	`failure_reason` text,
	`failure_code` text,
	`paid_at` integer,
	`expires_at` integer,
	`refund_amount` integer DEFAULT 0 NOT NULL,
	`total_refunded` integer DEFAULT 0 NOT NULL,
	`refund_count` integer DEFAULT 0 NOT NULL,
	`refunded_at` integer,
	`last_refund_at` integer,
	`refund_reason` text,
	`reconciliation_status` text DEFAULT 'pending',
	`reconciled_at` integer,
	`reconciled_by` text,
	`dispute_status` text,
	`dispute_reason` text,
	`dispute_opened_at` integer,
	`dispute_resolved_at` integer,
	`dispute_outcome` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_amount_positive" CHECK("payments"."amount" > 0),
	CONSTRAINT "chk_net_amount_positive" CHECK("payments"."net_amount" > 0),
	CONSTRAINT "chk_fee_non_negative" CHECK("payments"."fee" >= 0),
	CONSTRAINT "chk_fee_percentage_range" CHECK("payments"."fee_percentage" >= 0 AND "payments"."fee_percentage" <= 100),
	CONSTRAINT "chk_currency" CHECK("payments"."currency" IN ('EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR')),
	CONSTRAINT "chk_method" CHECK("payments"."method" IN ('cash', 'card', 'wallet', 'vodafone_cash', 'instapay', 'installment', 'bank_transfer')),
	CONSTRAINT "chk_status" CHECK("payments"."status" IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'expired', 'cancelled')),
	CONSTRAINT "chk_gateway_environment" CHECK("payments"."gateway_environment" IN ('production', 'sandbox', 'test')),
	CONSTRAINT "chk_refund_amount_non_negative" CHECK("payments"."refund_amount" >= 0),
	CONSTRAINT "chk_total_refunded_non_negative" CHECK("payments"."total_refunded" >= 0),
	CONSTRAINT "chk_refund_amount_not_exceed" CHECK("payments"."refund_amount" <= "payments"."amount"),
	CONSTRAINT "chk_total_refunded_not_exceed" CHECK("payments"."total_refunded" <= "payments"."amount"),
	CONSTRAINT "chk_refund_count_non_negative" CHECK("payments"."refund_count" >= 0),
	CONSTRAINT "chk_attempt_count_positive" CHECK("payments"."attempt_count" >= 1),
	CONSTRAINT "chk_reconciliation_status" CHECK("payments"."reconciliation_status" IN ('pending', 'matched', 'mismatched', 'manual_review')),
	CONSTRAINT "chk_dispute_status" CHECK("payments"."dispute_status" IS NULL OR "payments"."dispute_status" IN ('open', 'under_review', 'won', 'lost', 'closed')),
	CONSTRAINT "chk_metadata_valid" CHECK("payments"."metadata" IS NULL OR (json_valid("payments"."metadata") = 1 AND json_type("payments"."metadata") = 'object'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_key_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_tx_unique` ON `payments` (`provider`,`provider_transaction_id`) WHERE "payments"."provider_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `payments_store_idx` ON `payments` (`store_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `payments_method_idx` ON `payments` (`method`);--> statement-breakpoint
CREATE INDEX `payments_currency_idx` ON `payments` (`currency`);--> statement-breakpoint
CREATE INDEX `payments_provider_idx` ON `payments` (`provider`) WHERE "payments"."provider" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_gateway_name_idx` ON `payments` (`gateway_name`) WHERE "payments"."gateway_name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_created_at_idx` ON `payments` (`created_at`);--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paid_at`) WHERE "payments"."paid_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_refunded_at_idx` ON `payments` (`refunded_at`) WHERE "payments"."refunded_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_expires_idx` ON `payments` (`expires_at`) WHERE "payments"."expires_at" IS NOT NULL AND "payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `payments_customer_email_idx` ON `payments` (`customer_email`) WHERE "payments"."customer_email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_customer_phone_idx` ON `payments` (`customer_phone`) WHERE "payments"."customer_phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_reconciliation_idx` ON `payments` (`reconciliation_status`) WHERE "payments"."reconciliation_status" != 'matched';--> statement-breakpoint
CREATE INDEX `payments_dispute_idx` ON `payments` (`dispute_status`) WHERE "payments"."dispute_status" IS NOT NULL AND "payments"."dispute_status" != 'closed';--> statement-breakpoint
CREATE INDEX `payments_store_status_idx` ON `payments` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `payments_store_created_idx` ON `payments` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
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
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "chk_key_format" CHECK(
        "platform_settings"."key" GLOB '[a-z0-9]*'
        AND "platform_settings"."key" NOT GLOB '*..*'
        AND "platform_settings"."key" NOT GLOB '*__*'
        AND "platform_settings"."key" NOT GLOB '*.-*'
        AND "platform_settings"."key" NOT GLOB '*-.*'
      ),
	CONSTRAINT "chk_key_length" CHECK(length("platform_settings"."key") BETWEEN 1 AND 100),
	CONSTRAINT "chk_category_format" CHECK("platform_settings"."category" IS NULL OR "platform_settings"."category" GLOB '[a-z0-9._-]*'),
	CONSTRAINT "chk_category_length" CHECK("platform_settings"."category" IS NULL OR length("platform_settings"."category") <= 50),
	CONSTRAINT "chk_value_type" CHECK("platform_settings"."type" IN ('string', 'number', 'boolean', 'json', 'array')),
	CONSTRAINT "chk_environment" CHECK("platform_settings"."environment" IN ('production', 'staging', 'development', 'test')),
	CONSTRAINT "chk_version_positive" CHECK("platform_settings"."version" >= 1),
	CONSTRAINT "chk_value_valid" CHECK("platform_settings"."value" IS NULL OR json_valid("platform_settings"."value") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_settings_key_env_unique` ON `platform_settings` (`key`,`environment`) WHERE store_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_settings_key_store_env_unique` ON `platform_settings` (`key`,`store_id`,`environment`) WHERE store_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_category_idx` ON `platform_settings` (`category`);--> statement-breakpoint
CREATE INDEX `platform_settings_type_idx` ON `platform_settings` (`type`);--> statement-breakpoint
CREATE INDEX `platform_settings_environment_idx` ON `platform_settings` (`environment`);--> statement-breakpoint
CREATE INDEX `platform_settings_public_idx` ON `platform_settings` (`is_public`) WHERE is_public = 1 AND environment = 'production';--> statement-breakpoint
CREATE INDEX `platform_settings_store_idx` ON `platform_settings` (`store_id`) WHERE store_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_store_env_idx` ON `platform_settings` (`store_id`,`environment`) WHERE store_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `platform_settings_category_env_idx` ON `platform_settings` (`category`,`environment`);--> statement-breakpoint
CREATE TABLE `product_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`views_count` integer DEFAULT 0 NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`reviews_count` integer DEFAULT 0 NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_rating_range" CHECK("product_stats"."rating" >= 0 AND "product_stats"."rating" <= 500),
	CONSTRAINT "chk_stats_counts_non_negative" CHECK("product_stats"."views_count" >= 0 AND "product_stats"."sales_count" >= 0 AND "product_stats"."reviews_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_stats_product_idx` ON `product_stats` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_stats_sales_idx` ON `product_stats` (`sales_count`);--> statement-breakpoint
CREATE INDEX `product_stats_views_idx` ON `product_stats` (`views_count`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`short_description` text,
	`price` text NOT NULL,
	`compare_at_price` text,
	`cost` text,
	`stock` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`sku` text,
	`barcode` text,
	`weight` text,
	`length` text,
	`width` text,
	`height` text,
	`media_ids` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]',
	`video_url` text,
	`image_src` text,
	`variants` text DEFAULT '[]',
	`variant_prices` text DEFAULT '{}',
	`haggle_enabled` integer DEFAULT false NOT NULL,
	`min_price` text,
	`meta_title` text,
	`meta_description` text,
	`is_published` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`metadata` text DEFAULT '{}',
	`deleted_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_prod_name_not_empty" CHECK(length("products"."name") > 0),
	CONSTRAINT "chk_prod_slug_not_empty" CHECK(length("products"."slug") > 0),
	CONSTRAINT "chk_price_non_negative" CHECK(CAST("products"."price" AS REAL) >= 0.0),
	CONSTRAINT "chk_stock_non_negative" CHECK("products"."stock" >= 0),
	CONSTRAINT "chk_low_stock_non_negative" CHECK("products"."low_stock_threshold" >= 0),
	CONSTRAINT "chk_compare_at_price" CHECK("products"."compare_at_price" IS NULL OR CAST("products"."compare_at_price" AS REAL) >= CAST("products"."price" AS REAL)),
	CONSTRAINT "chk_cost_non_negative" CHECK("products"."cost" IS NULL OR CAST("products"."cost" AS REAL) >= 0.0),
	CONSTRAINT "chk_cost_price" CHECK("products"."cost" IS NULL OR CAST("products"."cost" AS REAL) <= CAST("products"."price" AS REAL)),
	CONSTRAINT "chk_min_price_non_negative" CHECK("products"."min_price" IS NULL OR CAST("products"."min_price" AS REAL) >= 0.0),
	CONSTRAINT "chk_min_price_limit" CHECK("products"."min_price" IS NULL OR CAST("products"."min_price" AS REAL) <= CAST("products"."price" AS REAL)),
	CONSTRAINT "chk_haggle_min_price" CHECK("products"."haggle_enabled" = 0 OR "products"."min_price" IS NOT NULL),
	CONSTRAINT "chk_weight_positive" CHECK("products"."weight" IS NULL OR CAST("products"."weight" AS REAL) > 0.0),
	CONSTRAINT "chk_length_positive" CHECK("products"."length" IS NULL OR CAST("products"."length" AS REAL) > 0.0),
	CONSTRAINT "chk_width_positive" CHECK("products"."width" IS NULL OR CAST("products"."width" AS REAL) > 0.0),
	CONSTRAINT "chk_height_positive" CHECK("products"."height" IS NULL OR CAST("products"."height" AS REAL) > 0.0),
	CONSTRAINT "chk_prod_slug_format" CHECK("products"."slug" NOT LIKE '% %'),
	CONSTRAINT "chk_barcode_format" CHECK("products"."barcode" IS NULL OR length("products"."barcode") >= 3),
	CONSTRAINT "chk_images_limit" CHECK(json_array_length("products"."images") <= 50),
	CONSTRAINT "chk_variants_limit" CHECK(json_array_length("products"."variants") <= 100),
	CONSTRAINT "chk_short_description_length" CHECK("products"."short_description" IS NULL OR length("products"."short_description") <= 500)
);
--> statement-breakpoint
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
CREATE INDEX `products_name_idx` ON `products` (`store_id`,"name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text,
	`order_id` text,
	`user_id` text,
	`user_name` text NOT NULL,
	`anonymous` integer DEFAULT false NOT NULL,
	`title` text,
	`comment` text NOT NULL,
	`pros` text DEFAULT '[]' NOT NULL,
	`cons` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`videos` text DEFAULT '[]' NOT NULL,
	`rating` integer NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`language` text DEFAULT 'ar' NOT NULL,
	`helpful_count` integer DEFAULT 0 NOT NULL,
	`not_helpful_count` integer DEFAULT 0 NOT NULL,
	`reply` text,
	`replied_at` integer,
	`replied_by` text,
	`reported_count` integer DEFAULT 0 NOT NULL,
	`spam_score` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "chk_rating_range" CHECK("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "chk_review_status" CHECK("reviews"."status" IN ('pending', 'published', 'hidden', 'reported', 'deleted')),
	CONSTRAINT "chk_language" CHECK("reviews"."language" IN ('ar', 'en', 'fr', 'es')),
	CONSTRAINT "chk_title_length" CHECK("reviews"."title" IS NULL OR length("reviews"."title") BETWEEN 1 AND 200),
	CONSTRAINT "chk_comment_length" CHECK(length("reviews"."comment") BETWEEN 1 AND 5000),
	CONSTRAINT "chk_reply_length" CHECK("reviews"."reply" IS NULL OR length("reviews"."reply") <= 2000),
	CONSTRAINT "chk_images_limit" CHECK(json_array_length("reviews"."images") <= 10),
	CONSTRAINT "chk_videos_limit" CHECK(json_array_length("reviews"."videos") <= 2),
	CONSTRAINT "chk_pros_limit" CHECK(json_array_length("reviews"."pros") <= 10),
	CONSTRAINT "chk_cons_limit" CHECK(json_array_length("reviews"."cons") <= 10),
	CONSTRAINT "chk_helpful_count_non_negative" CHECK("reviews"."helpful_count" >= 0),
	CONSTRAINT "chk_not_helpful_count_non_negative" CHECK("reviews"."not_helpful_count" >= 0),
	CONSTRAINT "chk_reported_count_non_negative" CHECK("reviews"."reported_count" >= 0),
	CONSTRAINT "chk_spam_score_range" CHECK("reviews"."spam_score" BETWEEN 0 AND 100),
	CONSTRAINT "chk_verified_consistency" CHECK(("reviews"."verified" = 0) OR ("reviews"."verified" = 1 AND "reviews"."order_id" IS NOT NULL)),
	CONSTRAINT "chk_replied_consistency" CHECK(("reviews"."reply" IS NULL AND "reviews"."replied_at" IS NULL) OR ("reviews"."reply" IS NOT NULL AND "reviews"."replied_at" IS NOT NULL)),
	CONSTRAINT "chk_metadata_valid" CHECK("reviews"."metadata" IS NULL OR (json_valid("reviews"."metadata") = 1 AND json_type("reviews"."metadata") = 'object')),
	CONSTRAINT "chk_user_name_not_empty" CHECK("reviews"."user_name" != '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_customer_product_unique` ON `reviews` (`customer_id`,`product_id`) WHERE customer_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_order_product_unique` ON `reviews` (`order_id`,`product_id`) WHERE order_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_product_idx` ON `reviews` (`product_id`);--> statement-breakpoint
CREATE INDEX `reviews_store_idx` ON `reviews` (`store_id`);--> statement-breakpoint
CREATE INDEX `reviews_customer_idx` ON `reviews` (`customer_id`) WHERE customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `reviews_order_idx` ON `reviews` (`order_id`) WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `reviews_rating_idx` ON `reviews` (`rating`);--> statement-breakpoint
CREATE INDEX `reviews_product_rating_idx` ON `reviews` (`product_id`,`rating`) WHERE status = 'published' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_status_idx` ON `reviews` (`status`);--> statement-breakpoint
CREATE INDEX `reviews_verified_idx` ON `reviews` (`verified`) WHERE status = 'published';--> statement-breakpoint
CREATE INDEX `reviews_replied_idx` ON `reviews` (`replied_at`) WHERE replied_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX `reviews_reported_idx` ON `reviews` (`reported_count`) WHERE reported_count > 0;--> statement-breakpoint
CREATE INDEX `reviews_spam_idx` ON `reviews` (`spam_score`) WHERE spam_score > 70;--> statement-breakpoint
CREATE INDEX `reviews_helpful_idx` ON `reviews` (`helpful_count`);--> statement-breakpoint
CREATE INDEX `reviews_language_idx` ON `reviews` (`language`);--> statement-breakpoint
CREATE INDEX `reviews_created_idx` ON `reviews` (`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_product_created_idx` ON `reviews` (`product_id`,`created_at`) WHERE status = 'published' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_deleted_idx` ON `reviews` (`deleted_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_store_status_idx` ON `reviews` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `reviews_store_rating_idx` ON `reviews` (`store_id`,`rating`) WHERE status = 'published' AND deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text,
	`address_id` text,
	`provider` text DEFAULT 'custom' NOT NULL,
	`provider_shipment_id` text,
	`tracking_number` text,
	`tracking_url` text,
	`carrier_service` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`shipping_method` text DEFAULT 'standard' NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`charged_to_customer` integer DEFAULT 0 NOT NULL,
	`estimated_cost` integer DEFAULT 0 NOT NULL,
	`actual_cost` integer,
	`insurance_amount` integer DEFAULT 0 NOT NULL,
	`insurance_provider` text,
	`cod_amount` integer DEFAULT 0 NOT NULL,
	`cod_collected` integer DEFAULT false NOT NULL,
	`cod_collected_at` integer,
	`weight` text,
	`length` text,
	`width` text,
	`height` text,
	`package_count` integer DEFAULT 1 NOT NULL,
	`recipient_name` text,
	`recipient_phone` text,
	`recipient_email` text,
	`pickup_location` text,
	`pickup_address` text,
	`pickup_scheduled_at` integer,
	`picked_up_at` integer,
	`estimated_delivery` integer,
	`delivered_at` integer,
	`last_attempt_at` integer,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`label_url` text,
	`return_label_url` text,
	`return_tracking_number` text,
	`signature_url` text,
	`signature_collected_at` integer,
	`delivery_photos` text DEFAULT '[]' NOT NULL,
	`delivery_instructions` text,
	`customs_info` text,
	`events` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "chk_shipment_status" CHECK("shipments"."status" IN ('pending', 'label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_other', 'returned', 'delivery_attempt_failed', 'pickup_failed', 'address_invalid', 'cancelled')),
	CONSTRAINT "chk_shipping_method" CHECK("shipments"."shipping_method" IN ('standard', 'express', 'same_day', 'next_day', 'economy', 'freight')),
	CONSTRAINT "chk_cost_non_negative" CHECK("shipments"."cost" >= 0),
	CONSTRAINT "chk_charged_non_negative" CHECK("shipments"."charged_to_customer" >= 0),
	CONSTRAINT "chk_cod_amount_non_negative" CHECK("shipments"."cod_amount" >= 0),
	CONSTRAINT "chk_package_count_positive" CHECK("shipments"."package_count" >= 1),
	CONSTRAINT "chk_delivery_attempts_non_negative" CHECK("shipments"."delivery_attempts" >= 0),
	CONSTRAINT "chk_delivery_photos_limit" CHECK(json_array_length("shipments"."delivery_photos") <= 10),
	CONSTRAINT "chk_events_valid" CHECK(json_valid("shipments"."events") = 1),
	CONSTRAINT "chk_metadata_valid" CHECK(json_valid("shipments"."metadata") = 1),
	CONSTRAINT "chk_provider_not_empty" CHECK(length("shipments"."provider") > 0),
	CONSTRAINT "chk_cod_consistency" CHECK(("shipments"."cod_collected" = 0) OR ("shipments"."cod_collected" = 1 AND "shipments"."cod_collected_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_provider_shipment_unique` ON `shipments` (`provider`,`provider_shipment_id`) WHERE provider_shipment_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_tracking_number_unique` ON `shipments` (`tracking_number`) WHERE tracking_number IS NOT NULL;--> statement-breakpoint
CREATE INDEX `shipments_order_idx` ON `shipments` (`order_id`);--> statement-breakpoint
CREATE INDEX `shipments_store_idx` ON `shipments` (`store_id`);--> statement-breakpoint
CREATE INDEX `shipments_customer_idx` ON `shipments` (`customer_id`) WHERE customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `shipments_status_idx` ON `shipments` (`status`);--> statement-breakpoint
CREATE INDEX `shipments_deleted_idx` ON `shipments` (`deleted_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `shipments_store_status_idx` ON `shipments` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `shipments_store_created_idx` ON `shipments` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `store_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`total_products` integer DEFAULT 0 NOT NULL,
	`total_orders` integer DEFAULT 0 NOT NULL,
	`total_customers` integer DEFAULT 0 NOT NULL,
	`total_revenue` text DEFAULT '0' NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_stats_products_positive" CHECK("store_stats"."total_products" >= 0),
	CONSTRAINT "chk_stats_orders_positive" CHECK("store_stats"."total_orders" >= 0),
	CONSTRAINT "chk_stats_customers_positive" CHECK("store_stats"."total_customers" >= 0),
	CONSTRAINT "chk_stats_revenue_positive" CHECK(CAST("store_stats"."total_revenue" AS REAL) >= 0.0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_stats_store_idx` ON `store_stats` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_stats_revenue_idx` ON `store_stats` (`total_revenue`);--> statement-breakpoint
CREATE INDEX `store_stats_orders_idx` ON `store_stats` (`total_orders`);--> statement-breakpoint
CREATE INDEX `store_stats_products_idx` ON `store_stats` (`total_products`);--> statement-breakpoint
CREATE TABLE `stores` (
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_store_name_not_empty" CHECK("stores"."name" != ''),
	CONSTRAINT "chk_store_slug_not_empty" CHECK("stores"."slug" != ''),
	CONSTRAINT "chk_store_slug_format" CHECK("stores"."slug" GLOB '[a-z0-9]*[a-z0-9-]*'),
	CONSTRAINT "chk_country_code" CHECK("stores"."country" GLOB '[A-Z][A-Z]'),
	CONSTRAINT "chk_currency_code" CHECK("stores"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "chk_payment_gateway" CHECK("stores"."payment_gateway" IN ('stripe', 'paypal', 'paymob', 'cash')),
	CONSTRAINT "chk_store_phone_format" CHECK("stores"."phone" IS NULL OR "stores"."phone" GLOB '+[1-9][0-9]*'),
	CONSTRAINT "chk_store_email_format" CHECK("stores"."email" IS NULL OR "stores"."email" LIKE '%_@_%._%'),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("stores"."deleted_at" IS NULL OR "stores"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_verified_by_consistency" CHECK(("stores"."is_verified" = 0 OR "stores"."verified_by" IS NOT NULL))
);
--> statement-breakpoint
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
CREATE TABLE `telegram_messages` (
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
	CONSTRAINT "chk_direction" CHECK("telegram_messages"."direction" IN ('incoming', 'outgoing')),
	CONSTRAINT "chk_message_type" CHECK("telegram_messages"."message_type" IN ('text', 'photo', 'sticker', 'contact', 'callback_query', 'command', 'video', 'document', 'audio', 'voice', 'location', 'other')),
	CONSTRAINT "chk_message_status" CHECK("telegram_messages"."status" IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
	CONSTRAINT "chk_language" CHECK("telegram_messages"."language" IN ('ar', 'en', 'fr', 'es')),
	CONSTRAINT "chk_message_ownership" CHECK(NOT ("telegram_messages"."store_id" IS NULL AND "telegram_messages"."customer_id" IS NOT NULL)),
	CONSTRAINT "chk_telegram_message_id_positive" CHECK("telegram_messages"."telegram_message_id" IS NULL OR "telegram_messages"."telegram_message_id" > 0),
	CONSTRAINT "chk_reply_to_message_id_positive" CHECK("telegram_messages"."reply_to_message_id" IS NULL OR "telegram_messages"."reply_to_message_id" > 0),
	CONSTRAINT "chk_update_id_positive" CHECK("telegram_messages"."update_id" IS NULL OR "telegram_messages"."update_id" > 0),
	CONSTRAINT "chk_command_format" CHECK("telegram_messages"."command" IS NULL OR ("telegram_messages"."command" GLOB '/*' AND length("telegram_messages"."command") <= 50)),
	CONSTRAINT "chk_content_length" CHECK("telegram_messages"."content" IS NULL OR length("telegram_messages"."content") <= 4096),
	CONSTRAINT "chk_caption_length" CHECK("telegram_messages"."caption" IS NULL OR length("telegram_messages"."caption") <= 1024),
	CONSTRAINT "chk_attachments_limit" CHECK(json_array_length("telegram_messages"."attachments") <= 10),
	CONSTRAINT "chk_buttons_limit" CHECK(json_array_length("telegram_messages"."buttons") <= 20),
	CONSTRAINT "chk_entities_limit" CHECK(json_array_length("telegram_messages"."entities") <= 100),
	CONSTRAINT "chk_retry_count_non_negative" CHECK("telegram_messages"."retry_count" >= 0),
	CONSTRAINT "chk_spam_score_range" CHECK("telegram_messages"."spam_score" BETWEEN 0 AND 100),
	CONSTRAINT "chk_sent_consistency" CHECK(("telegram_messages"."status" = 'pending' AND "telegram_messages"."sent_at" IS NULL) OR ("telegram_messages"."status" != 'pending')),
	CONSTRAINT "chk_delivered_consistency" CHECK(("telegram_messages"."status" IN ('pending', 'sent') AND "telegram_messages"."delivered_at" IS NULL) OR ("telegram_messages"."status" NOT IN ('pending', 'sent'))),
	CONSTRAINT "chk_read_consistency" CHECK(("telegram_messages"."status" IN ('pending', 'sent', 'delivered') AND "telegram_messages"."read_at" IS NULL) OR ("telegram_messages"."status" NOT IN ('pending', 'sent', 'delivered'))),
	CONSTRAINT "chk_failure_consistency" CHECK(("telegram_messages"."status" != 'failed' AND "telegram_messages"."failure_reason" IS NULL) OR ("telegram_messages"."status" = 'failed' AND "telegram_messages"."failure_reason" IS NOT NULL)),
	CONSTRAINT "chk_metadata_valid" CHECK("telegram_messages"."metadata" IS NULL OR (json_valid("telegram_messages"."metadata") = 1 AND json_type("telegram_messages"."metadata") = 'object'))
);
--> statement-breakpoint
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
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`password_hash` text,
	`backup_pin` text,
	`phone_number` text,
	`telegram_id` text,
	`telegram_username` text,
	`telegram_chat_id` text,
	`merchant_id` text,
	`preferences` text DEFAULT '{}' NOT NULL,
	`last_login_at` integer,
	`last_ip` text,
	`last_active_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`role` text DEFAULT 'merchant' NOT NULL,
	`auth_method` text DEFAULT 'telegram' NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_user_role" CHECK("user"."role" IN ('merchant', 'admin', 'support', 'moderator', 'enterprise')),
	CONSTRAINT "chk_auth_method" CHECK("user"."auth_method" IN ('telegram', 'email', 'phone', 'google', 'magic_link')),
	CONSTRAINT "chk_user_status" CHECK("user"."status" IN ('active', 'inactive', 'suspended', 'deleted')),
	CONSTRAINT "chk_identity_exists" CHECK(("user"."email" IS NOT NULL OR "user"."phone_number" IS NOT NULL OR "user"."telegram_id" IS NOT NULL)),
	CONSTRAINT "chk_name_not_empty" CHECK("user"."name" != ''),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("user"."deleted_at" IS NULL OR "user"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_merchant_id_consistency" CHECK(("user"."role" != 'merchant' OR "user"."merchant_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`) WHERE "user"."email" IS NOT NULL AND "user"."status" != 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_unique` ON `user` (`phone_number`) WHERE "user"."phone_number" IS NOT NULL AND "user"."status" != 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX `user_telegram_id_unique` ON `user` (`telegram_id`) WHERE "user"."telegram_id" IS NOT NULL AND "user"."status" != 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX `user_telegram_chat_unique` ON `user` (`telegram_chat_id`) WHERE "user"."telegram_chat_id" IS NOT NULL AND "user"."status" != 'deleted';--> statement-breakpoint
CREATE INDEX `user_role_status_idx` ON `user` (`role`,`status`);--> statement-breakpoint
CREATE INDEX `user_last_active_idx` ON `user` (`last_active_at`);--> statement-breakpoint
CREATE INDEX `user_merchant_id_idx` ON `user` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `user_status_idx` ON `user` (`status`);--> statement-breakpoint
CREATE INDEX `user_role_idx` ON `user` (`role`);--> statement-breakpoint
CREATE INDEX `user_created_at_idx` ON `user` (`created_at`);--> statement-breakpoint
CREATE TABLE `magic_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_magic_token_type" CHECK("magic_tokens"."type" IN ('login', 'verify_email', 'reset_password', 'invite')),
	CONSTRAINT "chk_magic_used_consistency" CHECK(("magic_tokens"."used_at" IS NULL OR "magic_tokens"."used_at" >= "magic_tokens"."created_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_tokens_token_unique` ON `magic_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `magic_tokens_user_id_idx` ON `magic_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `magic_tokens_expires_at_idx` ON `magic_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `password_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`changed_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`changed_by` text,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_password_history_not_empty" CHECK("password_history"."password_hash" != '')
);
--> statement-breakpoint
CREATE INDEX `password_history_user_id_idx` ON `password_history` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`login_count` integer DEFAULT 0 NOT NULL,
	`last_login_at` integer,
	`total_sessions` integer DEFAULT 0 NOT NULL,
	`last_ip` text,
	`first_login_at` integer,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_stats_user_id_idx` ON `user_stats` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_stats_login_count_idx` ON `user_stats` (`login_count`);