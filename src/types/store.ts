// src/types/store.ts

export interface ThemeTokens {
  fontFamily?: string;
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
    accent?: string;
  };
}

export interface StoreSettings {
  theme?: string;
  colors?: Record<string, string>;
  layout?: string[];
  [key: string]: unknown;
}

/**
 * ✅ واجهة المتجر الشاملة والمستقلة تماماً عن الـ DB Schema
 */
export interface Store {
  id: string;
  ownerId?: string | null;
  name: string;
  slug: string;
  shopName?: string | null;
  description?: string | null;
  coverImage?: string | null;
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  currency?: string | null;
  paymentGateway?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | Date | null;
  deletedBy?: string | null;
  deletedAt?: string | Date | null;
  deletionReason?: string | null;
  theme?: ThemeTokens | null;
  settings?: StoreSettings | null;
  templateVersion?: string | number | null;
  cloudinaryAccountIndex?: number | null;
  isActive?: boolean | null;
  isVerified?: boolean | null;
  isFeatured?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}