import type { Auction, AuctionRules, Bid, BidRejectReason, DbState, Hold, ID, OpContext, Paise, Purchase, Assignment } from './types';
import { assertAdmin, audit, byId, customerUserId, fail, must, nextId, notify, notifyOrg, notifyRole } from './util';
import { appendLedger, hasLedgerKey, walletBalance } from './wallet';
import { cpEligibility, eligibleCpIds } from './eligibility';
import { formatINR } from './format';

const TERMINAL: Auction['state'][] = ['assigned', 'expired_no_bids', 'cancelled'];

export function acceptedBids(s: DbState, auctionId: ID): Bid[] {
  return s.bids.filter((b) => b.auctionId === auctionId && b.status === 'accepted');
}

/** Highest accepted amount; ties resolved by earliest accepted sequence. */
export function leadingBid(s: DbState, auctionId: ID): Bid | undefined {
  let best: Bid | undefined;
  for (const b of acceptedBids(s, auctionId)) {
    if (!best || b.amount > best.amount || (b.amount === best.amount && (b.seq ?? 0) < (best.seq ?? 0))) best = b;
  }
  return best;
}

export function minNextBid(s: DbState, a: Auction): Paise {
  const lead = leadingBid(s, a.id);
  return lead ? lead.amount + a.rules.increment : a.rules.startPrice;
}

export function activeHold(s: DbState, auctionId: ID, cpId: ID): Hold | undefined {
  return s.holds.find((h) => h.auctionId === auctionId && h.cpId === cpId && h.state === 'active');
}

export function validateRules(r: AuctionRules) {
  if (!Number.isInteger(r.startPrice) || r.startPrice <= 0) fail('invalid_rules', 'Starting bid must be positive');
  if (!Number.isInteger(r.increment) || r.increment <= 0) fail('invalid_rules', 'Increment must be positive');
  if (r.startPrice % r.increment !== 0) fail('invalid_rules', 'Starting bid must be a multiple of the increment');
  if (r.durationMs < 60_000 || r.durationMs > 24 * 3600_000) fail('invalid_rules', 'Duration must be between 1 minute and 24 hours');
}

/** Start one auction for a qualified lead. Rules are copied onto the auction so later policy changes don't affect it. */
export function startAuction(s: DbState, ctx: OpContext, leadId: ID, rules?: AuctionRules): Auction {
  assertAdmin(s, ctx, 'start an auction');
  const lead = must(s.leads, leadId, 'Lead');
  const enq = must(s.enquiries, lead.enquiryId, 'Enquiry');
  if (enq.consent.withdrawnAt || !enq.consent.shareWithAssignedPartner) fail('no_consent', 'The customer has not given (or has withdrawn) consent to share with a partner');
  if (enq.status === 'assigned' || lead.state === 'assigned' || s.assignments.some((x) => x.enquiryId === enq.id)) fail('already_assigned', 'This enquiry is already assigned. It cannot be auctioned again.');
  const open = s.auctions.find((a) => a.leadId === leadId && !TERMINAL.includes(a.state));
  if (open) fail('auction_exists', 'This lead already has an open auction. One enquiry produces one auction.');
  if (!['qualified', 'unassigned'].includes(enq.status)) fail('not_qualified', `Only qualified enquiries can be auctioned (current: ${enq.status.replace(/_/g, ' ')})`);
  if (!lead.matches.length) fail('no_matches', 'No matching projects — nothing to auction');
  const r = rules ?? s.settings.auctionDefaults;
  validateRules(r);
  const a: Auction = {
    id: nextId(s, 'auc'),
    leadId,
    rules: { ...r },
    state: 'live',
    startsAt: ctx.now,
    endsAt: ctx.now + r.durationMs,
    nextSeq: 1,
    createdBy: ctx.actorId,
  };
  s.auctions.push(a);
  lead.state = 'in_auction';
  lead.eligibleCpIds = eligibleCpIds(s, lead);
  enq.status = 'in_auction';
  enq.updatedAt = ctx.now;
  audit(s, ctx, 'auction.started', 'auction', a.id, `start ${formatINR(r.startPrice)}, +${formatINR(r.increment)}, ${Math.round(r.durationMs / 60000)} min`);
  for (const cpId of lead.eligibleCpIds) {
    notifyOrg(s, ctx, cpId, { title: 'New matching lead auction', body: `A qualified lead for a project you follow is live. Opening bid ${formatINR(r.startPrice)}.`, tone: 'info', link: `/cp/auctions/${a.id}` });
  }
  return a;
}

