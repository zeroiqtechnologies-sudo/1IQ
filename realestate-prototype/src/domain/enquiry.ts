import type { ContactPreference, ContactTime, Customer, DbState, Enquiry, ID, Lead, OpContext, Paise, Purpose, Qualification, QualificationChecks, Timeline } from './types';
import { audit, byId, customerUserId, fail, must, nextId, notify, notifyOrg, notifyRole } from './util';
import { isValidIndianMobile, normalizePhone } from './format';
import { cancelAuctionUnchecked } from './auction';
import { computeMatches, eligibleCpIds } from './eligibility';

export const CONSENT_TEXT: Record<string, string> = {
  'share-v1.0':
    'I agree that my name, phone number and email (if given) may be shared with ONE assigned, verified channel partner so they can contact me about this enquiry. The platform will not share my details with anyone else for this enquiry.',
  'mkt-v1.0': 'Send me occasional updates about new projects and offers. (Optional — you can say no and still enquire.)',
};

export const DEMO_OTP = '123456';
const DUPLICATE_WINDOW_MS = 90 * 24 * 3600_000;

export interface EnquiryInput {
  name: string;
  phone: string;
  email?: string;
  projectId?: ID;
  allowAlternatives: boolean;
  budgetMin: Paise;
  budgetMax: Paise;
  bhk: number[];
  preferredLocalities: string[];
  timeline: Timeline;
  purpose: Purpose;
  contactPreference: ContactPreference;
  contactTime: ContactTime;
  visitAvailability?: string;
  message?: string;
  consentShare: boolean;
  consentMarketing: boolean;
  source: string;
}

