// src/lib/auth-types.d.ts
import { User as BetterAuthUser, Session as BetterAuthSession } from "better-auth";

declare module "better-auth" {
  interface User {
    phoneNumber?: string | null;
    telegramId?: string | null;
    telegramUsername?: string | null;
    telegramChatId?: string | null;
    backupPin?: string | null;
    merchantId?: string | null;
    status?: string | null;
    role?: string | null;
  }
  interface Session {
    user: User;
  }
}