import type { Assignment, CrmStage, DbState, Dispute, DisputeReason, ID, Millis, OpContext } from './types';
import { audit, customerUserId, fail, must, nextId, notify, notifyOrg, notifyRole } from './util';
import { appendLedger, hasLedgerKey } from './wallet';
import { formatDateTime, formatINR } from './format';

export const CRM_STAGES: CrmStage[] = ['new', 'attempted', 'contacted', 'qualified', 'visit_scheduled', 'visit_completed', 'negotiation', 'booked', 'lost'];
export const CRM_LABEL: Record<CrmStage, string> = {
  new: 'New', attempted: 'Attempted', contacted: 'Contacted', qualified: 'Qualified', visit_scheduled: 'Visit scheduled',
  visit_completed: 'Visit completed', negotiation: 'Negotiation', booked: 'Booked', lost: 'Lost',
};

/** Only the assigned CP may act on its assignment. */
export function ownAssignment(s: DbState, cpId: ID, assignmentId: ID): Assignment {
  const a = must(s.assignments, assignmentId, 'Lead');
  if (a.cpId !== cpId) fail('forbidden', 'This lead is assigned to another partner');
  return a;
}

export function setStage(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, stage: CrmStage, lostReason?: string) {
  const a = ownAssignment(s, cpId, assignmentId);
  if (stage === 'lost' && !lostReason?.trim()) fail('lost_reason', 'Add a reason when marking a lead lost');
  const prev = a.stage;
  a.stage = stage;
  a.lostReason = stage === 'lost' ? lostReason : undefined;
  s.activities.push({ id: nextId(s, 'act'), assignmentId, kind: 'stage_change', text: `Stage: ${CRM_LABEL[prev]} → ${CRM_LABEL[stage]}${lostReason ? ` (${lostReason})` : ''}`, at: ctx.now, actorId: ctx.actorId });
  audit(s, ctx, 'crm.stage', 'assignment', a.id, `${prev}->${stage}`);
}

export function addNote(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, text: string) {
  ownAssignment(s, cpId, assignmentId);
  if (!text.trim()) fail('validation', 'Note cannot be empty');
  s.activities.push({ id: nextId(s, 'act'), assignmentId, kind: 'note', text: text.trim(), at: ctx.now, actorId: ctx.actorId });
}

export function addReminder(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, text: string, dueAt: Millis) {
  ownAssignment(s, cpId, assignmentId);
  if (!text.trim()) fail('validation', 'Describe the follow-up');
  if (!dueAt || dueAt < ctx.now - 60_000) fail('validation', 'Pick a future date and time');
  s.activities.push({ id: nextId(s, 'act'), assignmentId, kind: 'reminder', text: text.trim(), dueAt, done: false, at: ctx.now, actorId: ctx.actorId });
}

export function completeReminder(s: DbState, _ctx: OpContext, cpId: ID, activityId: ID) {
  const act = must(s.activities, activityId, 'Reminder');
  ownAssignment(s, cpId, act.assignmentId);
  act.done = true;
}

/** Call / message actions are previews only. Nothing is sent. */
export function logOutreachPreview(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, kind: 'call_preview' | 'message_preview', text: string) {
  const a = ownAssignment(s, cpId, assignmentId);
  const enq = must(s.enquiries, a.enquiryId, 'Enquiry');
  if (enq.sharingStoppedAt) fail('stopped', 'The customer asked to stop contact. Outreach is blocked.');
  s.activities.push({ id: nextId(s, 'act'), assignmentId, kind, text: `${kind === 'call_preview' ? 'Call' : 'Message'} logged (demo — nothing was sent): ${text}`, at: ctx.now, actorId: ctx.actorId });
  if (a.stage === 'new') setStage(s, ctx, cpId, assignmentId, 'attempted');
}

export function scheduleVisit(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, projectId: ID, at: Millis, note?: string) {
  const a = ownAssignment(s, cpId, assignmentId);
  const lead = must(s.leads, a.leadId, 'Lead');
  if (!lead.matches.some((m) => m.projectId === projectId)) fail('validation', 'Choose one of this lead’s matched projects');
  if (!at || at < ctx.now) fail('validation', 'Choose a future visit time');
  const v = { id: nextId(s, 'vis'), assignmentId, projectId, at, state: 'scheduled' as const, requestedBy: 'cp' as const, note };
  s.visits.push(v);
  s.activities.push({ id: nextId(s, 'act'), assignmentId, kind: 'visit', text: `Site visit scheduled for ${formatDateTime(at)}`, at: ctx.now, actorId: ctx.actorId });
  if (CRM_STAGES.indexOf(a.stage) < CRM_STAGES.indexOf('visit_scheduled')) setStage(s, ctx, cpId, assignmentId, 'visit_scheduled');
  const enq = must(s.enquiries, a.enquiryId, 'Enquiry');
  notify(s, ctx, customerUserId(enq.customerId), { title: 'Site visit scheduled (demo)', body: `Your partner scheduled a visit for ${formatDateTime(at)}.`, tone: 'info', link: `/my-enquiries/${enq.id}` });
  return v;
}

