/**
 * Replaceable integration boundaries. The prototype ships local, simulated
 * implementations (see ./local). Production replaces each with a server-backed
 * adapter without changing UI code, which only talks to `api` and these ports.
 */
import type { DbState, ID, Millis, Payment, Paise, UserAccount } from '../domain/types';

/** Authoritative time. Production: server time; never trust the browser clock for closing. */
export interface ClockService {
  now(): Millis;
  /** Demo only. */
  advance(ms: Millis): void;
}

/** Demo role switcher. NOT secure authentication: production needs server sessions + server-side authorization. */
export interface AuthService {
  currentUser(): UserAccount | null;
  signInAs(userId: ID): void;
  signOut(): void;
  demoAccounts(): UserAccount[];
}

/** Simulated prepaid top-ups. Production: payment gateway + verified webhooks. */
export interface PaymentGateway {
  startTopUp(cpId: ID, amount: Paise, simulate: 'succeeded' | 'failed'): Promise<Payment>;
  /** Demo: re-deliver a callback to show deduplication. */
  replayCallback(paymentId: ID): { duplicate: boolean };
}

/** Simulated OTP. Production: SMS provider with rate limits and server-side verification. */
export interface OtpService {
  send(phone: string): Promise<{ hint: string }>;
}

/** Outbound messaging. The prototype never sends calls, SMS, WhatsApp or email. */
export interface MessagingService {
  readonly mode: 'demo-preview-only';
}

/** Change feed. Local impl: same-tab listeners + cross-tab `storage` events. Production: authenticated websockets. */
export interface RealtimeService {
  subscribe(listener: () => void): () => void;
}

/** Persistence. Local impl: localStorage. Production: relational DB with transactions. */
export interface Repository {
  load(): DbState | null;
  save(s: DbState): void;
  clear(): void;
}
