// src/workers/handlers/snapshot-handler.ts

import type { Env } from '../../src/lib/env';
import {
  getLatestVersion,
  getSnapshot,
  putSnapshot,
} from '../../src/core/snapshot/cache-manager';
import { buildSnapshot } from '../../src/core/snapshot/builder';
import type { Snapshot } from '../../src/core/snapshot/validator';

export interface SnapshotResponse {
  data?: Snapshot;
  version?: number;
  fromCache?: boolean;
  error?: string;
}

export async function handleSnapshot(
  request: Request,
  env: Env & { DB: D1Database },
  ctx: ExecutionContext,
  storeSlug: string
): Promise<Response> {
  try {
    const isHeadRequest = request.method === 'HEAD';

    // 1️⃣ قراءة الإصدار المطلوب من الـ Header
    const ifNoneMatch = request.headers.get('If-None-Match');
    let clientVersion: number | null = null;

    if (ifNoneMatch && ifNoneMatch.startsWith('v')) {
      const versionStr = ifNoneMatch.slice(1);
      const parsed = parseInt(versionStr, 10);
      if (!isNaN(parsed)) {
        clientVersion = parsed;
      }
    }

    // 2️⃣ قراءة أحدث إصدار من KV
    const latestVersion = await getLatestVersion(storeSlug, env);

    // 3️⃣ إذا لم يكن هناك أي Snapshot (Cache Miss) → Auto Warm-up
    if (!latestVersion) {
      console.log(`🔄 [Snapshot] Cache miss for ${storeSlug}, warming up...`);
      try {
        const newSnapshot = await buildSnapshot(storeSlug, env);
        // نستخدم الـ Timestamp كـ Version موحد ومضمون
        const newVersion = Date.now();
        newSnapshot.version = newVersion;

        await putSnapshot(storeSlug, newVersion, newSnapshot, env);

        return new Response(
          isHeadRequest ? null : JSON.stringify(newSnapshot),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'ETag': `v${newVersion}`,
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Snapshot] Auto warm-up failed for ${storeSlug}:`, message);
        return new Response(
          JSON.stringify({ error: `Failed to build snapshot: ${message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4️⃣ التحقق من If-None-Match
    if (clientVersion !== null && clientVersion === latestVersion) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': `v${latestVersion}`,
        },
      });
    }

    // 5️⃣ جلب Snapshot من KV
    const snapshotData = await getSnapshot(storeSlug, latestVersion, env);
    if (!snapshotData) {
      console.warn(`⚠️ [Snapshot] Version ${latestVersion} exists but no data for ${storeSlug}`);
      try {
        const newSnapshot = await buildSnapshot(storeSlug, env);
        const newVersion = Date.now();
        newSnapshot.version = newVersion;
        
        await putSnapshot(storeSlug, newVersion, newSnapshot, env);

        return new Response(
          isHeadRequest ? null : JSON.stringify(newSnapshot),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'ETag': `v${newVersion}`,
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Snapshot] Recovery failed for ${storeSlug}:`, message);
        return new Response(
          JSON.stringify({ error: `Failed to recover snapshot: ${message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 6️⃣ إرجاع Snapshot مع 200 OK
    return new Response(
      isHeadRequest ? null : JSON.stringify(snapshotData),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': `v${latestVersion}`,
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Snapshot] Unexpected error for ${storeSlug}:`, message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}