export interface BidResult {
  ok: boolean;
  bid: Bid;
  reason?: BidRejectReason;
  message?: string;
  minNext: Paise;
}

/**
 * Place a bid. Every rejection is recorded (not thrown) so the bidder and the audit trail see it.
 * Holds: the leader's full bid is held; a leader raising holds only the difference;
 * a new leader's hold and the previous leader's release happen in the same operation.
 */
export function placeBid(s: DbState, ctx: OpContext, auctionId: ID, cpId: ID, amount: Paise): BidResult {
  const a = must(s.auctions, auctionId, 'Auction');
  const lead = must(s.leads, a.leadId, 'Lead');
  const minNext = minNextBid(s, a);

  const reject = (reason: BidRejectReason, message: string): BidResult => {
    const bid: Bid = { id: nextId(s, 'bid'), auctionId, cpId, amount, at: ctx.now, status: 'rejected', rejectReason: reason, rejectMessage: message };
    s.bids.push(bid);
    audit(s, ctx, 'bid.rejected', 'auction', a.id, `${cpId} ${formatINR(amount)}: ${reason}`);
    return { ok: false, bid, reason, message, minNext };
  };

  // Bids are accepted strictly before the closing time.
  if (ctx.now >= a.endsAt && a.state !== 'cancelled') return reject('late', 'Bid arrived after the auction closed');
  if (a.state !== 'live') return reject('auction_not_live', 'This auction is not accepting bids');
  const elig = cpEligibility(s, cpId, lead);
  if (!elig.eligible) {
    const cp = byId(s.cps, cpId);
    const inactive = cp?.reviewStatus === 'suspended' || s.users.filter((u) => u.orgId === cpId).every((u) => u.status !== 'active');
    return reject(inactive ? 'account_inactive' : 'ineligible', elig.reason ?? 'Not eligible');
  }
  if (!Number.isInteger(amount) || amount < minNext) return reject('below_minimum', `Minimum next bid is ${formatINR(minNext)}`);
  if ((amount - a.rules.startPrice) % a.rules.increment !== 0) return reject('invalid_increment', `Bids must move in steps of ${formatINR(a.rules.increment)} from ${formatINR(a.rules.startPrice)}`);

  const current = leadingBid(s, a.id);
  const isLeaderRaise = current?.cpId === cpId;
  const myHold = activeHold(s, a.id, cpId);
  const needed = isLeaderRaise ? amount - (myHold?.amount ?? 0) : amount;
  const bal = walletBalance(s, cpId);
  if (bal.available < needed) return reject('insufficient_funds', `Needs ${formatINR(needed)} available; you have ${formatINR(bal.available)}`);

  const seq = a.nextSeq++;
  const bid: Bid = { id: nextId(s, 'bid'), auctionId, cpId, amount, at: ctx.now, status: 'accepted', seq };
  s.bids.push(bid);

  if (isLeaderRaise && myHold) {
    myHold.amount += needed;
    myHold.updatedAt = ctx.now;
    appendLedger(s, ctx, { cpId, type: 'hold', amount: 0, holdDelta: needed, status: 'succeeded', ref: a.id, idempotencyKey: `hold:${bid.id}`, memo: `Raised own bid to ${formatINR(amount)} — held extra ${formatINR(needed)}` });
  } else {
    // Release previous leader (if any) and reserve the new leader, as one operation.
    if (current) {
      const prevHold = activeHold(s, a.id, current.cpId);
      if (prevHold) {
        prevHold.state = 'released';
        prevHold.updatedAt = ctx.now;
        appendLedger(s, ctx, { cpId: current.cpId, type: 'hold_release', amount: 0, holdDelta: -prevHold.amount, status: 'succeeded', ref: a.id, idempotencyKey: `release:${prevHold.id}:${bid.id}`, memo: `Outbid — released ${formatINR(prevHold.amount)}` });
        notifyOrg(s, ctx, current.cpId, { title: 'You have been outbid', body: `Another partner bid ${formatINR(amount)}. Your ${formatINR(prevHold.amount)} hold was released.`, tone: 'warning', link: `/cp/auctions/${a.id}` });
      }
    }
    // A CP who is not the leader cannot have an active hold on this auction (it was released when outbid).
    const h: Hold = { id: nextId(s, 'hold'), cpId, auctionId: a.id, amount, state: 'active', createdAt: ctx.now, updatedAt: ctx.now };
    s.holds.push(h);
    appendLedger(s, ctx, { cpId, type: 'hold', amount: 0, holdDelta: amount, status: 'succeeded', ref: a.id, idempotencyKey: `hold:${bid.id}`, memo: `Leading bid ${formatINR(amount)} held` });
  }
  audit(s, ctx, 'bid.accepted', 'auction', a.id, `${cpId} ${formatINR(amount)} seq ${seq}`);
  return { ok: true, bid, minNext: amount + a.rules.increment };
}

