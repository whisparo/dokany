PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_user_role" CHECK("__new_user"."role" IN ('merchant', 'admin', 'support', 'moderator', 'enterprise')),
	CONSTRAINT "chk_auth_method" CHECK("__new_user"."auth_method" IN ('telegram', 'email', 'phone', 'google', 'magic_link')),
	CONSTRAINT "chk_user_status" CHECK("__new_user"."status" IN ('active', 'inactive', 'suspended', 'deleted')),
	CONSTRAINT "chk_identity_exists" CHECK(("__new_user"."email" IS NOT NULL OR "__new_user"."phone_number" IS NOT NULL OR "__new_user"."telegram_id" IS NOT NULL)),
	CONSTRAINT "chk_deleted_by_consistency" CHECK(("__new_user"."deleted_at" IS NULL OR "__new_user"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "password_hash", "backup_pin", "phone_number", "telegram_id", "telegram_username", "telegram_chat_id", "merchant_id", "preferences", "last_login_at", "last_ip", "last_active_at", "status", "is_verified", "role", "auth_method", "deleted_at", "deleted_by", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", "password_hash", "backup_pin", "phone_number", "telegram_id", "telegram_username", "telegram_chat_id", "merchant_id", "preferences", "last_login_at", "last_ip", "last_active_at", "status", "is_verified", "role", "auth_method", "deleted_at", "deleted_by", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
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
CREATE TABLE `__new_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
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
CREATE TABLE `__new_magic_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "chk_magic_token_type" CHECK("__new_magic_tokens"."type" IN ('login', 'verify_email', 'reset_password', 'invite')),
	CONSTRAINT "chk_magic_used_consistency" CHECK(("__new_magic_tokens"."used_at" IS NULL OR "__new_magic_tokens"."used_at" >= "__new_magic_tokens"."created_at"))
);
--> statement-breakpoint
INSERT INTO `__new_magic_tokens`("id", "user_id", "token", "type", "expires_at", "used_at", "created_at", "ip_address", "user_agent") SELECT "id", "user_id", "token", "type", "expires_at", "used_at", "created_at", "ip_address", "user_agent" FROM `magic_tokens`;--> statement-breakpoint
DROP TABLE `magic_tokens`;--> statement-breakpoint
ALTER TABLE `__new_magic_tokens` RENAME TO `magic_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `magic_tokens_token_unique` ON `magic_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `magic_tokens_user_id_idx` ON `magic_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `magic_tokens_expires_at_idx` ON `magic_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_password_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`changed_by` text,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "chk_password_history_not_empty" CHECK("__new_password_history"."password_hash" != '')
);
--> statement-breakpoint
INSERT INTO `__new_password_history`("id", "user_id", "password_hash", "changed_at", "changed_by", "ip_address", "user_agent") SELECT "id", "user_id", "password_hash", "changed_at", "changed_by", "ip_address", "user_agent" FROM `password_history`;--> statement-breakpoint
DROP TABLE `password_history`;--> statement-breakpoint
ALTER TABLE `__new_password_history` RENAME TO `password_history`;--> statement-breakpoint
CREATE INDEX `password_history_user_id_idx` ON `password_history` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_user_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`login_count` integer DEFAULT 0 NOT NULL,
	`last_login_at` integer,
	`total_sessions` integer DEFAULT 0 NOT NULL,
	`last_ip` text,
	`first_login_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_stats`("id", "user_id", "login_count", "last_login_at", "total_sessions", "last_ip", "first_login_at", "updated_at") SELECT "id", "user_id", "login_count", "last_login_at", "total_sessions", "last_ip", "first_login_at", "updated_at" FROM `user_stats`;--> statement-breakpoint
DROP TABLE `user_stats`;--> statement-breakpoint
ALTER TABLE `__new_user_stats` RENAME TO `user_stats`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_stats_user_id_idx` ON `user_stats` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_stats_login_count_idx` ON `user_stats` (`login_count`);--> statement-breakpoint
ALTER TABLE `stores` ADD `snapshot_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `stores_snapshot_version_idx` ON `stores` (`snapshot_version`);