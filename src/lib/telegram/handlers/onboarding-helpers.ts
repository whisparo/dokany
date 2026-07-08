// src/lib/telegram/handlers/onboarding-helpers.ts

export const CODE_TO_GEO: Record<string, { country: string; currency: string }> = {
  '20': { country: 'مصر 🇪🇬', currency: 'جنيه مصري' },
  '966': { country: 'السعودية 🇸🇦', currency: 'ريال سعودي' },
  '971': { country: 'الإمارات 🇦🇪', currency: 'درهم إماراتي' },
};

export function isValidPhone(phone: string): boolean {
  return /^(\+?[1-9][0-9]{7,14}|01[0125][0-9]{8})$/.test(phone);
}

export function extractCountryCode(phone: string): string {
  const clean = phone.replace('+', '');
  if (clean.startsWith('20')) return '20';
  if (clean.startsWith('966')) return '966';
  if (clean.startsWith('971')) return '971';
  return '';
}