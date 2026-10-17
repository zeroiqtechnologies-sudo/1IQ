/** Demo-only controls. Clearly labelled in the UI and never part of production flows. */
import type { DbState, ID, OpContext } from './types';
import { activeHold, leadingBid, minNextBid, placeBid, settleAuction, startAuction } from './auction';
import { cpEligibility } from './eligibility';
import { walletBalance } from './wallet';
import { audit, fail, must } from './util';
import { submitEnquiry, verifyOtp, qualifyEnquiry } from './enquiry';
import { lakh, crore } from './format';

/** Place the minimum next bid as another eligible CP that can afford it. */
export function simulateCompetingBid(s: DbState, ctx: OpContext, auctionId: ID, opts: { asCpId?: ID; excludeCpId?: ID } = {}) {
  const a = must(s.auctions, auctionId, 'Auction');
  const lead = must(s.leads, a.leadId, 'Lead');
  const leader = leadingBid(s, a.id);
  const amount = minNextBid(s, a);
  const candidates = s.cps.filter((c) => {
    if (opts.asCpId) return c.id === opts.asCpId;
    if (c.id === opts.excludeCpId || c.id === leader?.cpId) return false;
    if (!cpEligibility(s, c.id, lead).eligible) return false;
    const hold = activeHold(s, a.id, c.id)?.amount ?? 0;
    return walletBalance(s, c.id).available + hold >= amount;
  });
  if (!candidates.length) fail('no_competitor', 'No other eligible partner can afford the next bid');
  const cp = candidates[0];
  audit(s, ctx, 'demo.simulated_bid', 'auction', a.id, cp.id);
  return placeBid(s, { ...ctx, actorId: `demo:${cp.id}` }, a.id, cp.id, amount);
}

/** Demo: end an auction now (moves its end time to now, then settles). */
export function demoEndAuctionNow(s: DbState, ctx: OpContext, auctionId: ID) {
  const a = must(s.auctions, auctionId, 'Auction');
  if (a.state !== 'live') fail('not_live', 'Auction is not live');
  a.endsAt = ctx.now;
  audit(s, ctx, 'demo.auction_ended_early', 'auction', a.id);
  return settleAuction(s, ctx, a.id);
}

const NAMES = ['Tanvi Bapat', 'Yash Chavan', 'Mehul Shah', 'Shreya Iyer', 'Omkar Jadhav', 'Pallavi Ghosh', 'Nitin Wagh', 'Ishita Roy'];

/** Demo: create a verified, consented enquiry for a published project. */
export function demoSeedEnquiry(s: DbState, ctx: OpContext, projectId?: ID) {
  const published = s.projects.filter((p) => p.status === 'published');
  const p = (projectId && published.find((x) => x.id === projectId)) || published[s.enquiries.length % published.length];
  if (!p) fail('no_projects', 'No published projects');
  const n = s.enquiries.length + 1;
  const min = Math.min(...p.configs.map((c) => c.priceMin));
  const max = Math.max(...p.configs.map((c) => c.priceMax));
  const e = submitEnquiry(s, { ...ctx, actorId: 'web' }, {
    name: `${NAMES[n % NAMES.length]} (demo)`,
    phone: `+91 98888 ${String(10000 + n * 7).slice(-5)}`,
    email: `demo${n}@example.com`,
    projectId: p.id,
    allowAlternatives: false,
    budgetMin: Math.max(lakh(30), Math.round(min / lakh(10)) * lakh(10)),
    budgetMax: Math.min(crore(4), Math.round(max / lakh(10)) * lakh(10)),
    bhk: [p.configs[0].bhk],
    preferredLocalities: [p.locality],
    timeline: '1_3_months',
    purpose: 'self_use',
    contactPreference: 'call',
    contactTime: 'evening',
    consentShare: true,
    consentMarketing: false,
    source: 'demo:admin-seed',
  });
  verifyOtp(s, { ...ctx, actorId: 'web' }, e.id, '123456');
  audit(s, ctx, 'demo.enquiry_seeded', 'enquiry', e.id);
  return e;
}

/** Demo: qualify with standard evidence and start an auction in one step. */
export function demoQualifyAndStart(s: DbState, ctx: OpContext, enquiryId: ID) {
  const { lead } = qualifyEnquiry(s, ctx, enquiryId, {
    result: 'qualified',
    checks: { contactVerified: true, requirementsComplete: true, timelineConfirmed: true, consentActive: true, duplicateReviewed: true },
    evidence: ['Demo OTP verified', 'Requirement confirmed (demo quick-qualify)'],
  });
  return startAuction(s, ctx, lead!.id);
}
