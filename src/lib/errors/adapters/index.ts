// lib/errors/adapters/index.ts
// الإصدار: 1.0.0
// الدور: البوابة الرئيسية للمحولات (Adapters Index)

export {
  TelegramAdapter,
  createTelegramAdapter,
} from './telegram.adapter';

export type {
  TelegramAdapterOptions,
} from './telegram.adapter';