import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, BadgeCheck, ClipboardList, Inbox, Gavel, Scale, Wallet, ScrollText, FlaskConical, Settings } from 'lucide-react';
import PortalLayout from '../../layouts/PortalLayout';
import { useAct, useDb, useDocumentTitle } from '../../state/hooks';
import { adminMetrics } from '../../domain/views';
import { moderateProject, reviewCp, reviewDeveloper, reviewRegistration } from '../../domain/projects';
import { adminAdjust, walletBalance } from '../../domain/wallet';
import { validateRules } from '../../domain/auction';
import { formatDate, formatDateTime, formatINR, formatPossession, rupees } from '../../domain/format';
import { Badge, Button, Card, CardHeader, DataTable, DemoTag, Dialog, EmptyState, Field, Input, KeyValue, PageHeader, Stat, StatusBadge, Tabs, Textarea, useConfirm } from '../../ui/kit';
import { NotFound } from '../customer/Collections';
import { summary } from '../customer/common';
import { ProjectVisual } from '../../ui/visuals';
import { AuctionAdmin, AuctionsAdmin, DemoControls, DisputesAdmin, EnquiriesAdmin, EnquiryAdmin } from './AdminLeads';
import { audit } from '../../domain/util';
import type { ReviewStatus } from '../../domain/types';

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Dashboard() {
  useDocumentTitle('Admin');
  const s = useDb();
  const m = adminMetrics(s);
  const q = {
    verification: s.developers.filter((d) => d.verificationStatus === 'pending').length + s.cps.filter((c) => c.reviewStatus === 'pending').length,
    listings: s.projects.filter((p) => p.status === 'submitted').length,
    qualification: s.enquiries.filter((e) => e.status === 'qualification_pending').length,
    duplicates: s.enquiries.filter((e) => e.duplicateReview === 'flagged').length,
    live: s.auctions.filter((a) => a.state === 'live').length,
    failed: s.auctions.filter((a) => a.state === 'settlement_failed').length,
    disputes: s.disputes.filter((d) => d.status === 'requested').length,
    tickets: s.tickets.filter((t) => t.status === 'open').length,
  };
  const rec = m.reconciliation;
  return (
    <>
      <PageHeader title="Marketplace overview" subtitle={<>All figures are derived from demo records and are simulated. <DemoTag /></>} actions={<Link to="/admin/demo" className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-navy-950 hover:bg-amber-400"><FlaskConical className="h-4 w-4" />Demo controls</Link>} />
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Queues</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Verification" value={q.verification} to="/admin/verification" tone={q.verification ? 'amber' : 'navy'} />
        <Stat label="Listings to review" value={q.listings} to="/admin/listings" tone={q.listings ? 'amber' : 'navy'} />
        <Stat label="To qualify" value={q.qualification} hint={`${q.duplicates} duplicate flag(s)`} to="/admin/enquiries" tone={q.qualification ? 'amber' : 'navy'} />
        <Stat label="Live auctions" value={q.live} hint={q.failed ? `${q.failed} settlement failure(s)` : 'No failures'} to="/admin/auctions" tone={q.failed ? 'red' : 'navy'} />
        <Stat label="Disputes" value={q.disputes} to="/admin/disputes" tone={q.disputes ? 'amber' : 'navy'} />
        <Stat label="Support tickets" value={q.tickets} to="/admin/disputes" />
      </div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mt-6 mb-2">Metrics (all time, demo data)</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Enquiries" value={m.enquiries} hint={`${m.verified} phone-verified`} />
        <Stat label="Qualification rate" value={pct(m.qualificationRate)} hint={`${m.qualified} qualified ÷ ${m.verified} verified`} />
        <Stat label="Eligible CPs per lead" value={m.eligiblePerLead.toFixed(1)} hint="Average at qualification/auction start" />
        <Stat label="Auction participation" value={pct(m.participation)} hint="Auctions with ≥1 bid ÷ all auctions" />
        <Stat label="No-bid rate" value={pct(m.noBidRate)} hint="Expired ÷ closed (assigned + expired)" />
        <Stat label="Lead purchase value" value={formatINR(m.revenue)} hint={`${m.assigned} assignment(s)`} tone="teal" />
        <Stat label="Refunds" value={formatINR(m.refunds)} hint={`Refund rate ${pct(m.refundRate)} of purchases`} />
        <Stat label="Visits / bookings" value={`${m.visits} / ${m.booked}`} hint="CP-reported" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Wallet reconciliation" subtitle="Sum of succeeded ledger entries must equal top-ups − purchases + refunds + adjustments" action={rec.expectedTotal === rec.ledgerTotal ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Mismatch</Badge>} />
        <div className="p-4 sm:p-5"><KeyValue items={[['Top-ups', formatINR(rec.topUps)], ['Lead purchases', `−${formatINR(rec.purchases)}`], ['Refunds', formatINR(rec.refunds)], ['Adjustments', formatINR(rec.adjustments)], ['Expected total', formatINR(rec.expectedTotal)], ['Ledger total (all CPs)', formatINR(rec.ledgerTotal)], ['Currently held in bids', formatINR(rec.held)]]} /></div>
      </Card>
    </>
  );
}

function Verification() {
  useDocumentTitle('Verification');
  const s = useDb();
  const act = useAct();
  const [tab, setTab] = useState<'cp' | 'dev'>('cp');
  const [dlg, setDlg] = useState<null | { kind: 'cp' | 'dev'; id: string; status: ReviewStatus }>(null);
  const [note, setNote] = useState('');
  const confirmDecision = () => {
    if (!dlg) return;
    if (dlg.status !== 'approved' && !note.trim()) return;
    const r = act((d, ctx) => (dlg.kind === 'cp' ? reviewCp(d, ctx, dlg.id, dlg.status, note) : reviewDeveloper(d, ctx, dlg.id, dlg.status, note)), { success: `Marked ${dlg.status}` });
    if (r) setDlg(null);
  };
  const actions = (kind: 'cp' | 'dev', id: string, status: ReviewStatus) => (
    <div className="flex flex-wrap gap-1 justify-end">
      {status !== 'approved' && <Button size="sm" onClick={() => { setNote(''); setDlg({ kind, id, status: 'approved' }); }}>Approve</Button>}
      {status === 'pending' && <Button size="sm" variant="secondary" onClick={() => { setNote(''); setDlg({ kind, id, status: 'rejected' }); }}>Reject</Button>}
      {status === 'approved' && <Button size="sm" variant="secondary" onClick={() => { setNote(''); setDlg({ kind, id, status: 'suspended' }); }}>Suspend</Button>}
    </div>
  );
  return (
    <>
      <PageHeader title="Verification queue" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Verification' }]} subtitle="Documents are file names only in this demo; no real identity checks run." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'cp', label: `Channel partners (${s.cps.filter((c) => c.reviewStatus === 'pending').length} pending)` }, { id: 'dev', label: `Developers (${s.developers.filter((d) => d.verificationStatus === 'pending').length} pending)` }]} />
      <Card className="mt-4">
        {tab === 'cp' ? (
          <DataTable rows={[...s.cps].sort((a, b) => (a.reviewStatus === 'pending' ? -1 : 1) - (b.reviewStatus === 'pending' ? -1 : 1))} rowKey={(r) => r.id} search={(r) => `${r.displayName} ${r.contactName} ${r.reviewStatus}`}
            columns={[
              { key: 'n', header: 'Partner', cell: (r) => <span><span className="font-medium">{r.displayName}</span><span className="block text-xs text-slate-500">{r.kind} · {r.experienceYears} yrs · {r.serviceLocalities.join(', ')}</span></span> },
              { key: 'r', header: 'Registration (demo)', cell: (r) => <code className="text-xs">{r.registrationNo}</code>, mobileHidden: true },
              { key: 'd', header: 'Documents', cell: (r) => <span className="text-xs">{r.documents.join(', ')}</span>, mobileHidden: true },
              { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.reviewStatus} /> },
              { key: 'a', header: '', className: 'text-right', cell: (r) => actions('cp', r.id, r.reviewStatus) },
            ]} />
        ) : (
          <DataTable rows={s.developers} rowKey={(r) => r.id} search={(r) => `${r.company} ${r.verificationStatus}`}
            columns={[
              { key: 'n', header: 'Company', cell: (r) => <span><span className="font-medium">{r.company}</span><span className="block text-xs text-slate-500">{r.contactPerson} · {r.cin}</span></span> },
              { key: 'd', header: 'Documents', cell: (r) => <span className="text-xs">{r.verificationDocs.join(', ')}</span>, mobileHidden: true },
              { key: 't', header: 'Submitted', cell: (r) => <span className="text-xs">{formatDate(r.submittedAt)}</span>, mobileHidden: true },
              { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.verificationStatus} /> },
              { key: 'a', header: '', className: 'text-right', cell: (r) => actions('dev', r.id, r.verificationStatus) },
            ]} />
        )}
      </Card>
      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={`Confirm: ${dlg?.status}`} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant={dlg?.status === 'approved' ? 'primary' : 'danger'} disabled={dlg?.status !== 'approved' && !note.trim()} onClick={confirmDecision}>Confirm</Button></>}>
        <Field label="Decision note" required={dlg?.status !== 'approved'} htmlFor="v-note" hint="Recorded in the audit trail."><Textarea id="v-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {dlg?.status === 'suspended' && <p className="mt-2 text-xs text-red-700">Suspended partners can’t bid. Existing holds stay until their auctions close.</p>}
      </Dialog>
    </>
  );
}

