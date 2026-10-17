import { buildSeed } from '../data/seed';
import type { DbState, OpContext } from './types';
import { walletBalance, createTopUp, handlePaymentCallback } from './wallet';
import { submitEnquiry, verifyOtp, qualifyEnquiry, withdrawConsent, resolveDuplicate, type EnquiryInput } from './enquiry';
import { placeBid, settleAuction, startAuction, cancelAuction, closeDueAuctions, retrySettlement } from './auction';

import { cpEligibility } from './eligibility';
import { toAuctionPreview, readPurchasedContact } from './views';
import { raiseDispute, decideDispute } from './crm';
import { createProject, updateProject, moderateProject, publicProjects, setInterest, setCpApprovalRequired, decideInterest } from './projects';
import { lakh, crore, rupees } from './format';
import { DomainError } from './util';

const T0 = Date.UTC(2026, 9, 17, 6, 30); // 12:00 IST
const MIN = 60_000;
let s: DbState;
let t: number;
const ctx = (actorId = 'user_admin', dt = 0): OpContext => ({ now: t + dt, actorId });
const checks = { contactVerified: true, requirementsComplete: true, timelineConfirmed: true, consentActive: true, duplicateReviewed: true };

function input(over: Partial<EnquiryInput> = {}): EnquiryInput {
  return {
    name: 'Test Buyer', phone: '9876500001', email: 'buyer@example.com', projectId: 'prj_1', allowAlternatives: false,
    budgetMin: lakh(95), budgetMax: crore(1.2), bhk: [2], preferredLocalities: ['Baner'], timeline: '1_3_months', purpose: 'self_use',
    contactPreference: 'call', contactTime: 'evening', message: 'Secret note: call after 6', consentShare: true, consentMarketing: false, source: 'test', ...over,
  };
}

/** Fresh qualified lead + live auction on Sahyadri Skyline (prj_1). Interested: cp_1, cp_2, cp_4. */
function liveAuction(over: Partial<EnquiryInput> = {}) {
  const e = submitEnquiry(s, ctx('web'), input(over));
  verifyOtp(s, ctx('web'), e.id, '123456');
  const { lead } = qualifyEnquiry(s, ctx(), e.id, { result: 'qualified', checks, evidence: ['OTP verified'], internalNote: 'INTERNAL-ONLY-NOTE' });
  const a = startAuction(s, ctx(), lead!.id);
  return { e, lead: lead!, a };
}

const bid = (aid: string, cp: string, inr: number, dt = 0) => placeBid(s, ctx(`user_${cp}`, dt), aid, cp, rupees(inr));

beforeEach(() => {
  t = T0;
  s = buildSeed(T0);
});

describe('seed', () => {
  it('has the required demo volumes and consistent states', () => {
    expect(s.projects).toHaveLength(12);
    expect(s.developers).toHaveLength(3);
    expect(s.cps).toHaveLength(6);
    expect(s.enquiries).toHaveLength(15);
    expect(s.auctions).toHaveLength(6);
    const states = s.auctions.map((a) => a.state).sort();
    expect(states).toEqual(['assigned', 'assigned', 'cancelled', 'expired_no_bids', 'live', 'live']);
    expect(new Set(s.projects.filter((p) => p.status === 'published').map((p) => p.locality))).toEqual(new Set(['Baner', 'Wakad', 'Hinjawadi', 'Kharadi', 'Hadapsar', 'Tathawade']));
  });
  it('is deterministic for the same seed time', () => {
    expect(JSON.stringify(buildSeed(T0))).toEqual(JSON.stringify(buildSeed(T0)));
  });
});

