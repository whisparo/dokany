// src/lib/cache/snapshot-edge.ts

/**
 * ⚡ خفيف ومخصص للـ Edge Runtime / Middleware فقط
 */
export async function getSnapshotVersion(storeId: string): Promise<string | null> {
  try {
    // 💡 يمكنك قراءة الإصدار مباشرة من Cloudflare KV أو Cache API
    // أو عمل fetch مخصص لسيرفر الكاش بدون استدعاء IndexedDB
    const res = await fetch(`https://api.yourdomain.com/store/${storeId}/version`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 } // Cloudflare Caching
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { version: number };
    return String(data.version);
  } catch {
    return null; // Fail-safe
  }
}