function releaseAllHolds(s: DbState, ctx: OpContext, a: Auction, memo: string) {
  for (const h of s.holds.filter((x) => x.auctionId === a.id && x.state === 'active')) {
    h.state = 'released';
    h.updatedAt = ctx.now;
    appendLedger(s, ctx, { cpId: h.cpId, type: 'hold_release', amount: 0, holdDelta: -h.amount, status: 'succeeded', ref: a.id, idempotencyKey: `release:${h.id}:final`, memo });
  }
}

export interface SettleResult {
  outcome: 'assigned' | 'expired_no_bids' | 'settlement_failed' | 'already_settled' | 'cancelled';
  purchase?: Purchase;
  assignment?: Assignment;
}

/**
 * Close and settle exactly once. Safe to call repeatedly (idempotent): later calls are no-ops.
 * In production this runs in a server-side worker inside one DB transaction.
 */
export function settleAuction(s: DbState, ctx: OpContext, auctionId: ID, opts: { force?: boolean } = {}): SettleResult {
  const a = must(s.auctions, auctionId, 'Auction');
  if (a.state === 'assigned' || a.state === 'expired_no_bids' || a.state === 'cancelled') {
    return { outcome: a.state === 'assigned' ? 'already_settled' : a.state, purchase: s.purchases.find((p) => p.auctionId === a.id) };
  }
  if (a.state === 'settlement_failed' && !opts.force) return { outcome: 'settlement_failed' };
  if (a.state === 'live') {
    if (ctx.now < a.endsAt) fail('not_closed', 'The auction has not reached its closing time');
    a.state = 'settlement_pending';
    a.closedAt = a.endsAt;
  }
  const lead = must(s.leads, a.leadId, 'Lead');
  const enq = must(s.enquiries, lead.enquiryId, 'Enquiry');
  const winner = leadingBid(s, a.id);

  if (!winner) {
    a.state = 'expired_no_bids';
    a.settledAt = ctx.now;
    lead.state = 'unassigned';
    enq.status = 'unassigned';
    enq.updatedAt = ctx.now;
    audit(s, ctx, 'auction.expired_no_bids', 'auction', a.id);
    notifyRole(s, ctx, 'admin', { title: 'Auction expired with no bids', body: 'No partner bid. The lead can be reviewed and relaunched.', tone: 'warning', link: `/admin/auctions/${a.id}` });
    return { outcome: 'expired_no_bids' };
  }

  const settlementKey = `settle:${a.id}`;
  const failWith = (reason: string): SettleResult => {
    a.state = 'settlement_failed';
    a.failureReason = reason;
    audit(s, ctx, 'auction.settlement_failed', 'auction', a.id, reason);
    notifyRole(s, ctx, 'admin', { title: 'Settlement failed — review needed', body: reason, tone: 'danger', link: `/admin/auctions/${a.id}` });
    // Holds stay in place pending admin review; the lead is NOT passed to the runner-up.
    return { outcome: 'settlement_failed' };
  };

  if (a.demoFailSettlement && !opts.force) return failWith('Demo: simulated settlement failure');
  if (enq.consent.withdrawnAt) {
    // Consent withdrawn before settlement — cancel, release all holds.
    return { outcome: cancelAuctionInner(s, ctx, a, 'Customer withdrew consent before settlement') };
  }
  if (hasLedgerKey(s, settlementKey) || s.assignments.some((x) => x.enquiryId === enq.id)) return failWith('A purchase or assignment already exists for this enquiry');
  const hold = activeHold(s, a.id, winner.cpId);
  if (!hold || hold.amount !== winner.amount) return failWith('Winning hold missing or does not match winning bid');
  const bal = walletBalance(s, winner.cpId);
  if (bal.total < winner.amount) return failWith('Winner total balance is below the winning amount');

  // Consume hold + debit total (net available effect: zero, since it was already held).
  hold.state = 'consumed';
  hold.updatedAt = ctx.now;
  const purchaseId = nextId(s, 'pur');
  const led = appendLedger(s, ctx, { cpId: winner.cpId, type: 'lead_purchase', amount: -winner.amount, holdDelta: -winner.amount, status: 'succeeded', ref: purchaseId, idempotencyKey: settlementKey, memo: `Lead purchase — auction ${a.id}` });
  const purchase: Purchase = { id: purchaseId, receiptNo: `DEMO-RCPT-${purchaseId.split('_')[1]}`, auctionId: a.id, leadId: lead.id, cpId: winner.cpId, amount: winner.amount, ledgerEntryId: led.id, at: ctx.now };
  s.purchases.push(purchase);
  const asg: Assignment = { id: nextId(s, 'asg'), leadId: lead.id, enquiryId: enq.id, cpId: winner.cpId, purchaseId, stage: 'new', at: ctx.now };
  s.assignments.push(asg);
  s.activities.push({ id: nextId(s, 'act'), assignmentId: asg.id, kind: 'system', text: `Lead purchased for ${formatINR(winner.amount)} (receipt ${purchase.receiptNo})`, at: ctx.now, actorId: 'system' });
  // Any other stray active holds (should be none) are released.
  releaseAllHolds(s, ctx, a, 'Auction settled — hold released');

  a.state = 'assigned';
  a.settlementKey = settlementKey;
  a.settledAt = ctx.now;
  lead.state = 'assigned';
  enq.status = 'assigned';
  enq.updatedAt = ctx.now;
  audit(s, ctx, 'auction.settled', 'auction', a.id, `winner ${winner.cpId} ${formatINR(winner.amount)}`);

  notifyOrg(s, ctx, winner.cpId, { title: 'You won a lead', body: `Charged ${formatINR(winner.amount)}. Customer contact details are now available.`, tone: 'success', link: `/cp/leads/${asg.id}` });
  const losers = new Set(acceptedBids(s, a.id).map((b) => b.cpId).filter((c) => c !== winner.cpId));
  for (const l of losers) notifyOrg(s, ctx, l, { title: 'Auction closed — not won', body: 'Another partner won. You were not charged and any hold was released.', tone: 'info', link: `/cp/auctions/${a.id}` });
  notify(s, ctx, customerUserId(enq.customerId), { title: 'A partner has been assigned', body: 'One verified partner will contact you about your enquiry.', tone: 'success', link: `/my-enquiries/${enq.id}` });
  return { outcome: 'assigned', purchase, assignment: asg };
}

