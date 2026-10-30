import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlaskConical, FastForward, RotateCcw, Sprout, Gavel, Copy, Eye } from 'lucide-react';
import { useAct, useDb, useDocumentTitle, useNow, useSession } from '../../state/hooks';
import { qualifyEnquiry, resolveDuplicate } from '../../domain/enquiry';
import { computeMatches, cpEligibility } from '../../domain/eligibility';
import { acceptedBids, cancelAuction, leadingBid, minNextBid, retrySettlement, settleAuction, startAuction } from '../../domain/auction';
import { demoEndAuctionNow, demoQualifyAndStart, demoSeedEnquiry, simulateCompetingBid } from '../../domain/demo';
import { decideDispute, DISPUTE_REASON_LABEL } from '../../domain/crm';
import { walletBalance } from '../../domain/wallet';
import { audit } from '../../domain/util';
import { CONTACT_PREF_LABEL, CONTACT_TIME_LABEL, PURPOSE_LABEL, TIMELINE_LABEL, bhkLabel, formatDateTime, formatINR, formatPriceRange, rupees, timeAgo } from '../../domain/format';
import { Badge, Button, Card, CardHeader, Checkbox, Countdown, DataTable, DemoTag, Dialog, EmptyState, Field, Input, KeyValue, LinkButton, PageHeader, Select, StatusBadge, Tabs, Textarea, cx, useConfirm } from '../../ui/kit';
import { attempt, clock, resetDemo } from '../../services/local';
import { useToast } from '../../ui/toast';
import type { Lead, QualificationChecks } from '../../domain/types';

const CHECKS: [keyof QualificationChecks, string][] = [
  ['contactVerified', 'Contact verified (OTP / call)'], ['requirementsComplete', 'Requirement complete & realistic'], ['timelineConfirmed', 'Buying timeline confirmed'], ['consentActive', 'Contact-sharing consent active'], ['duplicateReviewed', 'Duplicate history reviewed'],
];

