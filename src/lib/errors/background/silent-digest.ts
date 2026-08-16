// lib/errors/background/silent-digest.ts
// الإصدار: 1.0.1
// الدور: تقرير يومي للأخطاء الصامتة (Silent Errors Daily Digest)

import { SystemError } from '../core/types';
import { addBreadcrumb } from '../core/context';
import { B2Store, createB2StoreFromEnv } from '../storage/b2-store';
import { getTelegramClient, type TelegramClient } from '../clients/telegram';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

export interface SilentDigestResult {
  date: string;
  totalErrors: number;
  uniqueCodes: number;
  codeBreakdown: SilentCodeBreakdown[];
  durationMs: number;
  sentToTelegram: boolean;
  error?: string;
}

export interface SilentCodeBreakdown {
  code: string;
  category: string;
  count: number;
  sample: {
    userMessage: string;
    technicalMessage: string;
    storeId?: string;
    timestamp: string;
  };
  percentage: number;
}

export interface SilentDigestOptions {
  date?: string;
  sendToTelegram?: boolean;
  maxErrors?: number;
  includeStackTraces?: boolean;
  serviceName?: string;
}

// ═══════════════════════════════════════════════════════════════
// 📊  توليد التقرير
// ═══════════════════════════════════════════════════════════════

export async function generateSilentDigest(
  env: any,
  options: SilentDigestOptions = {}
): Promise<SilentDigestResult> {
  const startTime = performance.now();
  const {
    date = getYesterdayDate(),
    sendToTelegram = true,
    maxErrors = 1000,
    includeStackTraces = false,
    serviceName = 'silent-digest',
  } = options;

  let b2Store: B2Store;
  let telegramClient: TelegramClient;

  try {
    b2Store = createB2StoreFromEnv(env);
    telegramClient = getTelegramClient(env);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    addBreadcrumb('❌ Silent digest initialization failed', { error: errorMsg });

    return {
      date,
      totalErrors: 0,
      uniqueCodes: 0,
      codeBreakdown: [],
      durationMs: performance.now() - startTime,
      sentToTelegram: false,
      error: `Initialization failed: ${errorMsg}`,
    };
  }

  try {
    const prefix = `errors/raw/${date}/`;
    addBreadcrumb(`📊 Generating silent digest for ${date}`, {
      service: serviceName,
      prefix,
    });

    const files = await listFilesInPrefix(b2Store, prefix);

    if (files.length === 0) {
      addBreadcrumb(`📭 No errors found for ${date}`, { service: serviceName });
      return {
        date,
        totalErrors: 0,
        uniqueCodes: 0,
        codeBreakdown: [],
        durationMs: performance.now() - startTime,
        sentToTelegram: false,
      };
    }

    const filesToProcess = files.slice(0, maxErrors);
    const silentErrors: SystemError[] = [];

    // قراءة الملفات بالتوازي (Batches of 10)
    const BATCH_SIZE = 10;
    for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
      const batch = filesToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((key) =>
          b2Store.read<SystemError>({ key, compressed: true })
        )
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value?.content) {
          const err = res.value.content;
          if (err && typeof err === 'object' && 'code' in err && err.silent === true) {
            silentErrors.push(err);
          }
        }
      }
    }

    if (silentErrors.length === 0) {
      addBreadcrumb(`📭 No silent errors found for ${date}`, {
        service: serviceName,
        totalFiles: files.length,
      });

      return {
        date,
        totalErrors: 0,
        uniqueCodes: 0,
        codeBreakdown: [],
        durationMs: performance.now() - startTime,
        sentToTelegram: false,
      };
    }

    // تجميع الأخطاء حسب الكود
    const codeMap = new Map<string, SilentCodeBreakdown>();

    for (const error of silentErrors) {
      const existing = codeMap.get(error.code);

      const rawTimestamp = error.timestamp;
      const formattedTimestamp =
        rawTimestamp instanceof Date
          ? rawTimestamp.toISOString()
          : String(rawTimestamp);

      if (existing) {
        existing.count++;
      } else {
        codeMap.set(error.code, {
          code: error.code,
          category: error.category,
          count: 1,
          sample: {
            userMessage: error.userMessage,
            technicalMessage: error.technicalMessage,
            storeId: error.storeId,
            timestamp: formattedTimestamp,
          },
          percentage: 0,
        });
      }
    }

    const breakdown = Array.from(codeMap.values());
    const total = silentErrors.length;

    breakdown.forEach((item) => {
      item.percentage = Math.round((item.count / total) * 100);
    });

    breakdown.sort((a, b) => b.count - a.count);

    const result: SilentDigestResult = {
      date,
      totalErrors: total,
      uniqueCodes: breakdown.length,
      codeBreakdown: breakdown,
      durationMs: performance.now() - startTime,
      sentToTelegram: false,
    };

    if (sendToTelegram) {
      try {
        const formattedMessage = formatSilentDigest(result, includeStackTraces);
        const sendResult = await telegramClient.sendDigest(formattedMessage, {
          buttons: [
            {
              text: '📊 View Dashboard',
              url: 'https://dokany.workers.dev/admin/errors/silent',
            },
          ],
        });

        if (sendResult.success) {
          result.sentToTelegram = true;
          addBreadcrumb(`📤 Silent digest sent to Telegram`, {
            service: serviceName,
            totalErrors: total,
            uniqueCodes: breakdown.length,
          });
        } else {
          console.warn('[SilentDigest] Failed to send to Telegram:', sendResult.errorMessage);
          result.error = `Telegram send failed: ${sendResult.errorMessage}`;
        }
      } catch (telegramError) {
        const errorMsg = telegramError instanceof Error ? telegramError.message : String(telegramError);
        console.warn('[SilentDigest] Telegram error:', telegramError);
        result.error = `Telegram error: ${errorMsg}`;
      }
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    addBreadcrumb('❌ Silent digest generation failed', {
      service: serviceName,
      error: errorMsg,
    });

    return {
      date,
      totalErrors: 0,
      uniqueCodes: 0,
      codeBreakdown: [],
      durationMs: performance.now() - startTime,
      sentToTelegram: false,
      error: `Generation failed: ${errorMsg}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🧩  الدوال المساعدة
// ═══════════════════════════════════════════════════════════════

function getYesterdayDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

async function listFilesInPrefix(
  b2Store: B2Store,
  prefix: string
): Promise<string[]> {
  try {
    const endpoint = (b2Store as any).endpoint;
    const bucketName = (b2Store as any).bucketName;
    const accessKeyId = (b2Store as any).accessKeyId;
    const secretAccessKey = (b2Store as any).secretAccessKey;

    if (!endpoint || !bucketName) {
      throw new Error('B2Store credentials/configuration missing');
    }

    const url = `${endpoint}/${bucketName}?prefix=${encodeURIComponent(prefix)}`;

    const { AwsClient } = await import('aws4fetch');
    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'us-east-005',
      service: 's3',
    });

    const request = new Request(url, {
      method: 'GET',
      headers: {
        'Host': new URL(url).host,
      },
    });

    const signedRequest = await client.sign(request);
    const response = await fetch(url, {
      headers: signedRequest.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`B2 LIST failed: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    return parseListResponse(text);
  } catch (error) {
    console.warn(`[SilentDigest] Failed to list files in ${prefix}:`, error);
    return [];
  }
}

