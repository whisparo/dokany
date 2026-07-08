// src/lib/db/schema/payments.ts

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
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

import { orders } from './orders';

// ============================================
// 📦 أنواع TypeScript
// ============================================

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'expired' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'vodafone_cash' | 'instapay' | 'installment' | 'bank_transfer';
export type Currency = 'EGP' | 'USD' | 'EUR' | 'SAR' | 'AED' | 'KWD' | 'BHD' | 'OMR' | 'QAR';
export type ReconciliationStatus = 'pending' | 'matched' | 'mismatched' | 'manual_review';
export type DisputeStatus = 'open' | 'under_review' | 'won' | 'lost' | 'closed';
export type GatewayEnvironment = 'production' | 'sandbox' | 'test';

export type PaymentMetadata = {
  cardLast4?: string;
  cardBrand?: 'visa' | 'mastercard' | 'amex' | 'mada' | 'other';
  cardExpiry?: string;
  cardHolderName?: string;
  bankName?: string;
  accountLast4?: string;
  walletProvider?: 'vodafone_cash' | 'orange_money' | 'etisalat_cash' | 'we_pay';
  walletPhone?: string;
  instapayReference?: string;
  threeDSecure?: boolean;
  threeDSecureVersion?: string;
  riskScore?: number;
  riskFlags?: string[];
  installmentPlan?: { months: number; monthlyAmount: string; interestRate: number; };
  [key: string]: unknown;
};

export type BillingAddress = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