export function EnquiriesAdmin() {
  useDocumentTitle('Qualification');
  const s = useDb();
  const now = useNow(30_000);
  const nav = useNavigate();
  const [tab, setTab] = useState<'queue' | 'dupes' | 'all'>('queue');
  const rows = s.enquiries.filter((e) => (tab === 'queue' ? ['qualification_pending', 'verification_pending'].includes(e.status) : tab === 'dupes' ? e.duplicateReview === 'flagged' : true)).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <>
      <PageHeader title="Qualification & duplicates" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Qualification' }]} subtitle="Enquiries are not leads until reviewed. received → verification pending → qualification pending → qualified / rejected / duplicate / withdrawn." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: `Queue (${s.enquiries.filter((e) => ['qualification_pending', 'verification_pending'].includes(e.status)).length})` }, { id: 'dupes', label: `Duplicate flags (${s.enquiries.filter((e) => e.duplicateReview === 'flagged').length})` }, { id: 'all', label: `All (${s.enquiries.length})` }]} />
      <Card className="mt-4">
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/admin/enquiries/${r.id}`)} search={(r) => `${r.id} ${s.customers.find((c) => c.id === r.customerId)?.name} ${s.projects.find((p) => p.id === r.projectId)?.name ?? 'general'} ${r.status}`} empty={<EmptyState title="Nothing waiting" body="Seed a demo enquiry from Demo controls, or submit one on the customer website." action={<LinkButton to="/admin/demo" size="sm" variant="secondary">Demo controls</LinkButton>} />}
          columns={[
            { key: 'id', header: 'Enquiry', cell: (r) => <span className="font-medium">{r.id.toUpperCase()}</span> },
            { key: 'p', header: 'Project', cell: (r) => s.projects.find((p) => p.id === r.projectId)?.name ?? <Badge tone="blue">General</Badge> },
            { key: 'req', header: 'Requirement', cell: (r) => <span className="text-xs">{bhkLabel(r.bhk)} · {formatPriceRange(r.budgetMin, r.budgetMax)}</span>, mobileHidden: true },
            { key: 's', header: 'Status', cell: (r) => <span className="flex flex-wrap gap-1 justify-end md:justify-start"><StatusBadge status={r.status} />{r.duplicateReview === 'flagged' && <Badge tone="purple">possible duplicate</Badge>}</span> },
            { key: 'a', header: 'Age', cell: (r) => <span className="text-xs">{timeAgo(r.createdAt, now)}</span> },
          ]} />
      </Card>
    </>
  );
}

function MatchingPreview({ lead }: { lead: Pick<Lead, 'matches' | 'enquiryId'> }) {
  const s = useDb();
  const fake = { ...lead, id: 'preview', qualificationId: '', eligibleCpIds: [], state: 'ready' as const, createdAt: 0 };
  return (
    <Card>
      <CardHeader title="Matching preview" subtitle="Deterministic: project-specific enquiries stay with their project; alternatives only with customer permission." />
      {!lead.matches.length ? <p className="p-4 text-sm text-red-700">No matching projects. A general enquiry without permission for alternatives can’t be matched.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {lead.matches.map((m) => <li key={m.projectId} className="px-4 sm:px-5 py-2.5"><span className="font-medium">{s.projects.find((p) => p.id === m.projectId)?.name}</span> {m.primary ? <Badge tone="teal">Enquired</Badge> : <Badge tone="blue">Alternative</Badge>}<div className="mt-1 flex flex-wrap gap-1">{m.reasons.map((r) => <Badge key={r}>{r}</Badge>)}</div></li>)}
        </ul>
      )}
      <div className="border-t border-slate-100">
        <p className="px-4 sm:px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Partner eligibility</p>
        <ul className="divide-y divide-slate-100 text-sm">
          {s.cps.map((c) => { const el = cpEligibility(s, c.id, fake); return (
            <li key={c.id} className="px-4 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{c.displayName}</span>
              <span className="text-right text-xs">{el.eligible ? <><Badge tone="green">Eligible</Badge> <span className="text-slate-500">available {formatINR(walletBalance(s, c.id).available)}</span></> : <span className="text-slate-500">{el.reason}</span>}</span>
            </li>); })}
        </ul>
      </div>
    </Card>
  );
}

export function EnquiryAdmin() {
  const { id } = useParams();
  const s = useDb();
  const user = useSession();
  const act = useAct();
  const nav = useNavigate();
  const { ask, node } = useConfirm();
  const e = s.enquiries.find((x) => x.id === id);
  const [checks, setChecks] = useState<QualificationChecks>({ contactVerified: !!e?.otpVerifiedAt, requirementsComplete: false, timelineConfirmed: false, consentActive: !!e && e.consent.shareWithAssignedPartner && !e.consent.withdrawnAt, duplicateReviewed: e?.duplicateReview !== 'flagged' });
  const [evidence, setEvidence] = useState('Demo OTP verified\nRequirement confirmed on call (demo)');
  const [note, setNote] = useState('');
  const d = s.settings.auctionDefaults;
  const [rules, setRules] = useState({ start: String(d.startPrice / 100), inc: String(d.increment / 100), min: String(d.durationMs / 60000) });
  useDocumentTitle('Enquiry review');
  // Admin viewing customer contact details is sensitive access → audit once per visit.
  useEffect(() => { if (id && user) attempt(user.id, (st, ctx) => audit(st, ctx, 'enquiry.contact_viewed_by_admin', 'enquiry', id, undefined, true)); }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (e ? computeMatches(s, e) : []), [s, e]);
  if (!e) return <EmptyState title="Enquiry not found" action={<LinkButton to="/admin/enquiries">Back</LinkButton>} />;
  const c = s.customers.find((x) => x.id === e.customerId)!;
  const p = s.projects.find((x) => x.id === e.projectId);
  const lead = s.leads.find((l) => l.enquiryId === e.id);
  const auctions = lead ? s.auctions.filter((a) => a.leadId === lead.id) : [];
  const dupes = e.duplicateOf.map((x) => s.enquiries.find((y) => y.id === x)!).filter(Boolean);
  const quals = s.qualifications.filter((q) => q.enquiryId === e.id);
  const canStart = lead && ['qualified', 'unassigned'].includes(e.status) && !auctions.some((a) => ['live', 'scheduled', 'settlement_pending', 'settlement_failed'].includes(a.state)) && !e.consent.withdrawnAt;
  return (
    <>
      <PageHeader title={`Enquiry ${e.id.toUpperCase()}`} crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Qualification', to: '/admin/enquiries' }, { label: e.id.toUpperCase() }]} subtitle={<span className="flex flex-wrap gap-2 items-center"><StatusBadge status={e.status} />{p ? p.name : 'General enquiry'} · {formatDateTime(e.createdAt)}</span>} />
      <div className="grid lg:grid-cols-[1fr_24rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Customer & requirement" subtitle="Admin view. Access is recorded in the audit trail." action={<Badge tone="red"><Eye className="h-3 w-3" />Sensitive</Badge>} />
            <div className="p-4 sm:p-5 space-y-3">
              <KeyValue items={[['Name', c.name], ['Phone', `${c.phone} (normalised ${c.phoneNormalized})`], ['Email', c.email ?? '—'], ['Phone verified', e.otpVerifiedAt ? formatDateTime(e.otpVerifiedAt) : 'No'], ['Budget', formatPriceRange(e.budgetMin, e.budgetMax)], ['Configuration', bhkLabel(e.bhk)], ['Timeline', TIMELINE_LABEL[e.timeline]], ['Purpose', PURPOSE_LABEL[e.purpose]], ['Localities', e.preferredLocalities.join(', ') || '—'], ['Contact', `${CONTACT_PREF_LABEL[e.contactPreference]} · ${CONTACT_TIME_LABEL[e.contactTime]}`], ['Visit availability', e.visitAvailability ?? '—'], ['Alternatives allowed', e.allowAlternatives ? 'Yes' : 'No']]} />
              {e.message && <p className="text-sm bg-slate-50 rounded p-2">Customer note (never shown in auction previews): {e.message}</p>}
              <p className="text-xs text-slate-500">Consent: share {e.consent.shareWithAssignedPartner ? 'given' : 'not given'} ({e.consent.shareTextVersion}, {e.consent.shareGivenAt ? formatDateTime(e.consent.shareGivenAt) : '—'}, {e.consent.source}){e.consent.withdrawnAt ? ` · WITHDRAWN ${formatDateTime(e.consent.withdrawnAt)}` : ''} · marketing {e.consent.marketing ? 'yes' : 'no'}</p>
            </div>
          </Card>
          {e.duplicateOf.length > 0 && (
            <Card>
              <CardHeader title="Duplicate review" subtitle="Same normalised phone with an active enquiry in the last 90 days." action={<StatusBadge status={e.duplicateReview} />} />
              <ul className="divide-y divide-slate-100 text-sm">{dupes.map((x) => <li key={x.id} className="px-4 sm:px-5 py-2.5 flex flex-wrap justify-between gap-2"><Link to={`/admin/enquiries/${x.id}`} className="font-medium hover:text-teal-700">{x.id.toUpperCase()} · {s.projects.find((pp) => pp.id === x.projectId)?.name ?? 'General'}</Link><span className="flex gap-2 items-center text-xs"><StatusBadge status={x.status} />{formatDateTime(x.createdAt)}</span></li>)}</ul>
              {e.duplicateReview === 'flagged' && <div className="p-4 flex flex-wrap gap-2 border-t border-slate-100">
                <Button size="sm" onClick={() => act((st, ctx) => resolveDuplicate(st, ctx, e.id, 'cleared', 'Legitimate new requirement'), { success: 'Cleared as legitimate repeat' })}>Legitimate repeat — keep</Button>
                <Button size="sm" variant="secondary" onClick={() => ask({ title: 'Confirm duplicate?', body: 'The enquiry will be closed as a duplicate and won’t be auctioned. An already-assigned enquiry is never resold.', confirmLabel: 'Confirm duplicate', tone: 'danger', onConfirm: () => act((st, ctx) => resolveDuplicate(st, ctx, e.id, 'confirmed'), { success: 'Marked duplicate' }) })}><Copy className="h-4 w-4" />Confirm duplicate</Button>
              </div>}
            </Card>
          )}
          <MatchingPreview lead={lead ?? { matches: preview, enquiryId: e.id }} />
        </div>
        <aside className="space-y-4">
          {e.status === 'qualification_pending' && (
            <Card className="p-4 sm:p-5 space-y-3 text-sm">
              <p className="font-semibold text-navy-900">Qualify</p>
              {CHECKS.map(([k, l]) => <Checkbox key={k} checked={checks[k]} onChange={(v) => setChecks({ ...checks, [k]: v })} label={l} />)}
              <Field label="Evidence (one per line)" required hint="Shown to bidders. Keep it non-identifying." htmlFor="q-ev"><Textarea id="q-ev" rows={3} value={evidence} onChange={(ev) => setEvidence(ev.target.value)} /></Field>
              <Field label="Internal note" hint="Never shown to partners before purchase." htmlFor="q-n"><Textarea id="q-n" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} /></Field>
              <p className="text-xs text-slate-500">Budget is recorded as customer-stated. Don’t mark financial capacity verified without evidence.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act((st, ctx) => qualifyEnquiry(st, ctx, e.id, { result: 'qualified', checks, evidence: evidence.split('\n').map((x) => x.trim()), internalNote: note }), { success: 'Qualified — lead created' })}>Qualify lead</Button>
                <Button variant="secondary" onClick={() => ask({ title: 'Reject enquiry?', body: 'The customer will see it as closed after review.', tone: 'danger', confirmLabel: 'Reject', onConfirm: () => act((st, ctx) => qualifyEnquiry(st, ctx, e.id, { result: 'rejected', checks, evidence: evidence.split('\n'), internalNote: note }), { success: 'Rejected' }) })}>Reject</Button>
              </div>
            </Card>
          )}
          {e.status === 'verification_pending' && <Card className="p-4 text-sm text-slate-600">Waiting for the customer to verify their phone. It can’t be qualified yet.</Card>}
          {canStart && (
            <Card className="p-4 sm:p-5 space-y-3 text-sm">
              <p className="font-semibold text-navy-900">Start auction</p>
              <p className="text-xs text-slate-500">{lead!.matches.length} matched project(s). One auction per enquiry. Terms are copied onto the auction and shown to bidders.</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Start ₹" required htmlFor="r-s"><Input id="r-s" type="number" value={rules.start} onChange={(ev) => setRules({ ...rules, start: ev.target.value })} /></Field>
                <Field label="Step ₹" required htmlFor="r-i"><Input id="r-i" type="number" value={rules.inc} onChange={(ev) => setRules({ ...rules, inc: ev.target.value })} /></Field>
                <Field label="Minutes" required htmlFor="r-m"><Input id="r-m" type="number" value={rules.min} onChange={(ev) => setRules({ ...rules, min: ev.target.value })} /></Field>
              </div>
              <Button variant="amber" onClick={() => { const a = act((st, ctx) => startAuction(st, ctx, lead!.id, { startPrice: rupees(Number(rules.start)), increment: rupees(Number(rules.inc)), durationMs: Number(rules.min) * 60000 }), { success: 'Auction started' }); if (a) nav(`/admin/auctions/${a.id}`); }}><Gavel className="h-4 w-4" />{e.status === 'unassigned' ? 'Relaunch auction' : 'Start auction'}</Button>
            </Card>
          )}
          {auctions.length > 0 && <Card className="p-4 text-sm space-y-2"><p className="font-semibold text-navy-900">Auctions</p>{auctions.map((a) => <Link key={a.id} to={`/admin/auctions/${a.id}`} className="flex justify-between gap-2 hover:text-teal-700"><span>{a.id}</span><StatusBadge status={a.state} /></Link>)}</Card>}
          {quals.length > 0 && <Card className="p-4 text-sm space-y-2"><p className="font-semibold text-navy-900">Qualification record</p>{quals.map((q) => <div key={q.id} className="text-xs space-y-1"><p><StatusBadge status={q.result} /> by {s.users.find((u) => u.id === q.reviewerId)?.name ?? q.reviewerId} · {formatDateTime(q.at)}</p><ul className="list-disc pl-4">{q.evidence.map((x) => <li key={x}>{x}</li>)}</ul>{q.internalNote && <p className="text-slate-500">Internal: {q.internalNote}</p>}</div>)}</Card>}
        </aside>
      </div>
      {node}
    </>
  );
}

export function AuctionsAdmin() {
  useDocumentTitle('Auctions');
  const s = useDb();
  const now = useNow();
  const nav = useNavigate();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const rows = s.auctions.filter((a) => tab === 'all' || ['live', 'scheduled', 'settlement_pending', 'settlement_failed'].includes(a.state)).sort((a, b) => b.startsAt - a.startsAt);
  return (
    <>
      <PageHeader title="Auctions" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Auctions' }]} subtitle="Closing is handled by the settlement worker (in this demo, a browser timer using the demo clock)." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Open & needs review' }, { id: 'all', label: `All (${s.auctions.length})` }]} />
      <Card className="mt-4">
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/admin/auctions/${r.id}`)} empty={<EmptyState title="No open auctions" body="Start one from a qualified enquiry or Demo controls." />}
          columns={[
            { key: 'id', header: 'Auction', cell: (r) => <span className="font-medium">{r.id}</span> },
            { key: 'p', header: 'Projects', cell: (r) => s.leads.find((l) => l.id === r.leadId)?.matches.map((m) => s.projects.find((p) => p.id === m.projectId)?.name).join(', ') },
            { key: 's', header: 'State', cell: (r) => <StatusBadge status={r.state} /> },
            { key: 'b', header: 'Leading', cell: (r) => { const l = leadingBid(s, r.id); return l ? `${formatINR(l.amount)} · ${s.cps.find((c) => c.id === l.cpId)?.displayName}` : '—'; } },
            { key: 't', header: 'Ends', cell: (r) => (r.state === 'live' ? <Countdown endsAt={r.endsAt} now={now} /> : <span className="text-xs">{formatDateTime(r.endsAt)}</span>) },
          ]} />
      </Card>
    </>
  );
}

