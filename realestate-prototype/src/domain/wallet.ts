import type { DbState, ID, LedgerEntry, OpContext, Paise, Payment } from './types';
import { audit, fail, must, nextId, notifyOrg } from './util';
import { formatINR } from './format';

export interface WalletBalance {
  total: Paise;
  held: Paise;
  available: Paise;
}

/** total = succeeded money movements; held = active holds; available = total - held. */
export function walletBalance(s: DbState, cpId: ID): WalletBalance {
  let total = 0;
  for (const e of s.ledger) if (e.cpId === cpId && e.status === 'succeeded') total += e.amount;
  let held = 0;
  for (const h of s.holds) if (h.cpId === cpId && h.state === 'active') held += h.amount;
  return { total, held, available: total - held };
}

export function hasLedgerKey(s: DbState, key: string): LedgerEntry | undefined {
  return s.ledger.find((e) => e.idempotencyKey === key);
}

export function appendLedger(s: DbState, ctx: OpContext, e: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry {
  if (hasLedgerKey(s, e.idempotencyKey)) fail('duplicate_ledger', `Ledger key ${e.idempotencyKey} already used`);
  const entry: LedgerEntry = { ...e, id: nextId(s, 'led'), at: ctx.now };
  s.ledger.push(entry);
  return entry;
}

export const DEMO_TOPUP_AMOUNTS: Paise[] = [100_000, 500_000, 1_000_000]; // INR 1,000 / 5,000 / 10,000

/** Step 1 of a simulated top-up: create a payment intent (no real gateway). */
export function createTopUp(s: DbState, ctx: OpContext, cpId: ID, amount: Paise): Payment {
  must(s.cps, cpId, 'CP');
  if (!Number.isInteger(amount) || amount <= 0) fail('invalid_amount', 'Top-up amount must be a positive whole number of paise');
  if (!DEMO_TOPUP_AMOUNTS.includes(amount)) fail('invalid_amount', 'Demo top-ups are limited to INR 1,000, 5,000 or 10,000');
  const p: Payment = { id: nextId(s, 'pay'), cpId, amount, outcome: 'pending', createdAt: ctx.now, callbacksReceived: 0 };
  s.payments.push(p);
  return p;
}

/**
 * Step 2: the simulated gateway callback. Deduplicated by payment id, so
 * repeated callbacks never credit twice.
 */
export function handlePaymentCallback(s: DbState, ctx: OpContext, paymentId: ID, outcome: 'succeeded' | 'failed'): { credited: boolean; duplicate: boolean } {
  const p = must(s.payments, paymentId, 'Payment');
  p.callbacksReceived += 1;
  const key = `topup:${p.id}`;
  if (p.outcome !== 'pending' || hasLedgerKey(s, key)) {
    audit(s, ctx, 'payment.callback_duplicate_ignored', 'payment', p.id, `outcome=${outcome}`);
    return { credited: false, duplicate: true };
  }
  p.outcome = outcome;
  appendLedger(s, ctx, {
    cpId: p.cpId,
    type: 'top_up',
    amount: outcome === 'succeeded' ? p.amount : 0,
    holdDelta: 0,
    status: outcome,
    ref: p.id,
    idempotencyKey: key,
    memo: outcome === 'succeeded' ? `Demo top-up ${formatINR(p.amount)}` : `Demo top-up ${formatINR(p.amount)} failed — no funds added`,
  });
  audit(s, ctx, `payment.${outcome}`, 'payment', p.id, formatINR(p.amount));
  notifyOrg(s, ctx, p.cpId, {
    title: outcome === 'succeeded' ? 'Demo top-up added' : 'Demo top-up failed',
    body: outcome === 'succeeded' ? `${formatINR(p.amount)} added to your prepaid lead balance.` : `${formatINR(p.amount)} was not added. No money moved.`,
    tone: outcome === 'succeeded' ? 'success' : 'danger',
    link: '/cp/wallet',
  });
  return { credited: outcome === 'succeeded', duplicate: false };
}

export function adminAdjust(s: DbState, ctx: OpContext, cpId: ID, amount: Paise, memo: string) {
  must(s.cps, cpId, 'CP');
  if (!Number.isInteger(amount) || amount === 0) fail('invalid_amount', 'Adjustment must be a non-zero whole number of paise');
  if (!memo.trim()) fail('memo_required', 'Adjustments need a reason');
  const bal = walletBalance(s, cpId);
  if (bal.available + amount < 0) fail('negative_balance', 'Adjustment would make the available balance negative');
  appendLedger(s, ctx, { cpId, type: 'admin_adjustment', amount, holdDelta: 0, status: 'succeeded', ref: 'admin', idempotencyKey: `adj:${s.seq + 1}`, memo });
  audit(s, ctx, 'wallet.admin_adjustment', 'cp', cpId, `${formatINR(amount)} — ${memo}`);
}
