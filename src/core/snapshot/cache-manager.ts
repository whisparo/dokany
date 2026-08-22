// src/core/snapshot/cache-manager.ts

import type { Env } from '@/lib/env';
import type { Snapshot } from './validator';

/**
 * إدارة Snapshots في Cloudflare KV مع دعم الإصدارات (Versioning)
 * المفاتيح:
 *   - store:{slug}:latest  → "v{version}"
 *   - store:{slug}:v{version} → { JSON Snapshot }
 */

// ============================================================
// 📤 دوال الكتابة (Atomic Write)
// ============================================================

/**
 * كتابة Snapshot جديد في KV مع تحديث المؤشر `latest` بشكل التوازي
 */
export async function putSnapshot(
  slug: string,
  version: number,
  data: Snapshot,
  env: Env,
  ttlSeconds: number = 604800 // 7 أيام
): Promise<void> {
  const versionKey = `store:${slug}:v${version}`;
  const latestKey = `store:${slug}:latest`;

  try {
    // تنفيذ الكتابتين في نفس الوقت لتقليل الـ Latency
    await Promise.all([
      env.BUFFER_KV.put(versionKey, JSON.stringify(data), {
        expirationTtl: ttlSeconds,
      }),
      env.BUFFER_KV.put(latestKey, `v${version}`),
    ]);

    console.log(`✅ Snapshot stored: ${versionKey} (version ${version})`);
  } catch (error) {
    console.error(`❌ Failed to store snapshot for ${slug}:`, error);
    throw new Error(`KV write failed for snapshot ${slug} v${version}`);
  }
}

// ============================================================
// 📥 دوال القراءة
// ============================================================

/**
 * قراءة أحدث إصدار من KV
 */
export async function getLatestVersion(
  slug: string,
  env: Env
): Promise<number | null> {
  const latestKey = `store:${slug}:latest`;
  const versionTag = await env.BUFFER_KV.get(latestKey);

  if (!versionTag) {
    return null;
  }

  const match = versionTag.match(/^v(\d+)$/);
  if (!match) {
    console.warn(`⚠️ Invalid latest version tag: ${versionTag}`);
    return null;
  }

  return parseInt(match[1], 10);
}

/**
 * قراءة Snapshot محدد من KV بدون الحاجة لـ JSON.parse يدوية
 */
export async function getSnapshot(
  slug: string,
  version: number,
  env: Env
): Promise<Snapshot | null> {
  const versionKey = `store:${slug}:v${version}`;
  
  try {
    // الاستفادة من الـ Built-in JSON Parser للـ KV
    const snapshot = await env.BUFFER_KV.get<Snapshot>(versionKey, { type: 'json' });
    return snapshot;
  } catch (error) {
    console.error(`❌ Failed to parse snapshot ${versionKey}:`, error);
    return null;
  }
}

/**
 * قراءة أحدث Snapshot من KV
 */
export async function getLatestSnapshot(
  slug: string,
  env: Env
): Promise<Snapshot | null> {
  const version = await getLatestVersion(slug, env);
  if (version === null) {
    return null;
  }
  return getSnapshot(slug, version, env);
}

// ============================================================
// 🗑️ دوال الحذف والإبطال
// ============================================================

export async function invalidateSnapshot(
  slug: string,
  version: number,
  env: Env
): Promise<void> {
  const versionKey = `store:${slug}:v${version}`;
  await env.BUFFER_KV.delete(versionKey);
  console.log(`🗑️ Snapshot invalidated: ${versionKey}`);
}

export async function invalidateOldVersions(
  slug: string,
  env: Env,
  keepVersions: number = 5
): Promise<void> {
  const latestVersion = await getLatestVersion(slug, env);
  if (latestVersion === null) {
    return;
  }

  const prefix = `store:${slug}:v`;
  const listResult = await env.BUFFER_KV.list({ prefix });

  const versions: number[] = [];
  for (const key of listResult.keys) {
    const match = key.name.match(/^store:.+:v(\d+)$/);
    if (match) {
      versions.push(parseInt(match[1], 10));
    }
  }

  versions.sort((a, b) => b - a);

  const versionsToKeep = new Set(versions.slice(0, keepVersions));
  const deletePromises: Promise<void>[] = [];

  for (const v of versions) {
    if (!versionsToKeep.has(v)) {
      deletePromises.push(invalidateSnapshot(slug, v, env));
    }
  }

  await Promise.all(deletePromises);
}

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

export async function hasSnapshot(slug: string, env: Env): Promise<boolean> {
  const latestVersion = await getLatestVersion(slug, env);
  if (latestVersion === null) {
    return false;
  }
  const snapshot = await getSnapshot(slug, latestVersion, env);
  return snapshot !== null;
}

export async function getAllVersions(
  slug: string,
  env: Env
): Promise<number[]> {
  const prefix = `store:${slug}:v`;
  const listResult = await env.BUFFER_KV.list({ prefix });

  const versions: number[] = [];
  for (const key of listResult.keys) {
    const match = key.name.match(/^store:.+:v(\d+)$/);
    if (match) {
      versions.push(parseInt(match[1], 10));
    }
  }

  return versions.sort((a, b) => a - b);
}