describe('listings & permissions', () => {
  it('a submitted project stays out of public search until approved and published', () => {
    const draft = { ...s.projects[0], name: 'Test Towers' } as never as Parameters<typeof createProject>[3];
    const p = createProject(s, ctx('user_dev_1'), 'dev_1', draft);
    expect(publicProjects(s).some((x) => x.id === p.id)).toBe(false);
    expect(() => moderateProject(s, ctx(), p.id, 'approve')).toThrow(/submitted/); // drafts can't be approved
    p.status = 'submitted';
    moderateProject(s, ctx(), p.id, 'approve');
    expect(publicProjects(s).some((x) => x.id === p.id)).toBe(false); // approved but not yet published
    moderateProject(s, ctx(), p.id, 'publish');
    expect(publicProjects(s).some((x) => x.id === p.id)).toBe(true);
  });
  it('rejects CP listing creation and cross-developer edits', () => {
    const d = { ...s.projects[0] } as never as Parameters<typeof createProject>[3];
    expect(() => createProject(s, ctx('user_cp_1'), 'dev_1', d)).toThrow(/CPs and customers cannot list/);
    expect(() => updateProject(s, ctx('user_dev_2'), 'dev_2', 'prj_1', { name: 'Hijack' })).toThrow(/own projects/);
    expect(() => updateProject(s, ctx('user_dev_2'), 'dev_1', 'prj_1', { name: 'Hijack' })).toThrow();
  });
  it('material change to a published listing returns it to review', () => {
    const r = updateProject(s, ctx('user_dev_1'), 'dev_1', 'prj_2', { possession: '2027-01' });
    expect(r.returnedToReview).toBe(true);
    expect(s.projects.find((p) => p.id === 'prj_2')!.status).toBe('submitted');
    expect(publicProjects(s).some((p) => p.id === 'prj_2')).toBe(false);
  });
});

describe('qualification gates', () => {
  it('raw and unverified enquiries cannot be auctioned', () => {
    const e = submitEnquiry(s, ctx('web'), input());
    expect(e.status).toBe('verification_pending');
    expect(() => qualifyEnquiry(s, ctx(), e.id, { result: 'qualified', checks, evidence: ['x'] })).toThrow(DomainError);
    expect(s.leads.some((l) => l.enquiryId === e.id)).toBe(false);
  });
  it('a withdrawn enquiry cannot be auctioned', () => {
    const e = submitEnquiry(s, ctx('web'), input());
    verifyOtp(s, ctx('web'), e.id, '123456');
    const { lead } = qualifyEnquiry(s, ctx(), e.id, { result: 'qualified', checks, evidence: ['x'] });
    withdrawConsent(s, ctx('web'), e.id);
    expect(() => startAuction(s, ctx(), lead!.id)).toThrow(/consent/);
  });
  it('flags duplicate phones for review but allows a legitimate repeat', () => {
    const a = submitEnquiry(s, ctx('web'), input());
    const b = submitEnquiry(s, ctx('web'), input({ projectId: 'prj_8', budgetMin: crore(2), budgetMax: crore(2.5), bhk: [3] }));
    expect(b.duplicateOf).toContain(a.id);
    verifyOtp(s, ctx('web'), b.id, '123456');
    expect(() => qualifyEnquiry(s, ctx(), b.id, { result: 'qualified', checks, evidence: ['x'] })).toThrow(/duplicate/);
    resolveDuplicate(s, ctx(), b.id, 'cleared');
    expect(qualifyEnquiry(s, ctx(), b.id, { result: 'qualified', checks, evidence: ['x'] }).lead).toBeTruthy();
  });
  it('project-specific enquiries stay with their project unless alternatives are allowed', () => {
    const { lead } = liveAuction();
    expect(lead.matches.map((m) => m.projectId)).toEqual(['prj_1']);
    t += MIN;
    const { lead: l2 } = liveAuction({ phone: '9876500002', allowAlternatives: true, bhk: [2, 3], budgetMin: lakh(80), budgetMax: crore(1.3), preferredLocalities: ['Baner', 'Hinjawadi'] });
    expect(l2.matches[0].projectId).toBe('prj_1');
    expect(l2.matches.length).toBeGreaterThan(1);
    expect(s.auctions.filter((a) => a.leadId === l2.id)).toHaveLength(1); // one auction even with several matches
  });
  it('one enquiry produces one open auction', () => {
    const { lead } = liveAuction();
    expect(() => startAuction(s, ctx(), lead.id)).toThrow(/already has an open auction/);
  });
});

