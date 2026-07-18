//src/app/api/test-error/route.ts
import { NextResponse } from 'next/server';
import { SystemError } from '@/lib/errors/types';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { getEnv } from '@/lib/env';


export async function GET() {
  const env = getEnv();
  const testError = new SystemError({
    code: 'TEST_001',
    userMessage: '🧪 اختبار تليجرام',
    technicalMessage: 'Test from /api/test-error',
    category: 'system',
    severity: 'critical',
    shouldAlert: true,
    retryable: false,
    metadata: { path: '/api/test-error', storeId: 'global' },
  });

  await sendErrorToTelegram(testError, env);

  return NextResponse.json({ success: true, message: 'Test error sent to Telegram' });
}