// ============================================
// 💳 جدول المدفوعات (Payments) - D1 Optimized
// ============================================

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // 🔗 العلاقات
    orderId: text('order_id').notNull(),
    storeId: text('store_id').notNull(), // ✅ بيفضل كـ Column للـ RLS والأداء بدون قيد خارجي مكبل

    // 🔐 Idempotency Key
    idempotencyKey: text('idempotency_key').notNull(),

    // 💰 المبلغ والعملة (Integer بالقرش/Cents لتفادي مشاكل الحسابات في SQLite)
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('EGP'),
    
    fee: integer('fee').notNull().default(0),
    feePercentage: integer('fee_percentage').notNull().default(0),
    netAmount: integer('net_amount').notNull(),

    method: text('method').notNull(),
    status: text('status').notNull().default('pending'),

    // 🏦 بيانات البوابة
    provider: text('provider'),
    providerTransactionId: text('provider_transaction_id'),
    gatewayName: text('gateway_name'),
    gatewayVersion: text('gateway_version'),
    gatewayEnvironment: text('gateway_environment').default('production'),

    providerResponseCode: text('provider_response_code'),
    providerResponseMessage: text('provider_response_message'),
    providerRawResponse: text('provider_raw_response', { mode: 'json' }).$type<Record<string, unknown>>(),

    webhookPayload: text('webhook_payload', { mode: 'json' }).$type<Record<string, unknown>>(),

    metadata: text('metadata', { mode: 'json' })
      .$type<PaymentMetadata>()
      .notNull()
      .default(sql`'{}'`),

    billingAddress: text('billing_address', { mode: 'json' }).$type<BillingAddress>(),

    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    customerName: text('customer_name'),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    deviceFingerprint: text('device_fingerprint'),

    attemptCount: integer('attempt_count').notNull().default(1),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
    failureReason: text('failure_reason'),
    failureCode: text('failure_code'),

    paidAt: integer('paid_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),

    // 💸 الاسترداد
    refundAmount: integer('refund_amount').notNull().default(0),
    totalRefunded: integer('total_refunded').notNull().default(0),
    refundCount: integer('refund_count').notNull().default(0),
    refundedAt: integer('refunded_at', { mode: 'timestamp' }),
    lastRefundAt: integer('last_refund_at', { mode: 'timestamp' }),
    refundReason: text('refund_reason'),

    // ⚖️ المصالحة والنزاعات
    reconciliationStatus: text('reconciliation_status').default('pending'),
    reconciledAt: integer('reconciled_at', { mode: 'timestamp' }),
    reconciledBy: text('reconciled_by'),

    disputeStatus: text('dispute_status'),
    disputeReason: text('dispute_reason'),
    disputeOpenedAt: integer('dispute_opened_at', { mode: 'timestamp' }),
    disputeResolvedAt: integer('dispute_resolved_at', { mode: 'timestamp' }),
    disputeOutcome: text('dispute_outcome'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys الفعلية والضرورية فقط
    // ============================================
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'payments_order_id_fkey',
    }).onDelete('cascade').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الفريدة والأداء
    // ============================================
    uniqueIndex('payments_idempotency_key_unique').on(table.idempotencyKey),

    uniqueIndex('payments_provider_tx_unique')
      .on(table.provider, table.providerTransactionId)
      .where(sql`${table.providerTransactionId} IS NOT NULL`),

    index('payments_order_idx').on(table.orderId),
    index('payments_store_idx').on(table.storeId), 
    index('payments_status_idx').on(table.status),
    index('payments_method_idx').on(table.method),
    index('payments_currency_idx').on(table.currency),
    
    index('payments_provider_idx').on(table.provider).where(sql`${table.provider} IS NOT NULL`),
    index('payments_gateway_name_idx').on(table.gatewayName).where(sql`${table.gatewayName} IS NOT NULL`),
    
    index('payments_created_at_idx').on(table.createdAt),
    index('payments_paid_at_idx').on(table.paidAt).where(sql`${table.paidAt} IS NOT NULL`),
    index('payments_refunded_at_idx').on(table.refundedAt).where(sql`${table.refundedAt} IS NOT NULL`),
    index('payments_expires_idx').on(table.expiresAt).where(sql`${table.expiresAt} IS NOT NULL AND ${table.status} = 'pending'`),
    
    index('payments_customer_email_idx').on(table.customerEmail).where(sql`${table.customerEmail} IS NOT NULL`),
    index('payments_customer_phone_idx').on(table.customerPhone).where(sql`${table.customerPhone} IS NOT NULL`),
    
    index('payments_reconciliation_idx').on(table.reconciliationStatus).where(sql`${table.reconciliationStatus} != 'matched'`),
    index('payments_dispute_idx').on(table.disputeStatus).where(sql`${table.disputeStatus} IS NOT NULL AND ${table.disputeStatus} != 'closed'`),
    
    index('payments_store_status_idx').on(table.storeId, table.status),
    index('payments_store_created_idx').on(table.storeId, table.createdAt),

    // ============================================
    // 🛡️ القيود المنطقية المتوافقة مع SQLite Engine
    // ============================================
    check('chk_amount_positive', sql`${table.amount} > 0`),
    check('chk_net_amount_positive', sql`${table.netAmount} > 0`),
    check('chk_fee_non_negative', sql`${table.fee} >= 0`),
    check('chk_fee_percentage_range', sql`${table.feePercentage} >= 0 AND ${table.feePercentage} <= 100`),
    
    check('chk_currency', sql`${table.currency} IN ('EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR')`),
    check('chk_method', sql`${table.method} IN ('cash', 'card', 'wallet', 'vodafone_cash', 'instapay', 'installment', 'bank_transfer')`),
    check('chk_status', sql`${table.status} IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'expired', 'cancelled')`),
    check('chk_gateway_environment', sql`${table.gatewayEnvironment} IN ('production', 'sandbox', 'test')`),
    
    check('chk_refund_amount_non_negative', sql`${table.refundAmount} >= 0`),
    check('chk_total_refunded_non_negative', sql`${table.totalRefunded} >= 0`),
    check('chk_refund_amount_not_exceed', sql`${table.refundAmount} <= ${table.amount}`),
    check('chk_total_refunded_not_exceed', sql`${table.totalRefunded} <= ${table.amount}`),
    check('chk_refund_count_non_negative', sql`${table.refundCount} >= 0`),
    check('chk_attempt_count_positive', sql`${table.attemptCount} >= 1`),
    
    check('chk_reconciliation_status', sql`${table.reconciliationStatus} IN ('pending', 'matched', 'mismatched', 'manual_review')`),
    check('chk_dispute_status', sql`${table.disputeStatus} IS NULL OR ${table.disputeStatus} IN ('open', 'under_review', 'won', 'lost', 'closed')`),
    
    check('chk_metadata_valid', sql`${table.metadata} IS NULL OR (json_valid(${table.metadata}) = 1 AND json_type(${table.metadata}) = 'object')`),
  ]
);

// ============================================
// 📚 أنواع TypeScript (تمت إضافتها صراحة لتشغيل الـ Imports وحل الأخطاء)
// ============================================
export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;

// ============================================
// 🛠️ دوال الحسابات (Application Layer - Safe & Fast)
// ============================================

export function generateIdempotencyKey(): string {
  return `pay_${Date.now()}_${crypto.randomUUID()}`;
}

export function calculateNetAmount(amount: number, fee: number): number {
  return amount - fee;
}

export function calculateFee(amount: number, percentage: number): number {
  return Math.round((amount * percentage) / 100);
}

export function isPaymentExpired(payment: Payment): boolean {
  if (!payment.expiresAt) return false;
  return payment.expiresAt.getTime() < Date.now();
}

export function canRefund(payment: Payment): boolean {
  return payment.status === 'paid' && payment.totalRefunded < payment.amount;
}

export function getRefundableAmount(payment: Payment): number {
  return payment.amount - payment.totalRefunded;
}