describe('eligibility & masking', () => {
  it('only approved, active CPs interested in a matched project are eligible', () => {
    const { lead } = liveAuction();
    expect(cpEligibility(s, 'cp_1', lead).eligible).toBe(true);
    expect(cpEligibility(s, 'cp_3', lead).eligible).toBe(false); // not interested
    expect(cpEligibility(s, 'cp_3', lead).reason).toMatch(/Interested/);
    setInterest(s, ctx('user_cp_5'), 'cp_5', 'prj_1', true);
    expect(cpEligibility(s, 'cp_5', lead).reason).toMatch(/under review/);
    expect(cpEligibility(s, 'cp_6', { ...lead, matches: [{ projectId: 'prj_6', reasons: [], primary: true }] }).reason).toMatch(/suspended/);
  });
  it('respects optional developer approval', () => {
    const { lead, a } = liveAuction();
    setCpApprovalRequired(s, ctx('user_dev_1'), 'dev_1', 'prj_1', true);
    expect(cpEligibility(s, 'cp_1', lead).eligible).toBe(false);
    expect(bid(a.id, 'cp_1', 500).reason).toBe('ineligible');
    const it = s.interests.find((i) => i.cpId === 'cp_1' && i.projectId === 'prj_1')!;
    decideInterest(s, ctx('user_dev_1'), 'dev_1', it.id, true);
    expect(bid(a.id, 'cp_1', 500).ok).toBe(true);
  });
  it('auction previews never contain customer identity, contact or private notes', () => {
    const { a } = liveAuction();
    bid(a.id, 'cp_1', 500);
    const json = JSON.stringify(toAuctionPreview(s, a, 'cp_2'));
    for (const secret of ['Test Buyer', '9876500001', '98765', 'buyer@example.com', 'Secret note', 'INTERNAL-ONLY-NOTE', 'cus_']) expect(json).not.toContain(secret);
  });
  it('contact details are readable only by the winning CP', () => {
    const { a } = liveAuction();
    bid(a.id, 'cp_1', 500);
    t += 11 * MIN;
    const r = settleAuction(s, ctx('system'), a.id);
    expect(readPurchasedContact(s, 'cp_1', r.assignment!.id).phone).toBe('9876500001');
    expect(() => readPurchasedContact(s, 'cp_2', r.assignment!.id)).toThrow(/only available to the partner who won/);
  });
});

describe('bids, holds and balances', () => {
  it('holds the full bid, releases on outbid, and holds only the increment on a raise', () => {
    const { a } = liveAuction();
    const b1 = walletBalance(s, 'cp_1');
    expect(bid(a.id, 'cp_1', 500).ok).toBe(true);
    expect(walletBalance(s, 'cp_1').held - b1.held).toBe(rupees(500));
    expect(walletBalance(s, 'cp_1').total).toBe(b1.total); // holds don't change total
    expect(bid(a.id, 'cp_2', 600).ok).toBe(true);
    expect(walletBalance(s, 'cp_1').held).toBe(b1.held); // released immediately
    const b2 = walletBalance(s, 'cp_2');
    expect(bid(a.id, 'cp_2', 800).ok).toBe(true); // leader raise
    expect(walletBalance(s, 'cp_2').held - b2.held).toBe(rupees(200));
    expect(s.holds.filter((h) => h.auctionId === a.id && h.state === 'active')).toHaveLength(1);
  });
  it('one balance funds all auctions: competing auctions cannot reserve more than available', () => {
    const one = liveAuction();
    t += MIN;
    const two = liveAuction({ phone: '9876500003' });
    // cp_3 has ₹1,000. Make it interested in prj_1 so it is eligible on both.
    setInterest(s, ctx('user_cp_3'), 'cp_3', 'prj_1', true);
    expect(bid(one.a.id, 'cp_3', 700).ok).toBe(true);
    const r = bid(two.a.id, 'cp_3', 500);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_funds');
    expect(walletBalance(s, 'cp_3').available).toBe(rupees(300));
    expect(bid(two.a.id, 'cp_3', 300).reason).toBe('below_minimum');
  });
  it('rejects late, below-minimum, invalid-increment and tied bids', () => {
    const { a } = liveAuction();
    expect(bid(a.id, 'cp_1', 400).reason).toBe('below_minimum');
    expect(bid(a.id, 'cp_1', 550).reason).toBe('invalid_increment');
    expect(bid(a.id, 'cp_1', 600).ok).toBe(true);
    const tie = bid(a.id, 'cp_2', 600);
    expect(tie.ok).toBe(false);
    expect(tie.message).toMatch(/700/); // told the new minimum
    expect(bid(a.id, 'cp_2', 700, 10 * MIN).reason).toBe('late'); // exactly at close is late
    expect(bid(a.id, 'cp_2', 700, 10 * MIN - 1).ok).toBe(true); // strictly before close
  });
  it('rejects bids from suspended accounts', () => {
    const { a } = liveAuction({ projectId: 'prj_6', budgetMin: lakh(80), budgetMax: lakh(95), preferredLocalities: ['Hinjawadi'] });
    expect(bid(a.id, 'cp_6', 500).reason).toBe('account_inactive');
  });
});

