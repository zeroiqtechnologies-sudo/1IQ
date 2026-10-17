import type { Auction, AuctionPreview, DbState, ID, Millis, OpContext } from './types';
import { acceptedBids, activeHold, cpAuctionStatus, leadingBid, minNextBid } from './auction';
import { cpEligibility } from './eligibility';
import { audit, byId, fail, must } from './util';
import { walletBalance } from './wallet';

/**
 * Build the anonymised auction view for a CP. Only an explicit allow-list of
 * fields is copied — customer identity, contact data, free-text messages and
 * internal admin notes are never read into this object.
 */
export function toAuctionPreview(s: DbState, a: Auction, viewerCpId: ID | undefined): AuctionPreview {
  const lead = must(s.leads, a.leadId, 'Lead');
  const e = must(s.enquiries, lead.enquiryId, 'Enquiry');
  const q = must(s.qualifications, lead.qualificationId, 'Qualification');
  const top = leadingBid(s, a.id);
  const accepted = acceptedBids(s, a.id);
  const elig = viewerCpId ? cpEligibility(s, viewerCpId, lead) : { eligible: false, reason: 'Sign in as a partner', viaProjectIds: [] };
  const mine = viewerCpId ? accepted.filter((b) => b.cpId === viewerCpId) : [];
  const projects = lead.matches.map((m) => {
    const p = byId(s.projects, m.projectId);
    return { projectId: m.projectId, name: p?.name ?? 'Unknown', locality: p?.locality ?? '', primary: m.primary, reasons: [...m.reasons] };
  });
  return {
    auctionId: a.id,
    leadId: lead.id,
    state: a.state,
    requirement: {
      budgetMin: e.budgetMin,
      budgetMax: e.budgetMax,
      bhk: [...e.bhk],
      preferredLocalities: [...e.preferredLocalities],
      timeline: e.timeline,
      purpose: e.purpose,
      contactPreference: e.contactPreference,
      city: projects[0] ? byId(s.projects, projects[0].projectId)?.city ?? 'Pune' : 'Pune',
    },
    projects,
    qualification: { checks: { ...q.checks }, evidence: [...q.evidence], qualifiedAt: q.at, contactVerifiedAt: e.otpVerifiedAt, budgetEvidence: q.budgetEvidence },
    enquiryAt: e.createdAt,
    rules: { ...a.rules },
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    currentBid: top?.amount ?? null,
    minNextBid: minNextBid(s, a),
    bidderCount: new Set(accepted.map((b) => b.cpId)).size,
    bidCount: accepted.length,
    viewer: {
      eligible: elig.eligible,
      ineligibleReason: elig.reason,
      status: viewerCpId ? cpAuctionStatus(s, a, viewerCpId) : 'none',
      myHighestBid: mine.length ? Math.max(...mine.map((b) => b.amount)) : null,
      myHold: viewerCpId ? activeHold(s, a.id, viewerCpId)?.amount ?? 0 : 0,
    },
  };
}

/** Auctions a CP may see: any auction where the CP is eligible or has bid. */
export function cpVisibleAuctions(s: DbState, cpId: ID): AuctionPreview[] {
  return s.auctions
    .filter((a) => {
      const lead = byId(s.leads, a.leadId);
      if (!lead) return false;
      const bidOn = s.bids.some((b) => b.auctionId === a.id && b.cpId === cpId);
      const interested = lead.matches.some((m) => s.interests.some((i) => i.cpId === cpId && i.projectId === m.projectId && i.state === 'interested'));
      return bidOn || interested;
    })
    .map((a) => toAuctionPreview(s, a, cpId));
}

/**
 * The only path that returns customer contact details to a CP. Checks the
 * assignment belongs to the CP. Pure read; pair with logContactAccess for the audit trail.
 */
