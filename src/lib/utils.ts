// src/lib/utils/cn.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * دالة ذكية لدمج كلاسات Tailwind CSS
 * - تدمج clsx لتوليد كلاسات ديناميكية
 * - تستخدم tailwind-merge لحل التعارضات (مثل bg-red-500 تتفوق على bg-blue-500)
 * - تدعم جميع أنواع المدخلات: سلاسل، كائنات، مصفوفات، false/ null/ undefined
 * 
 * @example
 * cn('px-2 py-1', { 'bg-red-500': isActive, 'text-white': true })
 * // => "px-2 py-1 bg-red-500 text-white"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * نسخة محسنة للأداء باستخدام cache بسيط (اختياري)
 * مفيدة إذا تم استدعاؤها بشكل متكرر بنفس المدخلات
 */
const cnCache = new Map<string, string>();

export function cnCached(...inputs: ClassValue[]): string {
  const key = JSON.stringify(inputs);
  if (cnCache.has(key)) {
    return cnCache.get(key)!;
  }
  const result = twMerge(clsx(inputs));
  // تخزين في الكاش مع حد أقصى 1000 عنصر (لتجنب تسرب الذاكرة)
  if (cnCache.size < 1000) {
    cnCache.set(key, result);
  }
  return result;
}