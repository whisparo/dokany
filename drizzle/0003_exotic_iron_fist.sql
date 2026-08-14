DROP INDEX `haggle_order_idx`;--> statement-breakpoint
DROP INDEX `haggle_active_unique_idx`;--> statement-breakpoint
CREATE INDEX `haggle_order_idx` ON `haggle_sessions` (`order_id`) WHERE "haggle_sessions"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `haggle_active_unique_idx` ON `haggle_sessions` (`customer_id`,`product_id`) WHERE "haggle_sessions"."customer_id" IS NOT NULL AND "haggle_sessions"."status" IN ('active', 'counter_offered') AND "haggle_sessions"."deleted_at" IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
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
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `addresses_default_unique_idx` ON `addresses` (`customer_id`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_customer_idx` ON `addresses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `addresses_customer_default_idx` ON `addresses` (`customer_id`,`is_default`) WHERE "addresses"."is_default" = 1 AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `addresses_country_city_idx` ON `addresses` (`country`,`city`);--> statement-breakpoint
CREATE INDEX `addresses_deleted_idx` ON `addresses` (`deleted_at`) WHERE "addresses"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `addresses_postal_code_idx` ON `addresses` (`postal_code`);--> statement-breakpoint
CREATE INDEX `addresses_phone_idx` ON `addresses` (`recipient_phone`);--> statement-breakpoint
CREATE INDEX `addresses_customer_label_idx` ON `addresses` (`customer_id`,`label`) WHERE "addresses"."deleted_at" IS NULL;