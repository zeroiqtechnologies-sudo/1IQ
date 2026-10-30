import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Gavel, ShieldCheck, Clock, Users, Lock, Info } from 'lucide-react';
import { useAct, useDocumentTitle, useNow } from '../../state/hooks';
import { useCp, VerificationBanner } from './CpRoutes';
import { cpVisibleAuctions, toAuctionPreview } from '../../domain/views';
import { placeBid } from '../../domain/auction';
import { walletBalance } from '../../domain/wallet';
import { CONTACT_PREF_LABEL, PURPOSE_LABEL, TIMELINE_LABEL, bhkLabel, formatAge, formatDateTime, formatINR, formatPriceRange, rupees, timeAgo } from '../../domain/format';
import { Badge, Button, Card, CardHeader, Countdown, Dialog, EmptyState, Field, Input, LinkButton, PageHeader, Select, StatusBadge, cx } from '../../ui/kit';
import { useToast } from '../../ui/toast';
import type { AuctionPreview } from '../../domain/types';

const CHECK_LABEL: Record<string, string> = { contactVerified: 'Contact verified', requirementsComplete: 'Requirement complete', timelineConfirmed: 'Timeline confirmed', consentActive: 'Consent to share active', duplicateReviewed: 'Duplicate check done' };

function AuctionCard({ a, now }: { a: AuctionPreview; now: number }) {
  const live = a.state === 'live' && a.endsAt > now;
  return (
    <Card className={cx('p-4 flex flex-col gap-3', live && a.viewer.status === 'outbid' && 'ring-red-200', live && a.viewer.status === 'leading' && 'ring-teal-300')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Lead {a.leadId.toUpperCase()} · enquired {timeAgo(a.enquiryAt, now)}</p>
          <p className="font-semibold text-navy-900">{a.projects.map((p) => p.name).join(' + ')}</p>
        </div>
        {a.viewer.status !== 'none' ? <StatusBadge status={a.viewer.status} /> : <StatusBadge status={live ? 'live' : a.state} />}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge tone="navy">{bhkLabel(a.requirement.bhk)}</Badge>
        <Badge tone="navy">{formatPriceRange(a.requirement.budgetMin, a.requirement.budgetMax)}</Badge>
        <Badge tone="gray">{TIMELINE_LABEL[a.requirement.timeline]}</Badge>
        <Badge tone="gray">{PURPOSE_LABEL[a.requirement.purpose]}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-amber-50 ring-1 ring-amber-100 p-3 text-center">
        <div><p className="text-[11px] text-amber-800">Current bid</p><p className="font-bold tabular-nums">{a.currentBid ? formatINR(a.currentBid) : '—'}</p></div>
        <div><p className="text-[11px] text-amber-800">Next min</p><p className="font-bold tabular-nums">{formatINR(a.minNextBid)}</p></div>
        <div><p className="text-[11px] text-amber-800">{live ? 'Closes in' : 'Status'}</p>{live ? <Countdown endsAt={a.endsAt} now={now} /> : <p className="text-sm font-semibold text-slate-600">Closed</p>}</div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{a.bidderCount} bidder{a.bidderCount === 1 ? '' : 's'} · {a.bidCount} bids</span>
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-teal-600" />Qualified {timeAgo(a.qualification.qualifiedAt, now)}</span>
      </div>
      {!a.viewer.eligible && live && <p className="text-xs text-red-700 bg-red-50 rounded-md p-2">{a.viewer.ineligibleReason}</p>}
      <LinkButton to={`/cp/auctions/${a.auctionId}`} variant={live && a.viewer.eligible ? 'amber' : 'secondary'} size="sm">{live && a.viewer.eligible ? (a.viewer.status === 'leading' ? 'View · you’re leading' : 'View & bid') : 'View details'}</LinkButton>
    </Card>
  );
}

export function Auctions() {
  useDocumentTitle('Lead auctions');
  const { s, cp } = useCp();
  const now = useNow();
  const [f, setF] = useState({ project: '', locality: '', budget: '', timeline: '', closing: '', tab: 'live' as 'live' | 'closed' });
  const all = useMemo(() => cpVisibleAuctions(s, cp.id), [s, cp.id]);
  const projects = [...new Map(all.flatMap((a) => a.projects).map((p) => [p.projectId, p])).values()];
  const list = all
    .filter((a) => (f.tab === 'live' ? a.state === 'live' && a.endsAt > now : !(a.state === 'live' && a.endsAt > now)))
    .filter((a) => !f.project || a.projects.some((p) => p.projectId === f.project))
    .filter((a) => !f.locality || a.projects.some((p) => p.locality === f.locality))
    .filter((a) => !f.timeline || a.requirement.timeline === f.timeline)
    .filter((a) => !f.budget || (f.budget === 'lt1' ? a.requirement.budgetMax <= 1e9 : f.budget === '1to2' ? a.requirement.budgetMax > 1e9 && a.requirement.budgetMin < 2e9 : a.requirement.budgetMax >= 2e9))
    .filter((a) => !f.closing || a.endsAt - now <= Number(f.closing) * 60_000)
    .sort((a, b) => (f.tab === 'live' ? a.endsAt - b.endsAt : b.endsAt - a.endsAt));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PageHeader title="Lead auctions" crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Lead auctions' }]} subtitle="Anonymised, qualified, consented leads for projects you follow. Customer contact details unlock only for the winning bid." />
      <VerificationBanner />
      <div className="flex gap-2 mb-4">
        {(['live', 'closed'] as const).map((t) => <button key={t} onClick={() => set('tab', t)} className={cx('h-9 px-4 rounded-full text-sm font-medium', f.tab === t ? 'bg-navy-800 text-white' : 'bg-white ring-1 ring-slate-300 text-slate-700')}>{t === 'live' ? 'Live' : 'Closed & history'}</button>)}
      </div>
      <Card className="p-3 mb-5 grid grid-cols-2 md:grid-cols-5 gap-2">
        <Select aria-label="Project" value={f.project} onChange={(e) => set('project', e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</Select>
        <Select aria-label="Locality" value={f.locality} onChange={(e) => set('locality', e.target.value)}><option value="">All localities</option>{[...new Set(projects.map((p) => p.locality))].map((l) => <option key={l}>{l}</option>)}</Select>
        <Select aria-label="Budget" value={f.budget} onChange={(e) => set('budget', e.target.value)}><option value="">Any budget</option><option value="lt1">Up to ₹1 Cr</option><option value="1to2">₹1–2 Cr</option><option value="gt2">₹2 Cr+</option></Select>
        <Select aria-label="Buyer timeline" value={f.timeline} onChange={(e) => set('timeline', e.target.value)}><option value="">Any timeline</option>{Object.entries(TIMELINE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Closing time" value={f.closing} onChange={(e) => set('closing', e.target.value)} disabled={f.tab !== 'live'}><option value="">Any closing time</option><option value="2">Closing in 2 min</option><option value="5">In 5 min</option><option value="15">In 15 min</option></Select>
      </Card>
      {!list.length ? (
        <EmptyState icon={Gavel} title={f.tab === 'live' ? 'No live auctions match' : 'No closed auctions yet'} body={f.tab === 'live' ? 'Auctions appear when admin qualifies a lead for a project you’re Interested in.' : undefined} action={<LinkButton to="/cp/projects" variant="secondary" size="sm">Manage project interest</LinkButton>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((a) => <AuctionCard key={a.auctionId} a={a} now={now} />)}</div>
      )}
    </>
  );
}

export function AuctionDetail() {
  const { id } = useParams();
  const { s, cp } = useCp();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const auction = s.auctions.find((a) => a.id === id);
  useDocumentTitle('Auction');
  const visible = useMemo(() => cpVisibleAuctions(s, cp.id).some((a) => a.auctionId === id), [s, cp.id, id]);
  if (!auction || !visible) return <EmptyState title="Auction not available" body="Only partners interested in a matched project can view this auction." action={<LinkButton to="/cp/auctions">Back to auctions</LinkButton>} />;
  const a = toAuctionPreview(s, auction, cp.id);
  const live = a.state === 'live' && a.endsAt > now;
  const purchase = s.purchases.find((p) => p.auctionId === a.auctionId && p.cpId === cp.id);
  const asg = purchase && s.assignments.find((x) => x.purchaseId === purchase.id);
  // Anonymised bid history: other bidders labelled Partner A, B, …
  const accepted = s.bids.filter((b) => b.auctionId === a.auctionId && b.status === 'accepted').sort((x, y) => (y.seq ?? 0) - (x.seq ?? 0));
  const labels = new Map<string, string>();
  [...accepted].reverse().forEach((b) => { if (b.cpId !== cp.id && !labels.has(b.cpId)) labels.set(b.cpId, `Partner ${String.fromCharCode(65 + labels.size)}`); });
  const myRejected = s.bids.filter((b) => b.auctionId === a.auctionId && b.cpId === cp.id && b.status === 'rejected').sort((x, y) => y.at - x.at);

  return (
    <>
      <PageHeader title={a.projects.map((p) => p.name).join(' + ')} crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Lead auctions', to: '/cp/auctions' }, { label: a.leadId.toUpperCase() }]}
        actions={live && a.viewer.eligible ? <Button variant="amber" size="lg" onClick={() => setOpen(true)}><Gavel className="h-4 w-4" />Place bid · min {formatINR(a.minNextBid)}</Button> : undefined} />
      <VerificationBanner />
      {asg && <div className="mb-5 rounded-xl bg-teal-50 ring-1 ring-teal-200 p-4 text-sm flex flex-wrap items-center justify-between gap-3"><p><strong>You won this lead</strong> for {formatINR(purchase!.amount)} · receipt {purchase!.receiptNo}. Contact details are unlocked.</p><LinkButton to={`/cp/leads/${asg.id}`} size="sm">Open lead</LinkButton></div>}
      {!asg && a.viewer.status === 'lost' && <div className="mb-5 rounded-xl bg-slate-100 p-4 text-sm">This auction closed{a.state === 'cancelled' ? ' after cancellation' : ''} and you did not win. You were not charged, and any hold was released.</div>}
      {live && !a.viewer.eligible && <div className="mb-5 rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-800"><strong>You can’t bid on this lead.</strong> {a.viewer.ineligibleReason}</div>}

      <div className="grid lg:grid-cols-[1fr_22rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Buyer requirement" subtitle="Anonymised preview. Name, phone, email, address and free-text notes stay hidden until purchase." action={<Badge tone="gray"><Lock className="h-3 w-3" />Contact locked</Badge>} />
            <dl className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><dt className="text-slate-500">Budget</dt><dd className="font-semibold">{formatPriceRange(a.requirement.budgetMin, a.requirement.budgetMax)}</dd></div>
              <div><dt className="text-slate-500">Configuration</dt><dd className="font-semibold">{bhkLabel(a.requirement.bhk)}</dd></div>
              <div><dt className="text-slate-500">Timeline</dt><dd className="font-semibold">{TIMELINE_LABEL[a.requirement.timeline]}</dd></div>
              <div><dt className="text-slate-500">Purpose</dt><dd className="font-semibold">{PURPOSE_LABEL[a.requirement.purpose]}</dd></div>
              <div><dt className="text-slate-500">Prefers</dt><dd className="font-semibold">{CONTACT_PREF_LABEL[a.requirement.contactPreference]}</dd></div>
              <div><dt className="text-slate-500">Localities</dt><dd className="font-semibold">{a.requirement.preferredLocalities.join(', ') || 'Not specified'}</dd></div>
              <div><dt className="text-slate-500">Lead age</dt><dd className="font-semibold">{formatAge(now - a.enquiryAt)}</dd></div>
              <div><dt className="text-slate-500">City</dt><dd className="font-semibold">{a.requirement.city}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Project match" />
            <ul className="divide-y divide-slate-100">
              {a.projects.map((p) => (
                <li key={p.projectId} className="px-4 sm:px-5 py-3 text-sm">
                  <p className="font-medium">{p.name} <span className="text-slate-500 font-normal">· {p.locality}</span> {p.primary ? <Badge tone="teal">Enquired project</Badge> : <Badge tone="blue">Alternative (customer allowed)</Badge>}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">{p.reasons.map((r) => <li key={r}><Badge tone="gray">{r}</Badge></li>)}</ul>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Qualification evidence" subtitle={`Qualified ${formatDateTime(a.qualification.qualifiedAt)}${a.qualification.contactVerifiedAt ? ` · contact verified ${formatDateTime(a.qualification.contactVerifiedAt)}` : ''}`} />
            <div className="p-4 sm:p-5 space-y-3 text-sm">
              <ul className="grid sm:grid-cols-2 gap-1.5">{Object.entries(a.qualification.checks).map(([k, v]) => <li key={k} className="flex items-center gap-2"><ShieldCheck className={cx('h-4 w-4', v ? 'text-teal-600' : 'text-slate-300')} />{CHECK_LABEL[k]}</li>)}</ul>
              <ul className="list-disc pl-5 text-slate-600">{a.qualification.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              <p className="text-xs text-slate-500">Budget is customer-stated; financial capacity has not been verified. Evidence is demo data.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Bid history" subtitle="Other partners are anonymised" />
            {!accepted.length ? <EmptyState title="No bids yet" body={`Opening bid is ${formatINR(a.rules.startPrice)}.`} /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {accepted.map((b, i) => (
                  <li key={b.id} className={cx('px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3', b.cpId === cp.id && 'bg-teal-50/50')}>
                    <span>{b.cpId === cp.id ? <strong>You</strong> : labels.get(b.cpId)} {i === 0 && <Badge tone={a.state === 'assigned' ? 'green' : 'amber'}>{a.state === 'assigned' ? 'Winning bid' : 'Leading'}</Badge>}</span>
                    <span className="text-right"><span className="font-semibold tabular-nums">{formatINR(b.amount)}</span><span className="block text-[11px] text-slate-500">#{b.seq} · {formatDateTime(b.at)}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {myRejected.length > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-1">Your rejected attempts</p>
                <ul className="space-y-1 text-xs">{myRejected.slice(0, 5).map((b) => <li key={b.id} className="text-red-700">{formatINR(b.amount)} · {b.rejectMessage} · {formatDateTime(b.at)}</li>)}</ul>
              </div>
            )}
          </Card>
        </div>
        <aside className="space-y-4">
          <div className="lg:sticky lg:top-24 space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between"><p className="text-sm text-slate-500 flex items-center gap-1"><Clock className="h-4 w-4" />{live ? 'Closes in' : 'Auction'}</p><StatusBadge status={live ? 'live' : a.state} /></div>
              {live ? <Countdown endsAt={a.endsAt} now={now} className="text-4xl block mt-1" /> : <p className="text-lg font-semibold mt-1">Closed</p>}
              <p className="text-xs text-slate-500 mt-1">Ends {formatDateTime(a.endsAt)} · no time extensions</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500 text-xs">Current bid</p><p className="font-bold text-lg tabular-nums">{a.currentBid ? formatINR(a.currentBid) : '—'}</p></div>
                <div><p className="text-slate-500 text-xs">Minimum next</p><p className="font-bold text-lg tabular-nums text-amber-700">{formatINR(a.minNextBid)}</p></div>
                <div><p className="text-slate-500 text-xs">Your status</p><StatusBadge status={a.viewer.status} label={a.viewer.status === 'none' ? 'Not bid' : undefined} /></div>
                <div><p className="text-slate-500 text-xs">Your hold</p><p className="font-semibold tabular-nums">{formatINR(a.viewer.myHold)}</p></div>
              </div>
              {live && a.viewer.eligible && <Button variant="amber" className="w-full mt-4" onClick={() => setOpen(true)}>Place bid</Button>}
              <div className="mt-4 text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
                <p className="font-semibold text-slate-600">Auction terms (set by admin, fixed for this auction)</p>
                <p>Opening {formatINR(a.rules.startPrice)} · steps of {formatINR(a.rules.increment)} · {Math.round(a.rules.durationMs / 60000)} min</p>
                <p>Highest valid bid at close wins and pays its own amount. Ties go to the earliest accepted bid. Losing bids pay nothing.</p>
                <p>The fee buys access to this enquiry only. It doesn’t guarantee a booking and is separate from developer commission terms.</p>
              </div>
            </Card>
          </div>
        </aside>
      </div>
      {open && <BidDialog a={a} onClose={() => setOpen(false)} />}
    </>
  );
}

function BidDialog({ a, onClose }: { a: AuctionPreview; onClose: () => void }) {
  const { s, cp } = useCp();
  const now = useNow();
  const act = useAct();
  const toast = useToast();
  const [amountInr, setAmountInr] = useState(String(a.minNextBid / 100));
  const bal = walletBalance(s, cp.id);
  const live = toAuctionPreview(s, s.auctions.find((x) => x.id === a.auctionId)!, cp.id);
  const amount = rupees(Number(amountInr) || 0);
  const leading = live.viewer.status === 'leading';
  const needed = leading ? amount - live.viewer.myHold : amount;
  let error = '';
  if (!amountInr || amount <= 0) error = 'Enter an amount';
  else if (amount < live.minNextBid) error = `Minimum next bid is ${formatINR(live.minNextBid)}`;
  else if ((amount - live.rules.startPrice) % live.rules.increment !== 0) error = `Use steps of ${formatINR(live.rules.increment)}`;
  else if (needed > bal.available) error = `You need ${formatINR(needed)} available. Add demo funds in Wallet.`;
  const closed = live.endsAt <= now || live.state !== 'live';
  const submit = () => {
    // The service re-validates everything (time, eligibility, funds, increment) — client checks are only hints.
    const r = act((d, ctx) => placeBid(d, ctx, a.auctionId, cp.id, amount));
    if (!r) return;
    if (r.ok) { toast.push({ tone: 'success', title: `Bid accepted: ${formatINR(amount)}`, body: leading ? `Held an extra ${formatINR(needed)}.` : `Held ${formatINR(amount)} from your balance.` }); onClose(); }
    else toast.push({ tone: 'danger', title: 'Bid rejected', body: r.message });
  };
  return (
    <Dialog open onClose={onClose} title="Place a bid" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="amber" onClick={submit} disabled={!!error && !closed}>{closed ? 'Submit anyway (will be late)' : `Confirm bid ${amount ? formatINR(amount) : ''}`}</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3"><span>Closes in</span><Countdown endsAt={live.endsAt} now={now} className="text-lg" /></div>
        <Field label="Your bid (₹)" required error={closed ? undefined : error} htmlFor="bid-amt" hint={`Minimum ${formatINR(live.minNextBid)} · steps of ${formatINR(live.rules.increment)}`}>
          <Input id="bid-amt" type="number" inputMode="numeric" min={live.minNextBid / 100} step={live.rules.increment / 100} value={amountInr} onChange={(e) => setAmountInr(e.target.value)} invalid={!!error && !closed} />
        </Field>
        <div className="flex flex-wrap gap-2">{[0, 1, 2, 5].map((k) => { const v = live.minNextBid + k * live.rules.increment; return <Button key={k} size="sm" variant="secondary" onClick={() => setAmountInr(String(v / 100))}>{formatINR(v)}</Button>; })}</div>
        <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100">
          <div className="flex justify-between p-2.5"><span className="text-slate-500">Available now</span><span className="tabular-nums font-medium">{formatINR(bal.available)}</span></div>
          <div className="flex justify-between p-2.5"><span className="text-slate-500">{leading ? 'Extra hold (you’re leading)' : 'Will be held'}</span><span className="tabular-nums font-medium text-amber-700">−{formatINR(Math.max(0, needed))}</span></div>
          <div className="flex justify-between p-2.5"><span className="text-slate-500">Available after bid</span><span className={cx('tabular-nums font-semibold', bal.available - needed < 0 ? 'text-red-600' : 'text-teal-700')}>{formatINR(bal.available - Math.max(0, needed))}</span></div>
        </div>
        <p className="text-xs text-slate-500 flex gap-1.5"><Info className="h-4 w-4 shrink-0" />Held funds are released immediately if another partner outbids you. If you win, the hold becomes the lead purchase. Nothing is charged if you lose. {closed && <strong className="text-red-700">This auction has closed — the service will reject a late bid.</strong>}</p>
      </div>
    </Dialog>
  );
}