function Listings() {
  useDocumentTitle('Listings');
  const s = useDb();
  const nav = useNavigate();
  const [tab, setTab] = useState<'queue' | 'all'>('queue');
  const rows = s.projects.filter((p) => (tab === 'queue' ? p.status === 'submitted' : true)).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <PageHeader title="Listing moderation" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Listings' }]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: `Review queue (${s.projects.filter((p) => p.status === 'submitted').length})` }, { id: 'all', label: `All listings (${s.projects.length})` }]} />
      <Card className="mt-4">
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/admin/listings/${r.id}`)} search={(r) => `${r.name} ${r.locality} ${r.status}`} empty={<EmptyState title="Queue is clear" body="Submitted listings appear here." />}
          columns={[
            { key: 'n', header: 'Project', cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'd', header: 'Developer', cell: (r) => s.developers.find((d) => d.id === r.developerId)?.shortName },
            { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'r', header: 'Registration', cell: (r) => <StatusBadge status={r.registrationReview} /> },
            { key: 'u', header: 'Updated', cell: (r) => <span className="text-xs">{formatDateTime(r.updatedAt)}</span>, mobileHidden: true },
          ]} />
      </Card>
    </>
  );
}

function ListingReview() {
  const { id } = useParams();
  const s = useDb();
  const act = useAct();
  const { ask, node } = useConfirm();
  const [note, setNote] = useState('');
  const p = s.projects.find((x) => x.id === id);
  useDocumentTitle(p?.name ?? 'Listing');
  if (!p) return <NotFound />;
  const dev = s.developers.find((d) => d.id === p.developerId)!;
  const sm = summary(p);
  return (
    <>
      <PageHeader title={p.name} crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Listings', to: '/admin/listings' }, { label: p.name }]} subtitle={<span className="flex flex-wrap gap-2 items-center"><StatusBadge status={p.status} />{dev.company} · developer verification <StatusBadge status={dev.verificationStatus} /></span>} />
      <div className="grid lg:grid-cols-[1fr_22rem] gap-5">
        <div className="space-y-5 min-w-0">
          <ProjectVisual project={p} className="aspect-[16/7] rounded-xl" label />
          <Card><CardHeader title="Listing claims" />
            <div className="p-4 sm:p-5 space-y-3 text-sm">
              <KeyValue items={[['Locality', `${p.locality}, ${p.city}`], ['Type', `${p.propertyType} · ${p.constructionStatus.replace(/_/g, ' ')}`], ['Price', sm.priceLabel], ['Carpet', sm.carpetLabel], ['Possession', formatPossession(p.possession)], ['Inventory', `${sm.available}/${sm.units}`], ['Coordinates', `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`], ['CP terms', `${p.cpTerms.commissionPercent}% · ${p.cpTerms.payoutTrigger}`]]} />
              <p className="text-slate-600">{p.description}</p>
              <ul className="space-y-1">{p.configs.map((c) => <li key={c.id}>{c.label}: {c.carpetMinSqft}–{c.carpetMaxSqft} sq ft · {formatINR(c.priceMin)}–{formatINR(c.priceMax)} · {c.unitsAvailable}/{c.unitsTotal}</li>)}</ul>
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4 text-sm space-y-3">
            <p className="font-semibold text-navy-900">Registration review</p>
            <p><code>{p.registrationNo}</code><br /><span className="text-slate-500">{p.registrationAuthority}</span></p>
            <StatusBadge status={p.registrationReview} />
            <p className="text-xs text-slate-500">Demo: there is no registry connection. Mark “reviewed” only after checking the supplied certificate.</p>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => act((d, ctx) => reviewRegistration(d, ctx, p.id, 'reviewed'), { success: 'Registration marked reviewed' })}>Mark reviewed</Button><Button size="sm" variant="ghost" onClick={() => act((d, ctx) => reviewRegistration(d, ctx, p.id, 'mismatch'), { success: 'Marked mismatch' })}>Mismatch</Button></div>
          </Card>
          <Card className="p-4 text-sm space-y-3">
            <p className="font-semibold text-navy-900">Decision</p>
            <Field label="Note to developer" htmlFor="l-note"><Textarea id="l-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              {p.status === 'submitted' && <>
                <Button size="sm" onClick={() => ask({ title: 'Approve and publish?', body: <>The listing becomes visible on the customer website immediately. {p.registrationReview !== 'reviewed' && <strong>Registration details are not marked reviewed; customers will see “not yet reviewed”.</strong>}</>, confirmLabel: 'Approve & publish', onConfirm: () => act((d, ctx) => moderateProject(d, ctx, p.id, 'approve_and_publish', note || undefined), { success: 'Published' }) })}>Approve & publish</Button>
                <Button size="sm" variant="secondary" onClick={() => act((d, ctx) => moderateProject(d, ctx, p.id, 'approve', note || undefined), { success: 'Approved (not yet published)' })}>Approve only</Button>
                <Button size="sm" variant="secondary" onClick={() => act((d, ctx) => moderateProject(d, ctx, p.id, 'request_changes', note), { success: 'Changes requested' })}>Request changes</Button>
              </>}
              {p.status === 'approved' && <Button size="sm" onClick={() => act((d, ctx) => moderateProject(d, ctx, p.id, 'publish'), { success: 'Published' })}>Publish</Button>}
              {!['archived', 'draft'].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Archive listing?', body: 'It will be removed from search. This is recorded in the audit trail.', tone: 'danger', confirmLabel: 'Archive', onConfirm: () => act((d, ctx) => moderateProject(d, ctx, p.id, 'archive', note || undefined), { success: 'Archived' }) })}>Archive</Button>}
            </div>
            {p.status === 'draft' && <p className="text-xs text-slate-500">Draft — the developer hasn’t submitted it yet.</p>}
          </Card>
        </aside>
      </div>
      {node}
    </>
  );
}

function WalletsAdmin() {
  useDocumentTitle('Wallets');
  const s = useDb();
  const act = useAct();
  const [adj, setAdj] = useState<null | string>(null);
  const [amt, setAmt] = useState('');
  const [memo, setMemo] = useState('');
  return (
    <>
      <PageHeader title="Wallets & ledger" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Wallets' }]} subtitle="Prepaid lead balances in integer paise. No withdrawals, transfers or payouts exist in this prototype." />
      <Card>
        <DataTable rows={s.cps} rowKey={(r) => r.id}
          columns={[
            { key: 'n', header: 'Partner', cell: (r) => <span className="font-medium">{r.displayName}</span> },
            { key: 't', header: 'Total', cell: (r) => formatINR(walletBalance(s, r.id).total) },
            { key: 'h', header: 'Held', cell: (r) => <span className="text-amber-700">{formatINR(walletBalance(s, r.id).held)}</span> },
            { key: 'a', header: 'Available', cell: (r) => <span className="text-teal-700 font-semibold">{formatINR(walletBalance(s, r.id).available)}</span> },
            { key: 'e', header: 'Entries', cell: (r) => s.ledger.filter((l) => l.cpId === r.id).length, mobileHidden: true },
            { key: 'x', header: '', className: 'text-right', cell: (r) => <Button size="sm" variant="secondary" onClick={() => { setAmt(''); setMemo(''); setAdj(r.id); }}>Adjust</Button> },
          ]} />
      </Card>
      <Card className="mt-5">
        <CardHeader title="All ledger entries" />
        <DataTable rows={[...s.ledger].reverse()} rowKey={(r) => r.id} search={(r) => `${r.id} ${r.cpId} ${r.type} ${r.memo} ${r.ref} ${r.idempotencyKey}`} pageSize={15}
          columns={[
            { key: 'id', header: 'ID', cell: (r) => <code className="text-xs">{r.id}</code> },
            { key: 'cp', header: 'Partner', cell: (r) => s.cps.find((c) => c.id === r.cpId)?.displayName },
            { key: 't', header: 'Type', cell: (r) => r.type.replace(/_/g, ' ') },
            { key: 'a', header: 'Amount', cell: (r) => (r.amount ? formatINR(r.amount) : '—') },
            { key: 'h', header: 'Hold Δ', cell: (r) => (r.holdDelta ? formatINR(r.holdDelta) : '—'), mobileHidden: true },
            { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'k', header: 'Idempotency key', cell: (r) => <code className="text-[11px] text-slate-500">{r.idempotencyKey}</code>, mobileHidden: true },
            { key: 'at', header: 'Time', cell: (r) => <span className="text-xs">{formatDateTime(r.at)}</span>, mobileHidden: true },
          ]} />
      </Card>
      <Dialog open={!!adj} onClose={() => setAdj(null)} title="Admin adjustment" footer={<><Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button><Button onClick={() => { if (act((d, ctx) => adminAdjust(d, ctx, adj!, rupees(Number(amt)), memo), { success: 'Adjustment recorded' }) !== undefined) setAdj(null); }}>Record adjustment</Button></>}>
        <div className="space-y-3">
          <Field label="Amount (₹, negative to debit)" required htmlFor="a-amt"><Input id="a-amt" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
          <Field label="Reason" required htmlFor="a-memo"><Input id="a-memo" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
          <p className="text-xs text-slate-500">Creates a new ledger entry; existing entries are never edited. Can’t make available balance negative.</p>
        </div>
      </Dialog>
    </>
  );
}

function Audit() {
  useDocumentTitle('Audit trail');
  const s = useDb();
  const [sensitive, setSensitive] = useState(false);
  const name = (id: string) => s.users.find((u) => u.id === id)?.name ?? id;
  const rows = [...s.audit].reverse().filter((a) => !sensitive || a.sensitive);
  return (
    <>
      <PageHeader title="Audit trail" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Audit' }]} subtitle="Approvals, status changes, qualification, financial actions and sensitive contact access, with actor and time." />
      <Card>
        <DataTable rows={rows} rowKey={(r) => r.id} pageSize={20} search={(r) => `${r.action} ${r.objectType} ${r.objectId} ${name(r.actorId)} ${r.detail ?? ''}`}
          toolbar={<label className="text-sm flex items-center gap-2"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="rounded text-teal-600" />Sensitive access only</label>}
          columns={[
            { key: 'at', header: 'Time', cell: (r) => <span className="text-xs whitespace-nowrap">{formatDateTime(r.at)}</span> },
            { key: 'actor', header: 'Actor', cell: (r) => <span className="text-xs">{name(r.actorId)}</span> },
            { key: 'action', header: 'Action', cell: (r) => <span className="font-medium">{r.action} {r.sensitive && <Badge tone="red">sensitive</Badge>}</span> },
            { key: 'obj', header: 'Object', cell: (r) => <code className="text-xs">{r.objectType}:{r.objectId}</code> },
            { key: 'd', header: 'Detail', cell: (r) => <span className="text-xs text-slate-600">{r.detail}</span>, mobileHidden: true },
          ]} />
      </Card>
    </>
  );
}

function SettingsPage() {
  useDocumentTitle('Settings');
  const s = useDb();
  const act = useAct();
  const d = s.settings.auctionDefaults;
  const [f, setF] = useState({ start: String(d.startPrice / 100), inc: String(d.increment / 100), min: String(d.durationMs / 60000) });
  return (
    <>
      <PageHeader title="Auction policy" crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Settings' }]} subtitle="Proposed defaults requiring business validation. Changes apply to future auctions only; accepted bid terms never change." />
      <Card className="p-4 sm:p-6 max-w-xl">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act((st, ctx) => { const r = { startPrice: rupees(Number(f.start)), increment: rupees(Number(f.inc)), durationMs: Number(f.min) * 60000 }; validateRules(r); st.settings.auctionDefaults = r; audit(st, ctx, 'settings.auction_defaults', 'settings', 'auction', `start ${formatINR(r.startPrice)}, +${formatINR(r.increment)}, ${f.min} min`); }, { success: 'Defaults saved for future auctions' }); }}>
          <Field label="Opening bid (₹)" required htmlFor="s-s"><Input id="s-s" type="number" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Minimum increment (₹)" required htmlFor="s-i"><Input id="s-i" type="number" value={f.inc} onChange={(e) => setF({ ...f, inc: e.target.value })} /></Field>
          <Field label="Duration (minutes)" required htmlFor="s-d"><Input id="s-d" type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">Fixed rules: first-price ascending, earliest accepted bid wins ties, no time extension, one exclusive buyer per lead.</p>
          <Button type="submit">Save defaults</Button>
        </form>
      </Card>
    </>
  );
}

export default function AdminRoutes() {
  const s = useDb();
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/verification', label: 'Verification', icon: BadgeCheck, badge: s.cps.filter((c) => c.reviewStatus === 'pending').length + s.developers.filter((d) => d.verificationStatus === 'pending').length },
    { to: '/admin/listings', label: 'Listings', icon: ClipboardList, badge: s.projects.filter((p) => p.status === 'submitted').length },
    { to: '/admin/enquiries', label: 'Qualification', icon: Inbox, badge: s.enquiries.filter((e) => e.status === 'qualification_pending').length },
    { to: '/admin/auctions', label: 'Auctions', icon: Gavel, badge: s.auctions.filter((a) => a.state === 'settlement_failed').length },
    { to: '/admin/disputes', label: 'Disputes & support', icon: Scale, badge: s.disputes.filter((d) => d.status === 'requested').length },
    { to: '/admin/wallets', label: 'Wallets', icon: Wallet },
    { to: '/admin/audit', label: 'Audit trail', icon: ScrollText },
    { to: '/admin/settings', label: 'Auction policy', icon: Settings },
    { to: '/admin/demo', label: 'Demo controls', icon: FlaskConical },
  ];
  return (
    <Routes>
      <Route element={<PortalLayout role="admin" nav={nav} />}>
        <Route index element={<Dashboard />} />
        <Route path="verification" element={<Verification />} />
        <Route path="listings" element={<Listings />} />
        <Route path="listings/:id" element={<ListingReview />} />
        <Route path="enquiries" element={<EnquiriesAdmin />} />
        <Route path="enquiries/:id" element={<EnquiryAdmin />} />
        <Route path="auctions" element={<AuctionsAdmin />} />
        <Route path="auctions/:id" element={<AuctionAdmin />} />
        <Route path="disputes" element={<DisputesAdmin />} />
        <Route path="wallets" element={<WalletsAdmin />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="demo" element={<DemoControls />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
