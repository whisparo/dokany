// src/lib/db/schema/custom-domains.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

import { stores } from './stores';

// ============================================
// 📦 أنواع TypeScript (في أول الملف)
// ============================================

export type VerificationStatus = 'pending' | 'verified' | 'failed';
export type SSLStatus = 'pending' | 'active' | 'failed' | 'expired' | 'disabled';
export type VerificationMethod = 'dns_txt' | 'cname' | 'http_file' | 'manual';

export type DnsRecord = {
  type: 'TXT' | 'CNAME' | 'A';
  name: string;
  value: string;
  verified: boolean;
  verifiedAt?: number;
};

export type RedirectConfig = {
  wwwToNonWww?: boolean;
  nonWwwToWww?: boolean;
  httpToHttps?: boolean;
  customRedirects?: Array<{
    from: string;
    to: string;
    statusCode: 301 | 302;
  }>;
};

export type HstsConfig = {
  enabled: boolean;
  maxAge: number;
  includeSubdomains: boolean;
  preload: boolean;
};

// ============================================
// 🌐 جدول النطاقات المخصصة (Custom Domains) - D1 Compatible
// ============================================

export const customDomains = sqliteTable(
  'custom_domains',
  {
    id: text('id').primaryKey(), // UUID يُولَّد في التطبيق قبل الـ Insert

    storeId: text('store_id').notNull(),
    domain: text('domain').notNull(), // Normalized & Always Lowercase

    verificationStatus: text('verification_status').notNull().default('pending'),
    verificationToken: text('verification_token'),
    verifiedBy: text('verified_by'),

    // 📊 الـ Defaults لضمان سلامة مشغلات الـ Edge في الـ D1 Runtime
    dnsRecords: text('dns_records', { mode: 'json' })
      .$type<DnsRecord[]>()
      .notNull()
      .default(sql`'[]'`),

    sslStatus: text('ssl_status').notNull().default('pending'),
    sslCertificateAt: integer('ssl_certificate_at', { mode: 'timestamp' }),
    sslExpiresAt: integer('ssl_expires_at', { mode: 'timestamp' }),
    sslIssuer: text('ssl_issuer'),

    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    isSubdomain: integer('is_subdomain', { mode: 'boolean' }).notNull().default(false),
    isWildcard: integer('is_wildcard', { mode: 'boolean' }).notNull().default(false),

    parentDomain: text('parent_domain'),

    redirectConfig: text('redirect_config', { mode: 'json' })
      .$type<RedirectConfig>()
      .notNull()
      .default(sql`'{}'`),

    hstsConfig: text('hsts_config', { mode: 'json' })
      .$type<HstsConfig>()
      .notNull()
      .default(sql`'{"enabled":true,"maxAge":31536000,"includeSubdomains":false,"preload":false}'`),

    domainExpiresAt: integer('domain_expires_at', { mode: 'timestamp' }),
    autoRenewEnabled: integer('auto_renew_enabled', { mode: 'boolean' }).notNull().default(false),

    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys الصارمة مع التحديث المتتالي
    // ============================================
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'custom_domains_store_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة المحمية شرطياً (Partial Unique Indexes)
    // ============================================
    
    // 🛡️ النطاق فريد تماماً ومستحيل يتكرر بين المتاجر طالما لم يُحذف
    uniqueIndex('unique_active_domain')
      .on(table.domain)
      .where(sql`${table.deletedAt} IS NULL`),

    // 🛡️ قفل هندسي: يضمن بشكل قاطع عدم وجود أكثر من نطاق أساسي "واحد فقط" لكل متجر
    uniqueIndex('unique_primary_store_domain')
      .on(table.storeId)
      .where(sql`${table.isPrimary} = 1 AND ${table.deletedAt} IS NULL`),

    // ============================================
    // ⚡ فهارس الأداء العالي لخدمة الـ Router والـ Cron Jobs
    // ============================================
    index('idx_custom_domains_store').on(table.storeId),
    
    index('idx_custom_domains_verification_status')
      .on(table.verificationStatus)
      .where(sql`${table.verificationStatus} != 'verified' AND ${table.deletedAt} IS NULL`),
    
    index('idx_custom_domains_active')
      .on(table.isActive)
      .where(sql`${table.isActive} = 1 AND ${table.deletedAt} IS NULL`),
    
    index('idx_custom_domains_ssl_status')
      .on(table.sslStatus)
      .where(sql`${table.sslStatus} != 'active' AND ${table.deletedAt} IS NULL`),
    
    index('idx_custom_domains_parent')
      .on(table.parentDomain)
      .where(sql`${table.parentDomain} IS NOT NULL`),
    
    index('idx_custom_domains_expires')
      .on(table.domainExpiresAt)
      .where(sql`${table.domainExpiresAt} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    index('idx_custom_domains_routing_lookup')
      .on(table.domain, table.isActive)
      .where(sql`${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيط والتحققات المنطقية على مستوى الـ Engine (Check Constraints)
    // ============================================
    check('chk_domain_not_empty', sql`length(${table.domain}) > 0`),
    check('chk_domain_length', sql`length(${table.domain}) <= 253`),
    
    // 🚀 تصليح سنيور: إجبار النطاق يكون Lowercase وحروف صالحة تماماً لمنع ثغرات الـ Routing والـ DNS Collisions
    check(
      'chk_domain_format',
      sql`
        ${table.domain} GLOB '*.*' 
        AND ${table.domain} NOT GLOB '*..*'
        AND ${table.domain} NOT GLOB '*[!a-z0-9.-]*'
      `
    ),
    
    check('chk_verification_status', sql`${table.verificationStatus} IN ('pending', 'verified', 'failed')`),
    check('chk_verified_by', sql`${table.verifiedBy} IS NULL OR ${table.verifiedBy} IN ('dns_txt', 'cname', 'http_file', 'manual')`),
    check('chk_ssl_status', sql`${table.sslStatus} IN ('pending', 'active', 'failed', 'expired', 'disabled')`),
    
    // التناسق المنطقي للشهادة
    check(
      'chk_ssl_consistency',
      sql`(${table.sslStatus} != 'active') OR (${table.sslStatus} = 'active' AND ${table.sslCertificateAt} IS NOT NULL AND ${table.sslExpiresAt} IS NOT NULL)`
    ),
    
    // التناسق المنطقي للنطاقات الفرعية
    check(
      'chk_subdomain_consistency',
      sql`(${table.isSubdomain} = 0 AND ${table.parentDomain} IS NULL) OR (${table.isSubdomain} = 1 AND ${table.parentDomain} IS NOT NULL)`
    ),
    
    // 🚀 تصليح سنيور: التأكد من وجود النجمة الصريحة في بداية الـ Wildcard دون الاعتماد على الخلط المعماري للـ GLOB
    check(
      'chk_wildcard_format',
      sql`(${table.isWildcard} = 0) OR (${table.isWildcard} = 1 AND ${table.domain} LIKE '*.%')`
    ),
    
    check('chk_domain_expires', sql`${table.domainExpiresAt} IS NULL OR ${table.domainExpiresAt} > ${table.createdAt}`),
    
    check(
      'chk_hsts_max_age',
      sql`json_extract(${table.hstsConfig}, '$.maxAge') IS NULL OR json_extract(${table.hstsConfig}, '$.maxAge') BETWEEN 0 AND 63072000`
    ),

    // قفل منطقي: لا يمكن لنطاق غير مفعّل أو غير محقق أن يكون هو النطاق الأساسي للمتجر
    check(
      'chk_primary_integrity',
      sql`(${table.isPrimary} = 0) OR (${table.isPrimary} = 1 AND ${table.verificationStatus} = 'verified' AND ${table.isActive} = 1)`
    )
  ]
);

// ============================================
// 📚 أنواع الـ Inference للـ Drizzle
// ============================================
export type CustomDomain = InferSelectModel<typeof customDomains>;
export type NewCustomDomain = InferInsertModel<typeof customDomains>;

// ============================================
// 🛠️ دوال الـ Validation والـ Normalization (Type-Safe)
// ============================================

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const SUBDOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,})$/;

