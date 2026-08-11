// src/lib/utils/id.ts
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `id_${timestamp}_${randomStr}`;
}