export function AuctionAdmin() {
  const { id } = useParams();
  const s = useDb();
  const now = useNow();
  const act = useAct();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [asCp, setAsCp] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const a = s.auctions.find((x) => x.id === id);
  useDocumentTitle('Auction');
  if (!a) return <EmptyState title="Auction not found" action={<LinkButton to="/admin/auctions">Back</LinkButton>} />;
  const lead = s.leads.find((l) => l.id === a.leadId)!;
  const enq = s.enquiries.find((e) => e.id === lead.enquiryId)!;
  const bids = s.bids.filter((b) => b.auctionId === a.id).sort((x, y) => y.at - x.at || y.id.localeCompare(x.id));
  const holds = s.holds.filter((h) => h.auctionId === a.id);
  const top = leadingBid(s, a.id);
  const pur = s.purchases.find((p) => p.auctionId === a.id);
  const live = a.state === 'live';
  const name = (cpId: string) => s.cps.find((c) => c.id === cpId)?.displayName ?? cpId;
  return (
    <>
      <PageHeader title={`Auction ${a.id}`} crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Auctions', to: '/admin/auctions' }, { label: a.id }]} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.state} /> Lead {lead.id.toUpperCase()} · <Link to={`/admin/enquiries/${enq.id}`} className="text-teal-700 hover:underline">enquiry {enq.id.toUpperCase()}</Link></span>}
        actions={!['assigned', 'expired_no_bids', 'cancelled'].includes(a.state) ? <Button variant="danger" onClick={() => { setCancelReason(''); setCancelOpen(true); }}>Cancel auction</Button> : undefined} />
      {a.state === 'settlement_failed' && <div className="mb-5 rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3"><p><strong>Settlement failed:</strong> {a.failureReason}. Holds are kept. The lead is not passed to the runner-up.</p><div className="flex gap-2"><Button size="sm" onClick={() => act((d, ctx) => retrySettlement(d, ctx, a.id), { success: 'Settlement retried' })}>Retry settlement</Button></div></div>}
      <div className="grid lg:grid-cols-[1fr_22rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Bids" subtitle="Admin view with partner names. Rejected attempts are recorded." />
            <DataTable rows={bids} rowKey={(r) => r.id} empty={<EmptyState title="No bids" />}
              columns={[
                { key: 'seq', header: 'Seq', cell: (r) => (r.seq ? `#${r.seq}` : '—') },
                { key: 'cp', header: 'Partner', cell: (r) => name(r.cpId) },
                { key: 'amt', header: 'Amount', cell: (r) => <span className="tabular-nums font-medium">{formatINR(r.amount)}</span> },
                { key: 's', header: 'Result', cell: (r) => (r.status === 'accepted' ? <Badge tone={top?.id === r.id ? 'amber' : 'gray'}>{top?.id === r.id ? (a.state === 'assigned' ? 'Won' : 'Leading') : 'Accepted'}</Badge> : <span className="text-xs text-red-700">Rejected: {r.rejectMessage}</span>) },
                { key: 't', header: 'Time', cell: (r) => <span className="text-xs">{formatDateTime(r.at)}</span> },
              ]} />
          </Card>
          <Card>
            <CardHeader title="Holds" subtitle="Available = total − active holds, across all auctions" />
            <DataTable rows={holds} rowKey={(r) => r.id} empty={<p className="p-4 text-sm text-slate-500">No holds.</p>}
              columns={[
                { key: 'cp', header: 'Partner', cell: (r) => name(r.cpId) },
                { key: 'a', header: 'Amount', cell: (r) => formatINR(r.amount) },
                { key: 's', header: 'State', cell: (r) => <StatusBadge status={r.state} /> },
                { key: 'u', header: 'Updated', cell: (r) => <span className="text-xs">{formatDateTime(r.updatedAt)}</span> },
              ]} />
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-5 text-sm space-y-2">
            {live ? <><p className="text-slate-500">Closes in</p><Countdown endsAt={a.endsAt} now={now} className="text-3xl" /></> : <p className="font-semibold">Closed {a.closedAt ? formatDateTime(a.closedAt) : ''}</p>}
            <KeyValue items={[['Rules', `${formatINR(a.rules.startPrice)} start · +${formatINR(a.rules.increment)} · ${a.rules.durationMs / 60000} min`], ['Leading', top ? `${formatINR(top.amount)} (${name(top.cpId)})` : '—'], ['Min next', formatINR(minNextBid(s, a))], ['Accepted bids', acceptedBids(s, a.id).length], ['Eligible at start', lead.eligibleCpIds.map(name).join(', ') || 'None']]} />
            {pur && <p className="rounded bg-teal-50 p-2">Purchase {pur.receiptNo} · {formatINR(pur.amount)} · {name(pur.cpId)}</p>}
            {a.cancelReason && <p className="rounded bg-slate-100 p-2">Cancelled: {a.cancelReason}</p>}
          </Card>
          <Card className="p-4 text-sm space-y-3">
            <p className="font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-600" />Demo-only controls <DemoTag /></p>
            {live && <>
              <div className="flex gap-2">
                <Select aria-label="Bid as" value={asCp} onChange={(e) => setAsCp(e.target.value)}><option value="">Auto-pick competitor</option>{s.cps.map((c) => <option key={c.id} value={c.id}>{c.displayName}{cpEligibility(s, c.id, lead).eligible ? '' : ' (ineligible)'}</option>)}</Select>
                <Button size="sm" variant="secondary" onClick={() => { const r = act((d, ctx) => simulateCompetingBid(d, ctx, a.id, { asCpId: asCp || undefined })); if (r) toast.push(r.ok ? { tone: 'info', title: `Simulated bid ${formatINR(r.bid.amount)}` } : { tone: 'warning', title: 'Simulated bid rejected', body: r.message }); }}>Bid min</Button>
              </div>
              <Checkbox checked={!!a.demoFailSettlement} onChange={(v) => act((d) => { const x = d.auctions.find((y) => y.id === a.id)!; x.demoFailSettlement = v; })} label="Simulate settlement failure at close" />
              <Button size="sm" variant="amber" onClick={() => ask({ title: 'End auction now? (demo only)', body: 'Moves the closing time to now and runs settlement. Real auctions never close early.', confirmLabel: 'End now', tone: 'amber', onConfirm: () => act((d, ctx) => demoEndAuctionNow(d, ctx, a.id), { success: 'Auction closed (demo)' }) })}>End auction now</Button>
            </>}
            {['assigned', 'expired_no_bids'].includes(a.state) && <Button size="sm" variant="secondary" onClick={() => { const before = s.ledger.length + s.purchases.length + s.assignments.length; const r = act((d, ctx) => { const out = settleAuction(d, ctx, a.id); return { out, after: d.ledger.length + d.purchases.length + d.assignments.length }; }); if (r) toast.push({ tone: 'info', title: `Settlement repeated: ${r.out.outcome.replace(/_/g, ' ')}`, body: r.after === before ? 'Idempotent: no second debit, receipt or assignment was created.' : 'Unexpected change — check the ledger.' }); }}>Repeat settlement request</Button>}
            {a.state === 'expired_no_bids' && <LinkButton size="sm" to={`/admin/enquiries/${enq.id}`} variant="secondary">Review & relaunch lead</LinkButton>}
          </Card>
        </aside>
      </div>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel auction" footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep running</Button><Button variant="danger" disabled={!cancelReason.trim()} onClick={() => { if (act((d, ctx) => cancelAuction(d, ctx, a.id, cancelReason), { success: 'Auction cancelled, holds released' }) !== undefined) setCancelOpen(false); }}>Cancel auction</Button></>}>
        <Field label="Reason" required htmlFor="c-r"><Input id="c-r" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
        <p className="mt-2 text-xs text-slate-500">All active holds are released immediately. No contact details are disclosed.</p>
      </Dialog>
      {node}
    </>
  );
}