describe('settlement', () => {
  it('charges the winner exactly once, assigns one CP, and losers pay nothing', () => {
    const { a, e } = liveAuction();
    const before = { c1: walletBalance(s, 'cp_1'), c2: walletBalance(s, 'cp_2') };
    bid(a.id, 'cp_1', 500); bid(a.id, 'cp_2', 600); bid(a.id, 'cp_1', 700);
    t += 10 * MIN;
    const r1 = settleAuction(s, ctx('system'), a.id);
    const r2 = settleAuction(s, ctx('system'), a.id);
    settleAuction(s, ctx('system'), a.id);
    expect(r1.outcome).toBe('assigned');
    expect(r2.outcome).toBe('already_settled');
    expect(s.purchases.filter((p) => p.auctionId === a.id)).toHaveLength(1);
    expect(s.assignments.filter((x) => x.enquiryId === e.id)).toHaveLength(1);
    expect(s.ledger.filter((l) => l.type === 'lead_purchase' && l.ref === r1.purchase!.id)).toHaveLength(1);
    expect(walletBalance(s, 'cp_1').total).toBe(before.c1.total - rupees(700));
    expect(walletBalance(s, 'cp_1').held).toBe(before.c1.held);
    expect(walletBalance(s, 'cp_2')).toEqual(before.c2);
    expect(() => startAuction(s, ctx(), a.leadId)).toThrow(/already assigned/); // never resold
  });
  it('a no-bid auction expires without assignment or debit', () => {
    const { a, e } = liveAuction();
    const totals = s.cps.map((c) => walletBalance(s, c.id).total);
    t += 10 * MIN;
    expect(settleAuction(s, ctx('system'), a.id).outcome).toBe('expired_no_bids');
    expect(s.assignments.some((x) => x.enquiryId === e.id)).toBe(false);
    expect(s.cps.map((c) => walletBalance(s, c.id).total)).toEqual(totals);
  });
  it('consent withdrawal before settlement cancels and releases holds; no contact revealed', () => {
    const { a, e } = liveAuction();
    const held = walletBalance(s, 'cp_1').held;
    bid(a.id, 'cp_1', 900);
    withdrawConsent(s, ctx('web'), e.id);
    expect(s.auctions.find((x) => x.id === a.id)!.state).toBe('cancelled');
    expect(walletBalance(s, 'cp_1').held).toBe(held);
    expect(s.assignments.some((x) => x.enquiryId === e.id)).toBe(false);
  });
  it('admin cancellation releases every hold', () => {
    const { a } = liveAuction();
    bid(a.id, 'cp_1', 500); bid(a.id, 'cp_2', 600);
    cancelAuction(s, ctx(), a.id, 'test');
    expect(s.holds.filter((h) => h.auctionId === a.id && h.state === 'active')).toHaveLength(0);
  });
  it('settlement failure goes to admin review and is not passed to the runner-up', () => {
    const { a } = liveAuction();
    bid(a.id, 'cp_1', 500); bid(a.id, 'cp_2', 600);
    s.auctions.find((x) => x.id === a.id)!.demoFailSettlement = true;
    t += 10 * MIN;
    expect(settleAuction(s, ctx('system'), a.id).outcome).toBe('settlement_failed');
    expect(s.assignments.some((x) => x.leadId === a.leadId)).toBe(false);
    expect(settleAuction(s, ctx('system'), a.id).outcome).toBe('settlement_failed'); // worker doesn't silently retry
    const r = retrySettlement(s, ctx(), a.id);
    expect(r.outcome).toBe('assigned');
    expect(r.purchase!.cpId).toBe('cp_2');
  });
});

