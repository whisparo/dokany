// src/core/snapshot/orchestrator.ts

/**
 * Orchestrator: ينسق عملية بناء Snapshot كاملة
 * المسار: قراءة D1 → بناء JSON Tree → التحقق (Zod) → كتابة KV → تحديث الإصدار
 */

import type { Env } from '@/lib/env';
import { buildSnapshot, type BuildSnapshotOptions } from './builder';
import { validateSnapshot, type Snapshot } from './validator';
import {
  putSnapshot,
  getLatestVersion,
  invalidateOldVersions,
} from './cache-manager';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

export interface OrchestratorOptions {
  /** الاحتفاظ بعدد محدد من الإصدارات القديمة (افتراضي: 5) */
  keepVersions?: number;
  /** TTL للإصدارات الجديدة بالثواني (افتراضي: 7 أيام) */
  ttlSeconds?: number;
  /** تجاهل التحقق من صحة البيانات (للتطوير فقط) */
  skipValidation?: boolean;
}

export interface OrchestratorResult {
  success: boolean;
  version?: number;
  snapshot?: Snapshot;
  error?: string;
}

// ============================================================
// 🧠 الدالة الرئيسية: orchestrateBuild
// ============================================================

/**
 * تنسيق عملية بناء Snapshot كاملة
 * @param storeId - معرف المتجر (للبناء من D1)
 * @param env - بيئة Worker (تحتوي على DB و BUFFER_KV)
 * @param options - خيارات إضافية
 */
export async function orchestrateBuild(
  storeId: string,
  env: Env,
  options: OrchestratorOptions = {}
): Promise<OrchestratorResult> {
  const {
    keepVersions = 5,
    ttlSeconds = 604800, // 7 أيام
    skipValidation = false,
  } = options;

  console.log(`🏗️ Starting snapshot build for store: ${storeId}`);

  try {
    // ============================================================
    // 1️⃣ قراءة البيانات من D1 وبناء JSON Tree
    // ============================================================
    console.log(`📥 Fetching data from D1 for store: ${storeId}`);
    const buildOptions: BuildSnapshotOptions = {
      includeInactive: false, // لا نضمّن المنتجات غير النشطة
      includeDeleted: false, // لا نضمّن المنتجات المحذوفة
    };

    const snapshotData = await buildSnapshot(storeId, env, buildOptions);

    if (!snapshotData) {
      return {
        success: false,
        error: `Failed to build snapshot data for store: ${storeId}`,
      };
    }

    console.log(`✅ Snapshot data built for store: ${storeId}`);

    // ============================================================
    // 2️⃣ التحقق من صحة الـ Snapshot عبر Zod
    // ============================================================
    let validatedSnapshot: Snapshot = snapshotData;

    if (!skipValidation) {
      console.log(`🔍 Validating snapshot for store: ${storeId}`);
      const validation = validateSnapshot(snapshotData);

      if (!validation.success) {
        const errorMessages = validation.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');

        console.error(`❌ Snapshot validation failed: ${errorMessages}`);

        return {
          success: false,
          error: `Snapshot validation failed: ${errorMessages}`,
        };
      }

      validatedSnapshot = validation.data;
      console.log(`✅ Snapshot validation passed for store: ${storeId}`);
    }

    // ============================================================
    // 3️⃣ حساب الإصدار الجديد
    // ============================================================
    const currentVersion = await getLatestVersion(validatedSnapshot.slug, env);
    const newVersion = (currentVersion || 0) + 1;

    console.log(`📌 New version: v${newVersion} (previous: v${currentVersion || 'none'})`);

    // ============================================================
    // 4️⃣ كتابة الـ Snapshot في KV (Atomic)
    // ============================================================
    console.log(`💾 Writing snapshot to KV: store:${validatedSnapshot.slug}:v${newVersion}`);
    await putSnapshot(
      validatedSnapshot.slug,
      newVersion,
      validatedSnapshot,
      env,
      ttlSeconds
    );

    console.log(`✅ Snapshot stored successfully: v${newVersion}`);

    // ============================================================
    // 5️⃣ تنظيف الإصدارات القديمة باستدعاء cache-manager
    // ============================================================
    if (keepVersions > 0) {
      await invalidateOldVersions(validatedSnapshot.slug, env, keepVersions);
      console.log(`🧹 Old versions cleanup triggered (keeping last ${keepVersions})`);
    }

    // ============================================================
    // 6️⃣ إرجاع النتيجة
    // ============================================================
    return {
      success: true,
      version: newVersion,
      snapshot: validatedSnapshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown orchestration error';
    console.error(`❌ Orchestration failed for store ${storeId}:`, error);

    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 🚀 دالة تشغيل البناء من لوحة التحكم (Server Action / API)
// ============================================================

/**
 * تشغيل عملية بناء Snapshot من لوحة التحكم
 */
export async function triggerBuild(
  storeId: string,
  env: Env,
  options: OrchestratorOptions = {}
): Promise<OrchestratorResult> {
  console.log(`🔨 Triggering build for store: ${storeId} (from dashboard)`);

  try {
    const storeExists = await checkStoreExists(storeId, env);
    if (!storeExists) {
      return {
        success: false,
        error: `Store not found: ${storeId}`,
      };
    }

    const result = await orchestrateBuild(storeId, env, options);

    if (result.success) {
      console.log(`✅ Build completed successfully for store: ${storeId}`);
    } else {
      console.error(`❌ Build failed for store: ${storeId}`, result.error);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to trigger build';
    console.error(`❌ Trigger build failed for store ${storeId}:`, error);
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 🧠 دوال مساعدة
// ============================================================

/**
 * التحقق من وجود المتجر في D1
 */
async function checkStoreExists(
  storeId: string,
  env: Env
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      `SELECT id FROM stores WHERE id = ?`
    ).bind(storeId).first();

    return !!result;
  } catch (error) {
    console.error(`❌ Failed to check store existence for ${storeId}:`, error);
    return false;
  }
}

// ============================================================
// 📦 إعادة تصدير الأنواع
// ============================================================

export type { Snapshot } from './validator';