export function validateEnquiry(i: EnquiryInput): Record<string, string> {
  const errs: Record<string, string> = {};
  if (i.name.trim().length < 2) errs.name = 'Enter your name';
  if (!isValidIndianMobile(i.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number';
  if (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) errs.email = 'Enter a valid email or leave it blank';
  if (!(i.budgetMax > 0) || i.budgetMin > i.budgetMax) errs.budget = 'Choose a valid budget range';
  if (!i.bhk.length) errs.bhk = 'Pick at least one configuration';
  if (!i.projectId && !i.allowAlternatives) errs.allowAlternatives = 'For a general enquiry, allow us to match relevant projects';
  if (!i.consentShare) errs.consentShare = 'Tick this so one partner can contact you. We cannot route your enquiry without it.';
  return errs;
}

export function findOrCreateCustomer(s: DbState, ctx: OpContext, name: string, phone: string, email?: string): Customer {
  const norm = normalizePhone(phone);
  let c = s.customers.find((x) => x.phoneNormalized === norm);
  if (!c) {
    c = { id: nextId(s, 'cus'), name: name.trim(), phone, phoneNormalized: norm, email: email || undefined, createdAt: ctx.now };
    s.customers.push(c);
    s.users.push({ id: customerUserId(c.id), role: 'customer', name: c.name, email: email || '', status: 'active' });
  }
  return c;
}

/** Submit an enquiry. It starts unverified and is never immediately a qualified lead. */
export function submitEnquiry(s: DbState, ctx: OpContext, input: EnquiryInput): Enquiry {
  const errs = validateEnquiry(input);
  if (Object.keys(errs).length) fail('validation', Object.values(errs)[0]);
  if (input.projectId) {
    const p = must(s.projects, input.projectId, 'Project');
    if (p.status !== 'published') fail('not_published', 'This project is not open for enquiries');
  }
  const c = findOrCreateCustomer(s, ctx, input.name, input.phone, input.email);
  const dupes = s.enquiries.filter((e) => {
    const other = byId(s.customers, e.customerId);
    return other?.phoneNormalized === c.phoneNormalized && !['rejected', 'withdrawn', 'duplicate'].includes(e.status) && ctx.now - e.createdAt < DUPLICATE_WINDOW_MS;
  });
  const e: Enquiry = {
    id: nextId(s, 'enq'),
    customerId: c.id,
    projectId: input.projectId,
    allowAlternatives: input.allowAlternatives,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    bhk: [...input.bhk].sort(),
    preferredLocalities: input.preferredLocalities,
    timeline: input.timeline,
    purpose: input.purpose,
    contactPreference: input.contactPreference,
    contactTime: input.contactTime,
    visitAvailability: input.visitAvailability || undefined,
    message: input.message || undefined,
    consent: {
      shareWithAssignedPartner: input.consentShare,
      shareTextVersion: s.settings.consentTextVersion,
      shareGivenAt: input.consentShare ? ctx.now : undefined,
      marketing: input.consentMarketing,
      marketingTextVersion: s.settings.marketingTextVersion,
      marketingGivenAt: input.consentMarketing ? ctx.now : undefined,
      source: input.source,
    },
    status: 'received',
    duplicateOf: dupes.map((d) => d.id),
    duplicateReview: dupes.length ? 'flagged' : 'none',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  s.enquiries.push(e);
  e.status = 'verification_pending';
  audit(s, { ...ctx, actorId: customerUserId(c.id) }, 'enquiry.submitted', 'enquiry', e.id, `consent ${e.consent.shareTextVersion}${e.duplicateOf.length ? `; possible duplicate of ${e.duplicateOf.join(', ')}` : ''}`);
  if (dupes.length) notifyRole(s, ctx, 'admin', { title: 'Possible duplicate enquiry', body: `Enquiry ${e.id} shares a phone number with ${dupes.length} active enquiry(s).`, tone: 'warning', link: `/admin/enquiries/${e.id}` });
  return e;
}

export function verifyOtp(s: DbState, ctx: OpContext, enquiryId: ID, code: string) {
  const e = must(s.enquiries, enquiryId, 'Enquiry');
  if (e.otpVerifiedAt) return e;
  if (code.trim() !== DEMO_OTP) fail('bad_otp', 'Incorrect code. In this demo the code is 123456.');
  e.otpVerifiedAt = ctx.now;
  e.status = 'qualification_pending';
  e.updatedAt = ctx.now;
  audit(s, ctx, 'enquiry.otp_verified', 'enquiry', e.id, 'demo OTP');
  notify(s, ctx, customerUserId(e.customerId), { title: 'Enquiry received', body: 'Your phone is verified. Our team will review your enquiry before connecting you with one partner.', tone: 'success', link: `/my-enquiries/${e.id}` });
  notifyRole(s, ctx, 'admin', { title: 'New enquiry to qualify', body: `Enquiry ${e.id} is verified and waiting for qualification.`, tone: 'info', link: `/admin/enquiries/${e.id}` });
  return e;
}

export function resolveDuplicate(s: DbState, ctx: OpContext, enquiryId: ID, decision: 'cleared' | 'confirmed', note?: string) {
  const e = must(s.enquiries, enquiryId, 'Enquiry');
  if (e.duplicateReview !== 'flagged') fail('not_flagged', 'This enquiry is not flagged as a possible duplicate');
  e.duplicateReview = decision;
  if (decision === 'confirmed') e.status = 'duplicate';
  e.updatedAt = ctx.now;
  audit(s, ctx, `enquiry.duplicate_${decision}`, 'enquiry', e.id, note);
}

export interface QualifyInput {
  result: 'qualified' | 'rejected';
  checks: QualificationChecks;
  evidence: string[];
  internalNote?: string;
}

/** Admin qualification. Produces a Lead with deterministic project matches. */
export function qualifyEnquiry(s: DbState, ctx: OpContext, enquiryId: ID, input: QualifyInput): { qualification: Qualification; lead?: Lead } {
  const e = must(s.enquiries, enquiryId, 'Enquiry');
  if (e.status !== 'qualification_pending') fail('bad_state', `Enquiry is ${e.status.replace(/_/g, ' ')}, not awaiting qualification`);
  const q: Qualification = {
    id: nextId(s, 'qal'),
    enquiryId,
    reviewerId: ctx.actorId,
    result: input.result,
    checks: { ...input.checks },
    evidence: input.evidence.filter(Boolean),
    internalNote: input.internalNote,
    budgetEvidence: 'customer_stated',
    at: ctx.now,
  };
  if (input.result === 'rejected') {
    s.qualifications.push(q);
    e.status = 'rejected';
    e.updatedAt = ctx.now;
    audit(s, ctx, 'enquiry.rejected', 'enquiry', e.id, input.internalNote);
    return { qualification: q };
  }
  if (!e.otpVerifiedAt) fail('unverified', 'Contact is not verified');
  if (!e.consent.shareWithAssignedPartner || e.consent.withdrawnAt) fail('no_consent', 'No active consent to share with a partner');
  if (e.duplicateReview === 'flagged') fail('duplicate_unreviewed', 'Resolve the duplicate flag first');
  const c = input.checks;
  if (!c.contactVerified || !c.requirementsComplete || !c.timelineConfirmed || !c.consentActive || !c.duplicateReviewed) fail('checks_incomplete', 'All qualification checks must be confirmed');
  if (!q.evidence.length) fail('no_evidence', 'Record at least one piece of qualification evidence');
  const matches = computeMatches(s, e);
  if (!matches.length) fail('no_matches', 'No projects match. A general enquiry needs the customer’s permission to match alternatives.');
  s.qualifications.push(q);
  const lead: Lead = { id: nextId(s, 'lead'), enquiryId, qualificationId: q.id, matches, eligibleCpIds: [], state: 'ready', createdAt: ctx.now };
  lead.eligibleCpIds = eligibleCpIds(s, lead);
  s.leads.push(lead);
  e.status = 'qualified';
  e.updatedAt = ctx.now;
  audit(s, ctx, 'enquiry.qualified', 'enquiry', e.id, `${matches.length} matching project(s), ${lead.eligibleCpIds.length} eligible CP(s)`);
  notify(s, ctx, customerUserId(e.customerId), { title: 'Enquiry qualified', body: 'We are finding one partner to help you. You will see their details here once assigned.', tone: 'info', link: `/my-enquiries/${e.id}` });
  return { qualification: q, lead };
}

/** Customer withdraws contact-sharing consent. */
export function withdrawConsent(s: DbState, ctx: OpContext, enquiryId: ID): 'cancelled_before_sharing' | 'sharing_stopped' {
  const e = must(s.enquiries, enquiryId, 'Enquiry');
  if (e.consent.withdrawnAt) fail('already', 'Consent was already withdrawn');
  e.consent.withdrawnAt = ctx.now;
  e.updatedAt = ctx.now;
  const asg = s.assignments.find((a) => a.enquiryId === e.id);
  if (asg) {
    // Details were already disclosed to one partner. Stop further sharing; route through support.
    e.sharingStoppedAt = ctx.now;
    s.tickets.push({ id: nextId(s, 'tkt'), customerId: e.customerId, enquiryId: e.id, kind: 'stop_sharing', text: 'Customer withdrew consent after assignment. Ask the partner to stop contact.', status: 'open', createdAt: ctx.now });
    notifyOrg(s, ctx, asg.cpId, { title: 'Customer asked to stop contact', body: 'The customer withdrew consent. Please stop contacting them about this enquiry.', tone: 'danger', link: `/cp/leads/${asg.id}` });
    notifyRole(s, ctx, 'admin', { title: 'Consent withdrawn after assignment', body: `Enquiry ${e.id}: support ticket opened.`, tone: 'warning', link: `/admin/enquiries/${e.id}` });
    audit(s, ctx, 'enquiry.consent_withdrawn_after_assignment', 'enquiry', e.id);
    return 'sharing_stopped';
  }
  const live = s.auctions.find((a) => {
    const l = byId(s.leads, a.leadId);
    return l?.enquiryId === e.id && ['live', 'scheduled', 'settlement_pending', 'settlement_failed'].includes(a.state);
  });
  if (live) cancelAuctionUnchecked(s, ctx, live.id, 'Customer withdrew consent before settlement');
  for (const l of s.leads.filter((x) => x.enquiryId === e.id)) l.state = 'cancelled';
  e.status = 'withdrawn';
  audit(s, ctx, 'enquiry.consent_withdrawn', 'enquiry', e.id);
  return 'cancelled_before_sharing';
}

export function setContactPreference(s: DbState, ctx: OpContext, enquiryId: ID, pref: ContactPreference, time: ContactTime) {
  const e = must(s.enquiries, enquiryId, 'Enquiry');
  e.contactPreference = pref;
  e.contactTime = time;
  e.updatedAt = ctx.now;
  audit(s, ctx, 'enquiry.contact_preference', 'enquiry', e.id, `${pref}/${time}`);
  const asg = s.assignments.find((a) => a.enquiryId === e.id);
  if (asg) notifyOrg(s, ctx, asg.cpId, { title: 'Customer updated contact preference', body: `Now prefers ${pref} (${time}).`, tone: 'info', link: `/cp/leads/${asg.id}` });
}

export function raiseSupportTicket(s: DbState, ctx: OpContext, customerId: ID, kind: 'report_partner' | 'general', text: string, enquiryId?: ID) {
  if (text.trim().length < 5) fail('validation', 'Tell us a little more (at least 5 characters)');
  const t = { id: nextId(s, 'tkt'), customerId, enquiryId, kind, text: text.trim(), status: 'open' as const, createdAt: ctx.now };
  s.tickets.push(t);
  notifyRole(s, ctx, 'admin', { title: kind === 'report_partner' ? 'Customer reported a partner' : 'New support request', body: t.text.slice(0, 120), tone: 'warning', link: '/admin/disputes' });
  audit(s, ctx, `support.${kind}`, 'ticket', t.id);
  return t;
}
