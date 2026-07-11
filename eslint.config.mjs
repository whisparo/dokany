import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🎯 توليد أداة المواءمة للـ Flat Config
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // 1️⃣ تجاهل الفولدرات (توزيع الـ globalIgnores يدوياً بنظام الـ v9)
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  
  // 2️⃣ شحن قواعد Next.js متوافقة 100% مع الـ Flat Config
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;