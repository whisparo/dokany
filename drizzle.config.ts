import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema/*', // مسار ملفات الأسكيم بتاعتك
  out: './drizzle', // الفولدر اللي هيتولد تلقائياً للميجريشنز (اللي قولتلك عليه)
  dialect: 'sqlite', // D1 مبني على SQLite
  driver: 'd1-http', // المحرك المعتمد للربط بكلاود فلير
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: 'اكتب_الـ_ID_بتاع_الداتابيز_هنا',
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});