describe('wallet top-ups and refunds', () => {
  it('failed top-ups add nothing and duplicate callbacks never double-credit', () => {
    const b = walletBalance(s, 'cp_5').total;
    const p1 = createTopUp(s, ctx('user_cp_5'), 'cp_5', 500_000);
    handlePaymentCallback(s, ctx('gw'), p1.id, 'failed');
    expect(walletBalance(s, 'cp_5').total).toBe(b);
    const p2 = createTopUp(s, ctx('user_cp_5'), 'cp_5', 100_000);
    handlePaymentCallback(s, ctx('gw'), p2.id, 'succeeded');
    expect(handlePaymentCallback(s, ctx('gw'), p2.id, 'succeeded').duplicate).toBe(true);
    expect(walletBalance(s, 'cp_5').total).toBe(b + 100_000);
    expect(() => createTopUp(s, ctx('user_cp_5'), 'cp_5', 123)).toThrow();
  });
  it('an approved refund credits once; a rejected one changes nothing', () => {
    const seeded = s.disputes.find((d) => d.status === 'requested')!;
    const before = walletBalance(s, seeded.cpId).total;
    const amount = s.purchases.find((p) => p.id === seeded.purchaseId)!.amount;
    expect(decideDispute(s, ctx(), seeded.id, true, 'Contact invalid').credited).toBe(true);
    expect(decideDispute(s, ctx(), seeded.id, true, 'again').credited).toBe(false);
    expect(walletBalance(s, seeded.cpId).total).toBe(before + amount);
    expect(s.ledger.filter((l) => l.type === 'refund' && l.ref === seeded.id)).toHaveLength(1);
    expect(s.purchases.find((p) => p.id === seeded.purchaseId)!.amount).toBe(amount); // purchase not edited

    const { a } = liveAuction();
    bid(a.id, 'cp_4', 500);
    t += 10 * MIN;
    const asg = settleAuction(s, ctx('system'), a.id).assignment!;
    const b4 = walletBalance(s, 'cp_4').total;
    const d = raiseDispute(s, ctx('user_cp_4'), 'cp_4', asg.id, 'other', 'Customer did not convert after visit');
    decideDispute(s, ctx(), d.id, false, 'Non-conversion is not a refund reason');
    expect(walletBalance(s, 'cp_4').total).toBe(b4);
  });
});

describe('settlement worker', () => {
  it('closes every due auction once, including seed auctions', () => {
    t += 31 * MIN;
    const first = closeDueAuctions(s, ctx('system'));
    expect(first.map((r) => r.outcome).sort()).toEqual(['assigned', 'expired_no_bids']);
    expect(closeDueAuctions(s, ctx('system'))).toHaveLength(0);
    const a1 = s.auctions.find((a) => a.state === 'assigned' && s.purchases.find((p) => p.auctionId === a.id)?.cpId === 'cp_2' && a.startsAt > T0 - 5 * MIN);
    expect(a1).toBeTruthy();
    expect(walletBalance(s, 'cp_4').held).toBe(0); // outbid seed bidder was released
  });
});
