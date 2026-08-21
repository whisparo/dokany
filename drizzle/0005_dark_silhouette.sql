PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	CONSTRAINT "chk_failure_consistency" CHECK(
      ("__new_telegram_messages"."status" = 'failed' AND "__new_telegram_messages"."failure_reason" IS NOT NULL) OR
      ("__new_telegram_messages"."status" != 'failed' AND ("__new_telegram_messages"."failure_reason" IS NULL OR "__new_telegram_messages"."retry_count" > 0))
    ),
	CONSTRAINT "chk_metadata_valid" CHECK("__new_telegram_messages"."metadata" IS NULL OR (json_valid("__new_telegram_messages"."metadata") = 1 AND json_type("__new_telegram_messages"."metadata") = 'object'))
);
--> statement-breakpoint
INSERT INTO `__new_telegram_messages`("id", "store_id", "customer_id", "user_id", "order_id", "chat_session_id", "chat_id", "telegram_user_id", "telegram_message_id", "reply_to_message_id", "update_id", "webhook_id", "direction", "message_type", "status", "content", "caption", "command", "language", "attachments", "file_id", "file_unique_id", "buttons", "inline_keyboard", "reply_keyboard", "entities", "metadata", "processed_at", "processing_error", "sent_at", "delivered_at", "read_at", "retry_count", "last_retry_at", "failure_reason", "failure_code", "spam_score", "created_at", "updated_at", "deleted_at") SELECT "id", "store_id", "customer_id", "user_id", "order_id", "chat_session_id", "chat_id", "telegram_user_id", "telegram_message_id", "reply_to_message_id", "update_id", "webhook_id", "direction", "message_type", "status", "content", "caption", "command", "language", "attachments", "file_id", "file_unique_id", "buttons", "inline_keyboard", "reply_keyboard", "entities", "metadata", "processed_at", "processing_error", "sent_at", "delivered_at", "read_at", "retry_count", "last_retry_at", "failure_reason", "failure_code", "spam_score", "created_at", "updated_at", "deleted_at" FROM `telegram_messages`;--> statement-breakpoint
DROP TABLE `telegram_messages`;--> statement-breakpoint
ALTER TABLE `__new_telegram_messages` RENAME TO `telegram_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	`version` integer DEFAULT 1 NOT NULL,
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
	CONSTRAINT "chk_short_description_length" CHECK("__new_products"."short_description" IS NULL OR length("__new_products"."short_description") <= 500),
	CONSTRAINT "chk_version_positive" CHECK("__new_products"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "store_id", "category_id", "name", "slug", "description", "short_description", "price", "compare_at_price", "cost", "stock", "low_stock_threshold", "sku", "barcode", "weight", "length", "width", "height", "media_ids", "images", "video_url", "image_src", "variants", "variant_prices", "haggle_enabled", "min_price", "meta_title", "meta_description", "is_published", "is_featured", "metadata", "deleted_at", "version", "created_at", "updated_at") SELECT "id", "store_id", "category_id", "name", "slug", "description", "short_description", "price", "compare_at_price", "cost", "stock", "low_stock_threshold", "sku", "barcode", "weight", "length", "width", "height", "media_ids", "images", "video_url", "image_src", "variants", "variant_prices", "haggle_enabled", "min_price", "meta_title", "meta_description", "is_published", "is_featured", "metadata", "deleted_at", "version", "created_at", "updated_at" FROM `products`;--> statement-breakpoint
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
CREATE INDEX `products_version_idx` ON `products` (`store_id`,`version`);--> statement-breakpoint
CREATE INDEX `products_version_updated_idx` ON `products` (`store_id`,`version`,`updated_at`);