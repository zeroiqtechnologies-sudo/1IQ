/**
 * Local "backend": a single in-browser state object persisted to localStorage.
 * Each api call runs as an all-or-nothing transaction on a cloned draft —
 * the in-browser stand-in for a database transaction.
 */
import type { DbState, ID, OpContext, Payment, UserAccount } from '../domain/types';
import { buildSeed, SCHEMA_VERSION } from '../data/seed';
import { DomainError } from '../domain/util';
import { createTopUp, handlePaymentCallback } from '../domain/wallet';
import { closeDueAuctions } from '../domain/auction';
import type { AuthService, ClockService, MessagingService, OtpService, PaymentGateway, RealtimeService, Repository } from './interfaces';

const DB_KEY = 'setuhomes-demo-db-v3';
const SESSION_KEY = 'setuhomes-demo-session';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable: demo continues in memory */ }
}
function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const localRepository: Repository = {
  load() {
    const raw = safeGet(DB_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as DbState;
      return s.schemaVersion === SCHEMA_VERSION ? s : null;
    } catch {
      return null;
    }
  },
  save(s) { safeSet(DB_KEY, JSON.stringify(s)); },
  clear() { safeRemove(DB_KEY); },
};

let state: DbState = localRepository.load() ?? buildSeed(Date.now());
localRepository.save(state);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY || e.key === SESSION_KEY) {
      const next = localRepository.load();
      if (next) state = next;
      emit();
    }
  });
}

export const realtime: RealtimeService = {
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
};

export const getState = () => state;

export const clock: ClockService = {
  now: () => Date.now() + state.clockOffsetMs,
  advance(ms) { tx('system', (s) => { s.clockOffsetMs += ms; }); runWorker(); },
};

export interface TxResult<T> { ok: true; value: T }
export interface TxError { ok: false; error: string; code: string }

/** Run an operation atomically. Throws DomainError → nothing is committed. */
export function tx<T>(actorId: ID, fn: (s: DbState, ctx: OpContext) => T): T {
  const draft = structuredClone(state);
  const ctx: OpContext = { now: Date.now() + draft.clockOffsetMs, actorId };
  const value = fn(draft, ctx);
  state = draft;
  localRepository.save(state);
  emit();
  return value;
}

/** Same as tx but returns a result object instead of throwing (for UI handlers). */
export function attempt<T>(actorId: ID, fn: (s: DbState, ctx: OpContext) => T): TxResult<T> | TxError {
  try {
    return { ok: true, value: tx(actorId, fn) };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: 'Something went wrong in the demo service. Try again or reset demo data.', code: 'unexpected' };
  }
}

/** The settlement worker. In production this is a server-side job using server time. */
export function runWorker() {
  const now = clock.now();
  if (state.auctions.some((a) => a.state === 'live' && now >= a.endsAt)) {
    tx('system:settlement-worker', (s, ctx) => closeDueAuctions(s, ctx));
  }
}

export function resetDemo() {
  state = buildSeed(Date.now());
  localRepository.save(state);
  safeRemove(SESSION_KEY);
  emit();
}

// ---------------- Auth (demo role switcher) ----------------
export const auth: AuthService = {
  currentUser() {
    const id = safeGet(SESSION_KEY);
    return (id && state.users.find((u) => u.id === id)) || null;
  },
  signInAs(userId) { safeSet(SESSION_KEY, userId); emit(); },
  signOut() { safeRemove(SESSION_KEY); emit(); },
  demoAccounts(): UserAccount[] {
    const order = { admin: 0, developer: 1, cp: 2, customer: 3 } as const;
    return [...state.users].sort((a, b) => order[a.role] - order[b.role]);
  },
};

// ---------------- Payments (simulated) ----------------
export const payments: PaymentGateway = {
  async startTopUp(cpId, amount, simulate): Promise<Payment> {
    const p = tx(`user_${cpId}`, (s, ctx) => createTopUp(s, ctx, cpId, amount));
    await new Promise((r) => setTimeout(r, 900)); // simulated gateway round-trip
    tx('gateway-sim', (s, ctx) => handlePaymentCallback(s, ctx, p.id, simulate));
    return getState().payments.find((x) => x.id === p.id)!;
  },
  replayCallback(paymentId) {
    const p = state.payments.find((x) => x.id === paymentId);
    return tx('gateway-sim', (s, ctx) => handlePaymentCallback(s, ctx, paymentId, p?.outcome === 'failed' ? 'failed' : 'succeeded'));
  },
};

export const otp: OtpService = {
  async send() {
    await new Promise((r) => setTimeout(r, 600));
    return { hint: 'Demo mode: no SMS is sent. Use code 123456.' };
  },
};

export const messaging: MessagingService = { mode: 'demo-preview-only' };