export function DisputesAdmin() {
  useDocumentTitle('Disputes');
  const s = useDb();
  const act = useAct();
  const toast = useToast();
  const [tab, setTab] = useState<'disputes' | 'tickets'>('disputes');
  const [dlg, setDlg] = useState<null | { id: string; approve: boolean }>(null);
  const [note, setNote] = useState('');
  const rows = [...s.disputes].sort((a, b) => (a.status === 'requested' ? -1 : 1) - (b.status === 'requested' ? -1 : 1) || b.createdAt - a.createdAt);
  return (
    <>
      <PageHeader title="Disputes, refunds & support" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Disputes' }]} subtitle="Refunds need admin approval and create one separate ledger credit. Non-conversion alone is not a refund reason." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'disputes', label: `Lead disputes (${s.disputes.filter((d) => d.status === 'requested').length} open)` }, { id: 'tickets', label: `Customer support (${s.tickets.filter((t) => t.status === 'open').length} open)` }]} />
      {tab === 'disputes' ? (
        <div className="mt-4 space-y-3">
          {!rows.length && <Card><EmptyState title="No disputes" /></Card>}
          {rows.map((d) => {
            const pur = s.purchases.find((p) => p.id === d.purchaseId)!;
            const asg = s.assignments.find((x) => x.purchaseId === pur.id)!;
            const acts = s.activities.filter((x) => x.assignmentId === asg.id && ['call_preview', 'message_preview', 'note'].includes(x.kind));
            return (
              <Card key={d.id} className="p-4 sm:p-5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold text-navy-900">{DISPUTE_REASON_LABEL[d.reason]}</p><p className="text-xs text-slate-500">{d.id} · {s.cps.find((c) => c.id === d.cpId)?.displayName} · receipt {pur.receiptNo} · {formatINR(pur.amount)} · raised {formatDateTime(d.createdAt)}</p></div>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-2 bg-slate-50 rounded p-2">“{d.evidence}”</p>
                {acts.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-teal-700">CP activity log ({acts.length})</summary><ul className="mt-1 text-xs text-slate-600 list-disc pl-5">{acts.map((x) => <li key={x.id}>{formatDateTime(x.at)} — {x.text}</li>)}</ul></details>}
                {d.status === 'requested' ? (
                  <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => { setNote(''); setDlg({ id: d.id, approve: true }); }}>Approve refund</Button><Button size="sm" variant="secondary" onClick={() => { setNote(''); setDlg({ id: d.id, approve: false }); }}>Reject</Button></div>
                ) : (
                  <div className="mt-3 text-xs text-slate-600 flex flex-wrap items-center gap-2"><span>Decision: {d.decisionNote} · {d.decidedAt && formatDateTime(d.decidedAt)}{d.refundLedgerId ? ` · refund ledger ${d.refundLedgerId}` : ''}</span>
                    <Button size="sm" variant="ghost" onClick={() => { const r = act((st, ctx) => decideDispute(st, ctx, d.id, true, 'Repeat request (demo)')); if (r) toast.push({ tone: 'info', title: r.credited ? 'Credited' : 'No change', body: 'A decided dispute cannot be credited again.' }); }}>Repeat approval (idempotency demo)</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="mt-4">
          <DataTable rows={[...s.tickets].reverse()} rowKey={(r) => r.id} empty={<EmptyState title="No support tickets" />}
            columns={[
              { key: 'k', header: 'Type', cell: (r) => <Badge tone={r.kind === 'stop_sharing' ? 'red' : 'amber'}>{r.kind.replace(/_/g, ' ')}</Badge> },
              { key: 't', header: 'Message', cell: (r) => <span className="text-sm">{r.text}</span> },
              { key: 'e', header: 'Enquiry', cell: (r) => (r.enquiryId ? <Link className="text-teal-700" to={`/admin/enquiries/${r.enquiryId}`}>{r.enquiryId.toUpperCase()}</Link> : '—') },
              { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              { key: 'a', header: '', className: 'text-right', cell: (r) => r.status === 'open' && <Button size="sm" variant="secondary" onClick={() => act((st, ctx) => { const t = st.tickets.find((x) => x.id === r.id)!; t.status = 'closed'; audit(st, ctx, 'support.closed', 'ticket', t.id); }, { success: 'Ticket closed' })}>Close</Button> },
            ]} />
        </Card>
      )}
      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve refund' : 'Reject dispute'} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant={dlg?.approve ? 'primary' : 'danger'} disabled={!note.trim()} onClick={() => { const r = act((st, ctx) => decideDispute(st, ctx, dlg!.id, dlg!.approve, note), { success: dlg?.approve ? 'Refund credited once' : 'Dispute rejected — balance unchanged' }); if (r) setDlg(null); }}>Confirm</Button></>}>
        <Field label="Decision note" required htmlFor="d-n"><Textarea id="d-n" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="mt-2 text-xs text-slate-500">{dlg?.approve ? 'Creates a separate refund credit in the ledger. The original purchase is not edited.' : 'No balance change.'}</p>
      </Dialog>
    </>
  );
}

export function DemoControls() {
  useDocumentTitle('Demo controls');
  const s = useDb();
  const act = useAct();
  const toast = useToast();
  const nav = useNavigate();
  const now = useNow();
  const { ask, node } = useConfirm();
  const [proj, setProj] = useState('');
  const [auc, setAuc] = useState('');
  const published = s.projects.filter((p) => p.status === 'published');
  const pendingEnq = s.enquiries.filter((e) => e.status === 'qualification_pending' && e.duplicateReview !== 'flagged').sort((a, b) => b.createdAt - a.createdAt);
  const liveAuctions = s.auctions.filter((a) => a.state === 'live');
  const advance = (min: number) => { clock.advance(min * 60_000); toast.push({ tone: 'info', title: `Demo clock +${min} min`, body: 'Due auctions were closed by the settlement worker.' }); };
  const steps: [string, string, string][] = [
    ['Developer submits a project', 'Nikhil (Sahyadri Habitat) → New project → Submit for review', '/developer/projects/new'],
    ['Admin publishes it', 'Admin → Listings → Approve & publish', '/admin/listings'],
    ['CP shows interest', 'Sameer (Kulkarni Realty) → Projects → Mark Interested', '/cp/projects'],
    ['Customer enquires and consents', 'Guest → project page → Enquire → OTP 123456', '/projects'],
    ['Admin qualifies & previews matching', 'Admin → Qualification → open enquiry → Qualify', '/admin/enquiries'],
    ['Admin starts the auction', 'Enquiry page → Start auction', '/admin/enquiries'],
    ['CP tops up and bids', 'Sameer → Wallet → Add ₹1,000 → Auctions → Place bid', '/cp/wallet'],
    ['Another CP outbids', 'Admin auction page → “Bid min” as another partner, or switch to Aditi (Deshmukh) and bid', '/cp/auctions'],
    ['CP rebids', 'Sameer → Place bid at the new minimum', '/cp/auctions'],
    ['Clock closes the auction', 'Here → Advance clock +10 min', '/admin/demo'],
    ['Winner charged once & sees contacts; loser released', 'Sameer → My leads; Aditi → Wallet ledger', '/cp/leads'],
    ['Winner adds follow-up & site visit', 'Lead page → Add follow-up / Schedule site visit', '/cp/leads'],
    ['Admin reviews a dispute', 'Admin → Disputes → Approve or reject', '/admin/disputes'],
  ];
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2">Demo controls <DemoTag>Demo only</DemoTag></span>} crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Demo controls' }]} subtitle="These shortcuts exist only for demonstration. None of them exist in a production marketplace." />
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-4 sm:p-5 space-y-3 text-sm">
          <p className="font-semibold text-navy-900 flex items-center gap-2"><Sprout className="h-4 w-4" />1. Seed a verified enquiry</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select aria-label="Project" value={proj} onChange={(e) => setProj(e.target.value)}><option value="">Next project (rotates)</option>{published.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Button onClick={() => { const e = act((d, ctx) => demoSeedEnquiry(d, ctx, proj || undefined), { success: 'Demo enquiry created (phone verified, consent given)' }); if (e) nav(`/admin/enquiries/${e.id}`); }}>Seed enquiry</Button>
          </div>
        </Card>
        <Card className="p-4 sm:p-5 space-y-3 text-sm">
          <p className="font-semibold text-navy-900 flex items-center gap-2"><Gavel className="h-4 w-4" />2. Quick-qualify & start auction</p>
          {!pendingEnq.length ? <p className="text-slate-500">No enquiries awaiting qualification (duplicate-flagged ones must be reviewed manually).</p> : (
            <ul className="space-y-2">{pendingEnq.slice(0, 4).map((e) => <li key={e.id} className="flex items-center justify-between gap-2"><span>{e.id.toUpperCase()} · {s.projects.find((p) => p.id === e.projectId)?.name ?? 'General'}</span><Button size="sm" variant="amber" onClick={() => { const a = act((d, ctx) => demoQualifyAndStart(d, ctx, e.id), { success: 'Qualified and auction started' }); if (a) nav(`/admin/auctions/${a.id}`); }}>Qualify & start</Button></li>)}</ul>
          )}
        </Card>
        <Card className="p-4 sm:p-5 space-y-3 text-sm">
          <p className="font-semibold text-navy-900">3. Simulate another bidder</p>
          {!liveAuctions.length ? <p className="text-slate-500">No live auctions.</p> : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Select aria-label="Auction" value={auc} onChange={(e) => setAuc(e.target.value)}><option value="">Choose a live auction</option>{liveAuctions.map((a) => <option key={a.id} value={a.id}>{a.id} · {s.leads.find((l) => l.id === a.leadId)?.matches.map((m) => s.projects.find((p) => p.id === m.projectId)?.name).join(', ')} · {formatINR(minNextBid(s, a))} next</option>)}</Select>
              <Button variant="secondary" disabled={!auc} onClick={() => { const r = act((d, ctx) => simulateCompetingBid(d, ctx, auc)); if (r) toast.push(r.ok ? { tone: 'info', title: `Competing bid ${formatINR(r.bid.amount)} by ${s.cps.find((c) => c.id === r.bid.cpId)?.displayName}` } : { tone: 'warning', title: 'Rejected', body: r.message }); }}>Place competing bid</Button>
            </div>
          )}
        </Card>
        <Card className="p-4 sm:p-5 space-y-3 text-sm">
          <p className="font-semibold text-navy-900 flex items-center gap-2"><FastForward className="h-4 w-4" />4. Advance the demo clock</p>
          <p className="text-slate-500">Now {formatDateTime(now)}{s.clockOffsetMs ? ` (offset +${Math.round(s.clockOffsetMs / 60000)} min)` : ''}. {liveAuctions.length} live auction(s).</p>
          <div className="flex flex-wrap gap-2">{[1, 5, 10, 30].map((m) => <Button key={m} variant="secondary" onClick={() => advance(m)}>+{m} min</Button>)}</div>
        </Card>
        <Card className="p-4 sm:p-5 space-y-3 text-sm lg:col-span-2">
          <p className="font-semibold text-navy-900 flex items-center gap-2"><RotateCcw className="h-4 w-4" />5. Reset</p>
          <p className="text-slate-500">Restores the seed: 12 projects, 3 developers, 6 partners, 15 enquiries, 6 auctions. Live seed auctions restart relative to now.</p>
          <Button variant="danger" onClick={() => ask({ title: 'Reset all demo data?', body: 'All changes in this browser are lost.', tone: 'danger', confirmLabel: 'Reset', onConfirm: () => { resetDemo(); nav('/'); } })}>Reset demo data</Button>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="End-to-end walkthrough" subtitle="Switch personas with the role menu in the yellow demo bar." />
        <ol className="divide-y divide-slate-100 text-sm">
          {steps.map(([t, how, to], i) => (
            <li key={t} className="px-4 sm:px-5 py-3 flex items-start gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-navy-800 text-white text-xs flex items-center justify-center tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-medium">{t}</p><p className="text-xs text-slate-500">{how}</p></div>
              <Link to={to} className={cx('text-xs font-semibold text-teal-700 hover:underline shrink-0')}>Go</Link>
            </li>
          ))}
        </ol>
        <p className="px-4 sm:px-5 py-3 text-xs text-slate-500 border-t border-slate-100">Also try: bidding with Meera Joshi (₹1,000 balance) for insufficient funds; bidding on a closed auction for a late-bid rejection; Rohit Mehta’s flagged duplicate; Imran Qureshi’s withdrawal-cancelled auction; Skyway Realty (suspended) for an ineligible bidder.</p>
      </Card>
      {node}
    </>
  );
}