function cancelAuctionInner(s: DbState, ctx: OpContext, a: Auction, reason: string): 'cancelled' {
  releaseAllHolds(s, ctx, a, `Auction cancelled — hold released`);
  a.state = 'cancelled';
  a.cancelReason = reason;
  a.closedAt = ctx.now;
  const lead = must(s.leads, a.leadId, 'Lead');
  const enq = must(s.enquiries, lead.enquiryId, 'Enquiry');
  lead.state = enq.consent.withdrawnAt ? 'cancelled' : 'unassigned';
  if (enq.status !== 'withdrawn') enq.status = enq.consent.withdrawnAt ? 'withdrawn' : 'unassigned';
  enq.updatedAt = ctx.now;
  audit(s, ctx, 'auction.cancelled', 'auction', a.id, reason);
  const bidders = new Set(acceptedBids(s, a.id).map((b) => b.cpId));
  for (const c of bidders) notifyOrg(s, ctx, c, { title: 'Auction cancelled', body: 'The auction was cancelled. Your hold was released and nothing was charged.', tone: 'info', link: `/cp/auctions/${a.id}` });
  return 'cancelled';
}

export function cancelAuction(s: DbState, ctx: OpContext, auctionId: ID, reason: string) {
  assertAdmin(s, ctx, 'cancel an auction');
  return cancelAuctionUnchecked(s, ctx, auctionId, reason);
}

