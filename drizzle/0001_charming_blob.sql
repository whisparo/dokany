PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_store_name_not_empty" CHECK("__new_stores"."name" != ''),
	CONSTRAINT "chk_store_slug_not_empty" CHECK("__new_stores"."slug" != ''),
	CONSTRAINT "chk_store_slug_format" CHECK("__new_stores"."slug" GLOB '[a-z0-9أ-ي]*[a-z0-9أ-ي-]*'),
	CONSTRAINT "chk_country_code" CHECK("__new_stores"."country" GLOB '[A-Z][A-Z]'),
	CONSTRAINT "chk_currency_code" CHECK("__new_stores"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "chk_payment_gateway" CHECK("__new_stores"."payment_gateway" IN ('stripe', 'paypal', 'paymob', 'cash')),
	CONSTRAINT "chk_store_phone_format" CHECK("__new_stores"."phone" IS NULL OR "__new_stores"."phone" GLOB '+[1-9][0-9]*'),
	CONSTRAINT "chk_store_email_format" CHECK("__new_stores"."email" IS NULL OR "__new_stores"."email" LIKE '%_@_%._%'),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_stores"."deleted_at" IS NULL OR "__new_stores"."deleted_by" IS NOT NULL)),
	CONSTRAINT "chk_verified_by_consistency" CHECK(("__new_stores"."is_verified" = 0 OR "__new_stores"."verified_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_stores`("id", "owner_id", "deleted_by", "verified_by", "name", "slug", "shop_name", "description", "logo_url", "cover_image_url", "phone", "email", "telegram_chat_id", "telegram_username", "country", "city", "address", "currency", "payment_gateway", "settings", "theme", "template_version", "cloudinary_account_index", "is_active", "is_verified", "is_featured", "verified_at", "deleted_at", "deletion_reason", "created_at", "updated_at") SELECT "id", "owner_id", "deleted_by", "verified_by", "name", "slug", "shop_name", "description", "logo_url", "cover_image_url", "phone", "email", "telegram_chat_id", "telegram_username", "country", "city", "address", "currency", "payment_gateway", "settings", "theme", "template_version", "cloudinary_account_index", "is_active", "is_verified", "is_featured", "verified_at", "deleted_at", "deletion_reason", "created_at", "updated_at" FROM `stores`;--> statement-breakpoint
DROP TABLE `stores`;--> statement-breakpoint
ALTER TABLE `__new_stores` RENAME TO `stores`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_telegram_chat_unique` ON `stores` (`telegram_chat_id`) WHERE "stores"."telegram_chat_id" IS NOT NULL AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_telegram_username_unique` ON `stores` (`telegram_username`) WHERE "stores"."telegram_username" IS NOT NULL AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_owner_idx` ON `stores` (`owner_id`);--> statement-breakpoint
CREATE INDEX `stores_deleted_by_idx` ON `stores` (`deleted_by`);--> statement-breakpoint
CREATE INDEX `stores_slug_active_idx` ON `stores` (`slug`,`is_active`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_geo_active_idx` ON `stores` (`country`,`city`,`is_active`) WHERE "stores"."is_active" = 1 AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_featured_idx` ON `stores` (`is_featured`) WHERE "stores"."is_featured" = 1 AND "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_deleted_idx` ON `stores` (`deleted_at`) WHERE "stores"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `stores_created_idx` ON `stores` (`created_at`);