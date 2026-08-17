// schedule.mjs
import { Client } from "@upstash/qstash";

const QSTASH_TOKEN = "eyJVc2VySUQiOiI2ZjlmZTg0MC1lN2NkLTQzNzgtYjYyZC03NDY3OTkxZDAxNjgiLCJQYXNzd29yZCI6IjNkY2ZlNzIzN2ZlOTRmZDU4NTM1YTllNmMyYTIzNWU1In0=";
const INTERNAL_API_SECRET = "YC5jjtUShI5y5xy4TfH1yD34fLDhYT5q";

const client = new Client({ token: QSTASH_TOKEN });

async function createSchedules() {
  console.log("🚀 جاري الاتصال بـ Upstash QStash لإعداد الجدولة عبر المكتبة الرسمية...");

  try {
    // 1. جدولة معالج الأخطاء (كل 10 دقائق)
    const res1 = await client.schedules.create({
      destination: "https://www.dokany.workers.dev/api/errors/process",
      cron: "*/10 * * * *",
      headers: {
        "x-internal-secret": INTERNAL_API_SECRET,
      },
    });
    console.log("✅ تم إعداد جدولة معالج الأخطاء بنجاح:", res1);

    // 2. جدولة التقرير اليومي (الساعة 8 صباحاً)
    const res2 = await client.schedules.create({
      destination: "https://www.dokany.workers.dev/api/errors/silent-digest",
      cron: "0 8 * * *",
      headers: {
        "x-internal-secret": INTERNAL_API_SECRET,
      },
    });
    console.log("✅ تم إعداد جدولة التقرير اليومي بنجاح:", res2);

  } catch (error) {
    console.error("❌ تفاصيل الخطأ الحقيقية من QStash SDK:", error);
  }
}

createSchedules();