/** System path (customer consent withdrawal): cancels without an admin actor. */
export function cancelAuctionUnchecked(s: DbState, ctx: OpContext, auctionId: ID, reason: string) {
  const a = must(s.auctions, auctionId, 'Auction');
  if (TERMINAL.includes(a.state)) fail('terminal', `Auction is already ${a.state.replace(/_/g, ' ')}`);
  return cancelAuctionInner(s, ctx, a, reason);
}

/** The "settlement worker": close every live auction whose end time has passed. */
export function closeDueAuctions(s: DbState, ctx: OpContext): SettleResult[] {
  const due = s.auctions.filter((a) => a.state === 'live' && ctx.now >= a.endsAt);
  return due.map((a) => settleAuction(s, ctx, a.id));
}

export function retrySettlement(s: DbState, ctx: OpContext, auctionId: ID) {
  assertAdmin(s, ctx, 'retry a settlement');
  const a = must(s.auctions, auctionId, 'Auction');
  if (a.state !== 'settlement_failed') fail('not_failed', 'Only failed settlements can be retried');
  a.demoFailSettlement = false;
  audit(s, ctx, 'auction.settlement_retry', 'auction', a.id);
  return settleAuction(s, ctx, a.id, { force: true });
}

/** Admin sets the default opening bid, increment and duration for future auctions. */
export function setAuctionDefaults(s: DbState, ctx: OpContext, r: AuctionRules) {
  assertAdmin(s, ctx, 'change auction rules');
  validateRules(r);
  s.settings.auctionDefaults = { ...r };
  audit(s, ctx, 'settings.auction_defaults', 'settings', 'auction', `start ${formatINR(r.startPrice)}, +${formatINR(r.increment)}, ${Math.round(r.durationMs / 60000)} min`);
}

export type CpAuctionStatus = 'none' | 'leading' | 'outbid' | 'won' | 'lost';

export function cpAuctionStatus(s: DbState, a: Auction, cpId: ID): CpAuctionStatus {
  const mine = acceptedBids(s, a.id).filter((b) => b.cpId === cpId);
  if (!mine.length) return 'none';
  const lead = leadingBid(s, a.id);
  if (a.state === 'assigned') {
    const pur = s.purchases.find((p) => p.auctionId === a.id);
    return pur?.cpId === cpId ? 'won' : 'lost';
  }
  if (a.state === 'cancelled' || a.state === 'expired_no_bids') return 'lost';
  return lead?.cpId === cpId ? 'leading' : 'outbid';
}