function parseListResponse(xml: string): string[] {
  const keys: string[] = [];
  const keyRegex = /<Key>([^<]+)<\/Key>/g;
  let match: RegExpExecArray | null;

  while ((match = keyRegex.exec(xml)) !== null) {
    const key = match[1];
    if (!key.endsWith('/')) {
      keys.push(key);
    }
  }

  return keys;
}

function formatSilentDigest(
  result: SilentDigestResult,
  includeStackTraces: boolean = false
): string {
  const lines: string[] = [];

  lines.push(`📊 <b>Silent Errors Summary</b>`);
  lines.push(`📅 <b>Date:</b> ${result.date}`);
  lines.push(`📦 <b>Total Silent Errors:</b> ${result.totalErrors}`);
  lines.push(`🔢 <b>Unique Codes:</b> ${result.uniqueCodes}`);
  lines.push(`⏱️ <b>Generation:</b> ${Math.round(result.durationMs)}ms`);
  lines.push('');

  if (result.totalErrors === 0) {
    lines.push('✅ No silent errors found for this date.');
    return lines.join('\n');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>📋 Code Breakdown</b>');

  for (const item of result.codeBreakdown) {
    const bar = generateBar(item.percentage, 15);
    lines.push(`<b>${item.code}</b> (${item.category})`);
    lines.push(`  • Count: <b>${item.count}</b> (${item.percentage}%) ${bar}`);
    lines.push(`  • Sample: ${item.sample.userMessage}`);
    if (item.sample.storeId) {
      lines.push(`  • Store: ${item.sample.storeId}`);
    }
    lines.push(`  • Time: ${item.sample.timestamp}`);
    lines.push('');
  }

  if (result.codeBreakdown.length > 0) {
    const top = result.codeBreakdown[0];
    if (top.percentage > 60) {
      lines.push('⚠️ <i>Most silent errors are of one type. Consider prioritizing investigation.</i>');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📌 <i>Silent errors are logged only. No alerts were sent for these.</i>');

  return lines.join('\n');
}

function generateBar(percentage: number, maxWidth: number): string {
  const filled = Math.round((percentage / 100) * maxWidth);
  const empty = maxWidth - filled;
  return '█'.repeat(Math.min(filled, maxWidth)) + '░'.repeat(Math.max(empty, 0));
}

export async function silentDigestHandler(env: any): Promise<SilentDigestResult> {
  try {
    return await generateSilentDigest(env, {
      sendToTelegram: true,
      maxErrors: 1000,
      includeStackTraces: false,
      serviceName: 'silent-digest',
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      date: getYesterdayDate(),
      totalErrors: 0,
      uniqueCodes: 0,
      codeBreakdown: [],
      durationMs: 0,
      sentToTelegram: false,
      error: `Handler error: ${errorMsg}`,
    };
  }
}