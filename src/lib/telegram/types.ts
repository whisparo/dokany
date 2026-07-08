// src/lib/telegram/types.ts
export interface OnboardingSession {
  step: 'phone' | 'name' | 'store' | 'niche' | 'completed';
  phone?: string;
  name?: string;
  storeName?: string;
  nicheAttempts?: number;
}

// ✅ أضف هذا السطر (يعني SessionData هو نفس OnboardingSession)
export type SessionData = OnboardingSession;

export interface ButtonItem {
  text: string;
  callback_data?: string;
  url?: string;
  value?: string;
  [key: string]: string | number | boolean | undefined;
}

export type ButtonRow = ButtonItem[];

export interface HandlerContext {
  platform: 'telegram' | 'web';
  externalId: string;
  message: string;
  contact?: {
    phone_number: string;
    first_name?: string;
    last_name?: string;
    user_id?: number;
  };
  telegramUserId?: string;
  session: OnboardingSession;
}

export interface HandlerResult {
  reply: string;
  buttons?: ButtonRow[];
  persistentButtons?: ButtonRow[];
  session?: Partial<OnboardingSession>;
  action?: string;
}