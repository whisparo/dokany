// src/types/cloudflare.d.ts

import type { Env } from '@/lib/env';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CloudflareEnv extends Env {}
}

export {};