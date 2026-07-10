// app/api/telegram/mini-app/route.ts
import { verifyTelegramInitData } from '@/lib/telegram/auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface MiniAppRequestBody {
  initData: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MiniAppRequestBody;
    const { initData } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('❌ [Mini-App Route] Critical: TELEGRAM_BOT_TOKEN is missing from env');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // 🌟 التعديل السحري: ضفنا await هنا لأن الدالة أصبحت Async
    const user = await verifyTelegramInitData(initData, botToken);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      user,
      dashboard: {
        // بيانات الداشبورد...
      },
    });
  } catch (error) {
    console.error('❌ [Mini-App Route] Error handling request:', error);
    return NextResponse.json({ error: 'Invalid Request Body' }, { status: 400 });
  }
}