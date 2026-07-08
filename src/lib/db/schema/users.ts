// src/lib/db/schema/users.ts

import { sqliteTable, text, integer, index, uniqueIndex, check, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ============================================
// 📋 1. جدول المستخدمين الرئيسي (user)
// ============================================
export const users = sqliteTable(
  'user', // ✅ تم تحويله للمفرد ليطابق معايير Better Auth تلقائياً
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
    deletedBy: text('deleted_by'), // ربط حلقي آمن أسفل الجدول
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [table.id],
      name: 'user_deleted_by_fkey'
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
// 🎫 3. جدول الجلسات (session) - متوافق مع Better Auth
// ============================================
export const sessions = sqliteTable(
  'session', // ✅ تم تحويله للمفرد
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    token: text('token').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    
    // حقولك المخصصة الممتازة للـ Rotation والحماية
    tokenFamily: text('token_family').notNull(),
    deviceFingerprint: text('device_fingerprint'),
    refreshExpiresAt: integer('refresh_expires_at', { mode: 'timestamp' }).notNull(),
    isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    revokedReason: text('revoked_reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'session_user_id_fkey' }).onDelete('cascade').onUpdate('cascade'),
    uniqueIndex('session_token_unique').on(table.token),
    check('chk_session_revoke_reason', sql`${table.revokedReason} IN ('user_logout', 'security_breach', 'admin_revoke', 'expired', 'token_rotation')`),
    check('chk_revoked_consistency', sql`(${table.isRevoked} = 0 OR ${table.revokedAt} IS NOT NULL)`),
    check('chk_refresh_expires_gt_expires', sql`${table.refreshExpiresAt} > ${table.expiresAt}`),
    index('session_user_id_idx').on(table.userId),
    index('session_token_family_idx').on(table.tokenFamily),
    index('session_user_token_family_idx').on(table.userId, table.tokenFamily),
    index('session_expires_at_idx').on(table.expiresAt),
  ]
);

// ============================================
// 📝 4. جدول روابط السحر (magic_tokens)
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
// 🔐 5. جدول تغييرات كلمات المرور (password_history)
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
    foreignKey({ columns: [table.changedBy], foreignColumns: [users.id], name: 'password_history_changed_by_fkey' }).onDelete('set null').onUpdate('cascade'),
    index('password_history_user_id_idx').on(table.userId),
    check('chk_password_history_not_empty', sql`${table.passwordHash} != ''`),
  ]
);

// ============================================
// 🔗 6. جدول الحسابات الخارجية (account) - متوافق مع Better Auth
// ============================================
export const accounts = sqliteTable(
  'account', // ✅ تم تحويله للمفرد
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    idToken: text('id_token'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  ]
);

// ============================================
// ✅ 7. جدول التحقق (verification) - متوافق مع Better Auth
// ============================================
export const verifications = sqliteTable(
  'verification', // ✅ تم تحويله للمفرد
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('verification_identifier_value_unique').on(table.identifier, table.value),
    index('verification_expires_at_idx').on(table.expiresAt),
    index('verification_identifier_idx').on(table.identifier),
  ]
);

// ============================================
// 📦 أنواع TypeScript النظيفة والقياسية
// ============================================
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type UserStats = InferSelectModel<typeof userStats>;
export type NewUserStats = InferInsertModel<typeof userStats>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type MagicToken = InferSelectModel<typeof magicTokens>;
export type NewMagicToken = InferInsertModel<typeof magicTokens>;

export type PasswordHistory = InferSelectModel<typeof passwordHistory>;
export type NewPasswordHistory = InferInsertModel<typeof passwordHistory>;

export type Account = InferSelectModel<typeof accounts>;
export type NewAccount = InferInsertModel<typeof accounts>;

export type Verification = InferSelectModel<typeof verifications>;
export type NewVerification = InferInsertModel<typeof verifications>;