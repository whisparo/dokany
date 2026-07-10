// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    throw new Error("🚀 [Dokany System Check]: Testing Admin Error Pipeline Live!");
    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    const cloudflareEnv = (req as any).cloudflare?.env || (process.env as any);
    
    // استخدام التوكنز الحالية (سواء لقطها من الملف أو الـ Dashboard)
    const errorBotToken = cloudflareEnv?.ERROR_BOT_TOKEN || process.env.ERROR_BOT_TOKEN;
    const errorChannelId = cloudflareEnv?.ERROR_CHANNEL_ID || process.env.ERROR_CHANNEL_ID;

    console.error("⚠️ Ping Route: Error triggered, sending payload to Telegram...");

    if (errorBotToken && errorChannelId) {
      // نص مبسط جداً بدون أي Markdown عشان نضمن إن تليجرام يقبله فوراً
      const simpleMessage = `🚨 Dokany Error Alert 🚨\n\nMessage: ${error.message}\nTime: ${new Date().toISOString()}`;

      try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${errorBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: errorChannelId,
            text: simpleMessage,
            // شيلنا الـ parse_mode تماماً لتفادي أي قفل تنسيق
          }),
        });

        const resData = await telegramResponse.json();
        // 📡 السطر ده هيطبع لنا رد سيرفرات تليجرام بالملي في الـ Tail!
        console.log("📡 Telegram Server Response:", JSON.stringify(resData));

      } catch (telegramErr) {
        console.error("❌ Network fetch failed to Telegram:", telegramErr);
      }
    } else {
      console.warn("⚠️ Configuration Missing: ERROR_BOT_TOKEN or ERROR_CHANNEL_ID not found in this environment.");
    }

    return NextResponse.json({
      success: false,
      message: "Pipeline test triggered!",
      error: error.message
    }, { status: 500 });
  }
}