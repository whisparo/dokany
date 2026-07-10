// src/app/api/ping/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    // 💣 تفجير خطأ متعمد لاختبار ماسورة الأخطاء الحية
    throw new Error("🚀 [Dokany System Check]: Testing Admin Error Pipeline Live!");

    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    // 1. سحب توكن قناة الأخطاء من البيئة (سواء Cloudflare env أو process.env)
    const cloudflareEnv = (req as any).cloudflare?.env || (process.env as any);
    const errorBotToken = cloudflareEnv?.ERROR_BOT_TOKEN;
    const errorChannelId = cloudflareEnv?.ERROR_CHANNEL_ID;

    console.error("⚠️ Ping Route: Error triggered, pushing to telegram admin channel...");

    // 2. إذا كانت المتغيرات موجودة، بنضرب API تليجرام مباشرة كـ Ad-hoc Notifier سريع
    if (errorBotToken && errorChannelId) {
      const errorMessage = `🚨 *Dokany Error Alert* 🚨\n\n` +
                           `*Message:* ${error.message}\n` +
                           `*Time:* ${new Date().toISOString()}\n` +
                           `*Env:* Cloudflare Pages (Edge)\n\n` +
                           `\`\`\`text\n${error.stack?.slice(0, 500) || 'No stack trace'}\n\`\`\``;

      // إرسال الإشعار لخادم تليجرام في الخلفية دون تعطيل الرد
      try {
        await fetch(`https://api.telegram.org/bot${errorBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: errorChannelId,
            text: errorMessage,
            parse_mode: 'MarkdownV2', // لتنسيق الكود بشكل شيك في القناة
          }),
        });
      } catch (telegramErr) {
        console.error("❌ Failed to send error to telegram channel:", telegramErr);
      }
    } else {
      console.warn("⚠️ ERROR_BOT_TOKEN or ERROR_CHANNEL_ID is missing from environments!");
    }

    // الرد على المتصفح بـ 500 عشان نراقب الكود في الـ Tail
    return NextResponse.json({
      success: false,
      message: "Pipeline test triggered!",
      error: error.message
    }, { status: 500 });
  }
}