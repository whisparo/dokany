// src/types/store.ts

// 1. استيراد النوع المستنتج من جدول قاعدة البيانات الحقيقي مباشرة (المصدر الوحيد للحقيقة)
import { type Store as DBStore } from '@/lib/db/schema/stores';

/**
 * ✅ توكنز الثيم الموحدة لواجهات المتاجر (Theme Tokens)
 */
export interface ThemeTokens {
  fontFamily?: string;
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
    accent?: string;
  };
}

/**
 * ✅ واجهة المتجر للـ Frontend (تدمج الـ DB Schema مع الـ Custom Frontend Fields)
 * نستخدم Omit لاستبعاد الحقول التي نريد إعادة كتابة أنواعها للـ Frontend (مثل الـ JSON Fields)
 */
export interface Store extends Omit<DBStore, 'theme' | 'settings' | 'createdAt' | 'updatedAt'> {
  // 🎨 إعادة تعريف حقول الـ JSON المعقدة بأنواع قوية بدلاً من مجرد string
  theme?: ThemeTokens;
  
  settings?: {
    theme?: string;
    colors?: Record<string, string>;
    layout?: string[];
  };

  // ⏱️ جعل التواريخ مرنة للـ Frontend (سواء جاءت كـ Date أو String بعد الـ Serialization)
  createdAt?: string | Date;
  updatedAt?: string | Date;
}