//src/lib/countries-config.ts
export interface CountryConfig {
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
}

// مصفوفة تعتمد على "مفتاح الاتصال الدولي" كمفتاح أساسي (Key)
export const countriesConfig: Record<string, CountryConfig> = {
  "20": { countryName: "مصر", currencyCode: "EGP", currencySymbol: "ج.م" },
  "966": { countryName: "السعودية", currencyCode: "SAR", currencySymbol: "ر.س" },
  "971": { countryName: "الإمارات", currencyCode: "AED", currencySymbol: "د.إ" },
  "965": { countryName: "الكويت", currencyCode: "KWD", currencySymbol: "د.ك" },
  "974": { countryName: "قطر", currencyCode: "QAR", currencySymbol: "ر.ق" },
  "973": { countryName: "البحرين", currencyCode: "BHD", currencySymbol: "د.ب" },
  "968": { countryName: "عمان", currencyCode: "OMR", currencySymbol: "ر.ع" },
  "962": { countryName: "الأردن", currencyCode: "JOD", currencySymbol: "د.أ" },
  "961": { countryName: "لبنان", currencyCode: "LBP", currencySymbol: "ل.ل" },
  "212": { countryName: "المغرب", currencyCode: "MAD", currencySymbol: "د.م." },
  "213": { countryName: "الجزائر", currencyCode: "DZD", currencySymbol: "د.ج" },
  "216": { countryName: "تونس", currencyCode: "TND", currencySymbol: "د.ت" },
  "218": { countryName: "ليبيا", currencyCode: "LYD", currencySymbol: "د.ل" },
  "249": { countryName: "السودان", currencyCode: "SDG", currencySymbol: "ج.س" },
  "964": { countryName: "العراق", currencyCode: "IQD", currencySymbol: "د.ع" },
  "963": { countryName: "سوريا", currencyCode: "SYP", currencySymbol: "ل.س" },
  "970": { countryName: "فلسطين", currencyCode: "ILS", currencySymbol: "ش.ج" },
  "967": { countryName: "اليمن", currencyCode: "YER", currencySymbol: "ر.ي" },
  
  // العملات العالمية الأساسية كـ Fallbacks
  "1": { countryName: "أمريكا / كندا", currencyCode: "USD", currencySymbol: "$" },
  "44": { countryName: "المملكة المتحدة", currencyCode: "GBP", currencySymbol: "£" },
};

// دالة عبقرية بتاخد رقم التليفون وتطلع العملة والرمز تلقائياً
export function getCurrencyByPhone(phoneNumber: string): CountryConfig {
  // تنظيف الرقم من أي علامات زائد أو مسافات
  const cleanPhone = phoneNumber.replace(/[\s+]/g, '');

  // بنجرب نطابق أول 3 أرقام (أغلب مفاتيح الدول العربية 3 أرقام)
  const prefix3 = cleanPhone.substring(0, 3);
  if (countriesConfig[prefix3]) return countriesConfig[prefix3];

  // لو منفعش، بنجرب أول رقمين (زي مصر 20)
  const prefix2 = cleanPhone.substring(0, 2);
  if (countriesConfig[prefix2]) return countriesConfig[prefix2];

  // لو منفعش، بنجرب أول رقم (زي أمريكا وكندا 1)
  const prefix1 = cleanPhone.substring(0, 1);
  if (countriesConfig[prefix1]) return countriesConfig[prefix1];

  // القيمة الافتراضية لو الرقم من دولة مش متسجلة (Fallback)
  return { countryName: "عالمي", currencyCode: "USD", currencySymbol: "$" };
}