export function readPurchasedContact(s: DbState, cpId: ID, assignmentId: ID) {
  const asg = must(s.assignments, assignmentId, 'Lead');
  if (asg.cpId !== cpId) fail('forbidden', 'Contact details are only available to the partner who won this lead');
  const e = must(s.enquiries, asg.enquiryId, 'Enquiry');
  const c = must(s.customers, e.customerId, 'Customer');
  return { name: c.name, phone: c.phone, email: c.email, sharingStopped: !!e.sharingStoppedAt };
}

/** Sensitive access is recorded with actor and time. */
export function logContactAccess(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID) {
  readPurchasedContact(s, cpId, assignmentId);
  audit(s, ctx, 'lead.contact_viewed', 'assignment', assignmentId, cpId, true);
}

export function cpDashboard(s: DbState, cpId: ID, now: Millis) {
  const bal = walletBalance(s, cpId);
  const prev = cpVisibleAuctions(s, cpId);
  const active = prev.filter((p) => p.state === 'live');
  const asg = s.assignments.filter((a) => a.cpId === cpId);
  const due = s.activities.filter((x) => x.kind === 'reminder' && !x.done && x.dueAt && x.dueAt <= now + 24 * 3600_000 && asg.some((a) => a.id === x.assignmentId));
  const funnel = {
    purchased: asg.length,
    contacted: asg.filter((a) => !['new', 'attempted'].includes(a.stage)).length,
    visited: asg.filter((a) => ['visit_completed', 'negotiation', 'booked'].includes(a.stage)).length,
    booked: asg.filter((a) => a.stage === 'booked').length,
  };
  return {
    bal,
    active,
    leading: active.filter((p) => p.viewer.status === 'leading').length,
    outbid: active.filter((p) => p.viewer.status === 'outbid').length,
    won: asg.length,
    due,
    funnel,
  };
}

export function adminMetrics(s: DbState) {
  const enq = s.enquiries;
  const verified = enq.filter((e) => e.otpVerifiedAt).length;
  const qualified = s.qualifications.filter((q) => q.result === 'qualified').length;
  const closedAuctions = s.auctions.filter((a) => ['assigned', 'expired_no_bids'].includes(a.state));
  const noBid = s.auctions.filter((a) => a.state === 'expired_no_bids').length;
  const revenue = s.purchases.reduce((t, p) => t + p.amount, 0);
  const refunds = s.ledger.filter((l) => l.type === 'refund' && l.status === 'succeeded').reduce((t, l) => t + l.amount, 0);
  const auctionsWithBids = s.auctions.filter((a) => acceptedBids(s, a.id).length > 0).length;
  const eligiblePerLead = s.leads.length ? s.leads.reduce((t, l) => t + l.eligibleCpIds.length, 0) / s.leads.length : 0;
  const visits = s.visits.filter((v) => v.state === 'completed').length;
  const booked = s.assignments.filter((a) => a.stage === 'booked').length;
  const totalTopUps = s.ledger.filter((l) => l.type === 'top_up' && l.status === 'succeeded').reduce((t, l) => t + l.amount, 0);
  const adj = s.ledger.filter((l) => l.type === 'admin_adjustment').reduce((t, l) => t + l.amount, 0);
  const walletTotals = s.cps.map((c) => walletBalance(s, c.id)).reduce((t, b) => ({ total: t.total + b.total, held: t.held + b.held }), { total: 0, held: 0 });
  return {
    enquiries: enq.length,
    verified,
    qualified,
    qualificationRate: verified ? qualified / verified : 0,
    eligiblePerLead,
    auctions: s.auctions.length,
    participation: s.auctions.length ? auctionsWithBids / s.auctions.length : 0,
    noBidRate: closedAuctions.length ? noBid / closedAuctions.length : 0,
    assigned: s.assignments.length,
    revenue,
    refunds,
    refundRate: s.purchases.length ? s.disputes.filter((d) => d.status === 'approved').length / s.purchases.length : 0,
    visits,
    booked,
    reconciliation: { topUps: totalTopUps, purchases: revenue, refunds, adjustments: adj, expectedTotal: totalTopUps - revenue + refunds + adj, ledgerTotal: walletTotals.total, held: walletTotals.held },
  };
}
