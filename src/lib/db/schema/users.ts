// src/lib/db/schema/users.ts
import { sqliteTable, text, integer, index, uniqueIndex, check, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ============================================
// 📋 1. جدول المستخدمين الرئيسي (user)
// ============================================
export const users = sqliteTable(
  'user', // ✅ Better Auth expects singular 'user'
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email'),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    passwordHash: text('password_hash'),
    backupPin: text('backup_pin'),
    phoneNumber: text('phone_number'),
    telegramId: text('telegram_id'),
    telegramUsername: text('telegram_username'),
    telegramChatId: text('telegram_chat_id'),
    merchantId: text('merchant_id'),
    preferences: text('preferences').notNull().default(sql`'{}'`),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    lastIp: text('last_ip'),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('active'),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    role: text('role').notNull().default('merchant'),
    authMethod: text('auth_method').notNull().default('telegram'),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    foreignKey({
      name: 'user_deleted_by_fkey',
      columns: [table.deletedBy] as const,
      foreignColumns: [table.id] as const,
    }).onDelete('set null').onUpdate('cascade'),

    check('chk_user_role', sql`${table.role} IN ('merchant', 'admin', 'support', 'moderator', 'enterprise')`),
    check('chk_auth_method', sql`${table.authMethod} IN ('telegram', 'email', 'phone', 'google', 'magic_link')`),
    check('chk_user_status', sql`${table.status} IN ('active', 'inactive', 'suspended', 'deleted')`),

    uniqueIndex('user_email_unique').on(table.email).where(sql`${table.email} IS NOT NULL AND ${table.status} != 'deleted'`),
    uniqueIndex('user_phone_unique').on(table.phoneNumber).where(sql`${table.phoneNumber} IS NOT NULL AND ${table.status} != 'deleted'`),
    uniqueIndex('user_telegram_id_unique').on(table.telegramId).where(sql`${table.telegramId} IS NOT NULL AND ${table.status} != 'deleted'`),
    uniqueIndex('user_telegram_chat_unique').on(table.telegramChatId).where(sql`${table.telegramChatId} IS NOT NULL AND ${table.status} != 'deleted'`),

    index('user_role_status_idx').on(table.role, table.status),
    index('user_last_active_idx').on(table.lastActiveAt),
    index('user_merchant_id_idx').on(table.merchantId),
    index('user_status_idx').on(table.status),
    index('user_role_idx').on(table.role),
    index('user_created_at_idx').on(table.createdAt),

    check('chk_identity_exists', sql`(${table.email} IS NOT NULL OR ${table.phoneNumber} IS NOT NULL OR ${table.telegramId} IS NOT NULL)`),
    check('chk_name_not_empty', sql`${table.name} != ''`),
    check('chk_deleted_by_consistency', sql`(${table.deletedAt} IS NULL OR ${table.deletedBy} IS NOT NULL)`),
    check('chk_merchant_id_consistency', sql`(${table.role} != 'merchant' OR ${table.merchantId} IS NOT NULL)`),
  ]
);

// ============================================
// 📊 2. جدول إحصائيات المستخدم (user_stats)
// ============================================
export const userStats = sqliteTable(
  'user_stats',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    loginCount: integer('login_count').notNull().default(0),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    totalSessions: integer('total_sessions').notNull().default(0),
    lastIp: text('last_ip'),
    firstLoginAt: integer('first_login_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    uniqueIndex('user_stats_user_id_idx').on(table.userId),
    index('user_stats_login_count_idx').on(table.loginCount),
  ]
);

// ============================================
// 📝 3. جدول روابط السحر (magic_tokens)
// ============================================
export const magicTokens = sqliteTable(
  'magic_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    token: text('token').notNull(),
    type: text('type').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => [
    uniqueIndex('magic_tokens_token_unique').on(table.token),
    check('chk_magic_token_type', sql`${table.type} IN ('login', 'verify_email', 'reset_password', 'invite')`),
    index('magic_tokens_user_id_idx').on(table.userId),
    index('magic_tokens_expires_at_idx').on(table.expiresAt),
    check('chk_magic_used_consistency', sql`(${table.usedAt} IS NULL OR ${table.usedAt} >= ${table.createdAt})`),
  ]
);

// ============================================
// 🔐 4. جدول تغييرات كلمات المرور (password_history)
// ============================================
export const passwordHistory = sqliteTable(
  'password_history',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    changedAt: integer('changed_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    changedBy: text('changed_by'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => [
    foreignKey({ 
      name: 'password_history_changed_by_fkey',
      columns: [table.changedBy] as const, 
      foreignColumns: [users.id] as const 
    }).onDelete('set null').onUpdate('cascade'),
    index('password_history_user_id_idx').on(table.userId),
    check('chk_password_history_not_empty', sql`${table.passwordHash} != ''`),
  ]
);

// ============================================
// 📦 أنواع TypeScript
// ============================================
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserStats = InferSelectModel<typeof userStats>;
export type NewUserStats = InferInsertModel<typeof userStats>;
export type MagicToken = InferSelectModel<typeof magicTokens>;
export type NewMagicToken = InferInsertModel<typeof magicTokens>;
export type PasswordHistory = InferSelectModel<typeof passwordHistory>;
export type NewPasswordHistory = InferInsertModel<typeof passwordHistory>;