export function setVisitState(s: DbState, ctx: OpContext, cpId: ID, visitId: ID, state: 'completed' | 'cancelled' | 'no_show') {
  const v = must(s.visits, visitId, 'Visit');
  const a = ownAssignment(s, cpId, v.assignmentId);
  v.state = state;
  s.activities.push({ id: nextId(s, 'act'), assignmentId: a.id, kind: 'visit', text: `Visit marked ${state.replace('_', ' ')}`, at: ctx.now, actorId: ctx.actorId });
  if (state === 'completed' && CRM_STAGES.indexOf(a.stage) < CRM_STAGES.indexOf('visit_completed')) setStage(s, ctx, cpId, a.id, 'visit_completed');
}

/** Customer-side visit request (shown to the assigned CP). */
export function requestVisit(s: DbState, ctx: OpContext, enquiryId: ID, preferred: string) {
  const enq = must(s.enquiries, enquiryId, 'Enquiry');
  const a = s.assignments.find((x) => x.enquiryId === enquiryId);
  if (!a) fail('not_assigned', 'A partner has not been assigned yet. Your preference is saved on the enquiry.');
  if (!preferred.trim()) fail('validation', 'Tell us when suits you');
  const projectId = enq.projectId ?? must(s.leads, a.leadId, 'Lead').matches[0]?.projectId;
  s.visits.push({ id: nextId(s, 'vis'), assignmentId: a.id, projectId, at: ctx.now, state: 'requested', requestedBy: 'customer', note: preferred });
  s.activities.push({ id: nextId(s, 'act'), assignmentId: a.id, kind: 'visit', text: `Customer requested a site visit: ${preferred}`, at: ctx.now, actorId: ctx.actorId });
  notifyOrg(s, ctx, a.cpId, { title: 'Customer requested a site visit', body: preferred, tone: 'info', link: `/cp/leads/${a.id}` });
}

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  invalid_contact: 'Contact details are invalid / unreachable',
  duplicate_sold: 'Platform sold a duplicate lead',
  incorrect_qualification: 'Qualification information was materially incorrect',
  other: 'Other',
};

export function raiseDispute(s: DbState, ctx: OpContext, cpId: ID, assignmentId: ID, reason: DisputeReason, evidence: string): Dispute {
  const a = ownAssignment(s, cpId, assignmentId);
  if (evidence.trim().length < 10) fail('validation', 'Describe your evidence (at least 10 characters)');
  if (s.disputes.some((d) => d.purchaseId === a.purchaseId && d.status === 'requested')) fail('open_dispute', 'There is already an open dispute for this lead');
  if (s.disputes.some((d) => d.purchaseId === a.purchaseId && d.status === 'approved')) fail('refunded', 'This lead was already refunded');
  const d: Dispute = { id: nextId(s, 'dsp'), purchaseId: a.purchaseId, cpId, reason, evidence: evidence.trim(), status: 'requested', createdAt: ctx.now };
  s.disputes.push(d);
  audit(s, ctx, 'dispute.raised', 'dispute', d.id, reason);
  notifyRole(s, ctx, 'admin', { title: 'Invalid-lead dispute raised', body: DISPUTE_REASON_LABEL[reason], tone: 'warning', link: '/admin/disputes' });
  return d;
}

/**
 * Admin decision. An approval creates exactly one refund credit (idempotent by dispute id);
 * past purchases are never edited. Rejection never changes balances.
 */
export function decideDispute(s: DbState, ctx: OpContext, disputeId: ID, approve: boolean, note: string): { credited: boolean } {
  const d = must(s.disputes, disputeId, 'Dispute');
  if (d.status !== 'requested') return { credited: false }; // already decided: idempotent no-op
  if (!note.trim()) fail('note_required', 'Record a decision note');
  const pur = must(s.purchases, d.purchaseId, 'Purchase');
  d.status = approve ? 'approved' : 'rejected';
  d.decisionNote = note;
  d.decidedBy = ctx.actorId;
  d.decidedAt = ctx.now;
  let credited = false;
  const key = `refund:${pur.id}`;
  if (approve && !hasLedgerKey(s, key)) {
    const led = appendLedger(s, ctx, { cpId: d.cpId, type: 'refund', amount: pur.amount, holdDelta: 0, status: 'succeeded', ref: d.id, idempotencyKey: key, memo: `Refund for receipt ${pur.receiptNo}` });
    d.refundLedgerId = led.id;
    credited = true;
  }
  audit(s, ctx, approve ? 'dispute.approved' : 'dispute.rejected', 'dispute', d.id, `${note}${credited ? ` — refunded ${formatINR(pur.amount)}` : ''}`);
  notifyOrg(s, ctx, d.cpId, { title: approve ? 'Refund approved' : 'Dispute not upheld', body: approve ? `${formatINR(pur.amount)} credited to your prepaid lead balance.` : note, tone: approve ? 'success' : 'info', link: '/cp/wallet' });
  return { credited };
}

export function confirmBooking(s: DbState, ctx: OpContext, developerId: ID, assignmentId: ID) {
  const a = must(s.assignments, assignmentId, 'Assignment');
  const lead = must(s.leads, a.leadId, 'Lead');
  const projectIds = lead.matches.map((m) => m.projectId);
  if (!s.projects.some((p) => projectIds.includes(p.id) && p.developerId === developerId)) fail('forbidden', 'Not your project');
  if (a.stage !== 'booked') fail('bad_state', 'Only CP-reported bookings can be confirmed');
  a.developerConfirmedBooking = true;
  audit(s, ctx, 'booking.developer_confirmed', 'assignment', a.id);
}