/**
 * ✅ تنقية النطاق الصارم (Normalization) لمنع أي تلاعب أو ثغرات
 */
export function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '');
}

export function validateDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  const normalized = normalizeDomain(domain);
  return DOMAIN_REGEX.test(normalized);
}

export function validateSubdomain(subdomain: string): boolean {
  if (!subdomain || subdomain.length > 253) return false;
  return SUBDOMAIN_REGEX.test(normalizeDomain(subdomain));
}

export function generateVerificationToken(): string {
  return `dokany-verify-${crypto.randomUUID()}`;
}

export function isDomainExpired(domain: CustomDomain): boolean {
  if (!domain.domainExpiresAt) return false;
  return domain.domainExpiresAt.getTime() < Date.now();
}

export function isSSLExpired(domain: CustomDomain): boolean {
  if (!domain.sslExpiresAt) return false;
  return domain.sslExpiresAt.getTime() < Date.now();
}

export function getDaysUntilExpiration(domain: CustomDomain): number | null {
  if (!domain.domainExpiresAt) return null;
  const daysRemaining = Math.ceil((domain.domainExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return daysRemaining;
}

export function extractParentDomain(domain: string): string | null {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split('.');
  if (parts.length <= 2) return null;
  return parts.slice(-2).join('.');
}

export function isSubdomain(domain: string): boolean {
  return normalizeDomain(domain).split('.').length > 2;
}