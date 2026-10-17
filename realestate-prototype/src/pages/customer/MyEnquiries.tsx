import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Languages, LifeBuoy, MessageSquareWarning, UserRound, XCircle } from 'lucide-react';
import { useAct, useDb, useDocumentTitle, useSession } from '../../state/hooks';
import { CONTACT_PREF_LABEL, CONTACT_TIME_LABEL, TIMELINE_LABEL, bhkLabel, formatDateTime, formatPriceRange, normalizePhone } from '../../domain/format';
import { raiseSupportTicket, setContactPreference, withdrawConsent, DEMO_OTP } from '../../domain/enquiry';
import { requestVisit } from '../../domain/crm';
import { customerUserId } from '../../domain/util';
import { auth } from '../../services/local';
import { Breadcrumbs, Button, Card, CardHeader, DemoTag, Dialog, EmptyState, Field, Input, KeyValue, LinkButton, Select, StatusBadge, Textarea, cx, useConfirm } from '../../ui/kit';
import type { ContactPreference, ContactTime, DbState, Enquiry } from '../../domain/types';

/** Customer-facing status. Never reveals bids, auctions or CP financial data. */
function customerStage(s: DbState, e: Enquiry): { label: string; step: number } {
  if (e.status === 'withdrawn') return { label: 'Withdrawn', step: -1 };
  if (e.status === 'rejected') return { label: 'Closed after review', step: -1 };
  if (e.status === 'duplicate') return { label: 'Merged with an earlier enquiry', step: -1 };
  if (e.status === 'verification_pending' || e.status === 'received') return { label: 'Verify your phone', step: 0 };
  if (e.status === 'qualification_pending') return { label: 'Under review', step: 1 };
  if (e.status === 'qualified' || e.status === 'in_auction' || e.status === 'unassigned') return { label: 'Finding your partner', step: 2 };
  if (s.assignments.some((a) => a.enquiryId === e.id)) return { label: 'Partner assigned', step: 3 };
  return { label: e.status, step: 1 };
}

function CustomerSignIn() {
  const s = useDb();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const c = s.customers.find((x) => x.phoneNormalized === normalizePhone(phone));
    if (!sent) { if (!c) { setErr('No enquiries found for this number. Check the number or make an enquiry.'); return; } setErr(''); setSent(true); return; }
    if (code !== DEMO_OTP) { setErr('Incorrect code. In demo mode it is 123456.'); return; }
    auth.signInAs(customerUserId(c!.id));
  };
  const demo = s.customers.slice(0, 4);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-navy-900">Track your enquiries</h1>
      <p className="text-sm text-slate-500 mt-1">Sign in with the mobile number you used to enquire.</p>
      <Card className="mt-5 p-5">
        <form onSubmit={go} className="space-y-3">
          <Field label="Mobile number" required htmlFor="t-phone" error={!sent ? err : undefined}><Input id="t-phone" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSent(false); }} placeholder="+91 99999 00001" /></Field>
          {sent && <Field label="One-time code" required htmlFor="t-otp" error={err} hint={<>Demo code: 123456 <DemoTag /></>}><Input id="t-otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>}
          <Button type="submit" className="w-full">{sent ? 'Verify & view enquiries' : 'Send code'}</Button>
        </form>
      </Card>
      <div className="mt-5 text-sm">
        <p className="text-slate-500">Or use a demo customer:</p>
        <div className="mt-2 flex flex-wrap gap-2">{demo.map((c) => <Button key={c.id} size="sm" variant="secondary" onClick={() => auth.signInAs(customerUserId(c.id))}>{c.name}</Button>)}</div>
      </div>
    </div>
  );
}

export function MyEnquiries() {
  useDocumentTitle('My enquiries');
  const s = useDb();
  const user = useSession();
  if (!user || user.role !== 'customer') return <CustomerSignIn />;
  const cust = s.customers.find((c) => customerUserId(c.id) === user.id);
  const list = s.enquiries.filter((e) => e.customerId === cust?.id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My enquiries' }]} />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy-900">My enquiries</h1><p className="text-sm text-slate-500">Signed in as {cust?.name} · {cust?.phone}</p></div>
        <LinkButton to="/enquire" variant="secondary">New enquiry</LinkButton>
      </div>
      {!list.length ? <EmptyState title="No enquiries yet" action={<LinkButton to="/projects">Explore projects</LinkButton>} /> : (
        <ul className="mt-5 space-y-3">
          {list.map((e) => {
            const p = s.projects.find((x) => x.id === e.projectId);
            const st = customerStage(s, e);
            return (
              <li key={e.id}>
                <Link to={`/my-enquiries/${e.id}`} className="block rounded-xl ring-1 ring-slate-200 p-4 hover:ring-teal-400 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-semibold text-navy-900">{p ? p.name : 'General enquiry'}</p><p className="text-xs text-slate-500">{e.id.toUpperCase()} · {formatDateTime(e.createdAt)}</p></div>
                    <span className={cx('text-sm font-medium', st.step === 3 ? 'text-teal-700' : st.step < 0 ? 'text-slate-500' : 'text-amber-700')}>{st.label}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{bhkLabel(e.bhk)} · {formatPriceRange(e.budgetMin, e.budgetMax)} · {TIMELINE_LABEL[e.timeline]}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function EnquiryTrack() {
  const { id } = useParams();
  const s = useDb();
  const user = useSession();
  const act = useAct();
  const { ask, node } = useConfirm();
  const [prefOpen, setPrefOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState<null | 'report_partner' | 'general'>(null);
  const [text, setText] = useState('');
  const e = s.enquiries.find((x) => x.id === id);
  useDocumentTitle('Enquiry tracking');
  if (!user || user.role !== 'customer') return <CustomerSignIn />;
  if (!e || customerUserId(e.customerId) !== user.id) return <div className="mx-auto max-w-xl px-4 py-16"><EmptyState title="Enquiry not found" body="It may belong to a different phone number." action={<LinkButton to="/my-enquiries">My enquiries</LinkButton>} /></div>;
  const p = s.projects.find((x) => x.id === e.projectId);
  const asg = s.assignments.find((a) => a.enquiryId === e.id);
  const cp = asg && s.cps.find((c) => c.id === asg.cpId);
  const visits = asg ? s.visits.filter((v) => v.assignmentId === asg.id) : [];
  const st = customerStage(s, e);
  const steps = ['Enquiry sent', 'Phone verified', 'Reviewed by our team', 'Partner assigned'];
  const pref = e.contactPreference;
  const doneFlags = steps.map((_, i) => i === 0 || (i === 1 ? !!e.otpVerifiedAt : i === 2 ? st.step >= 2 : st.step >= 3));
  const currentIdx = doneFlags.indexOf(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My enquiries', to: '/my-enquiries' }, { label: e.id.toUpperCase() }]} />
      <h1 className="mt-2 text-2xl font-bold text-navy-900">{p ? p.name : 'General enquiry'}</h1>
      <p className="text-sm text-slate-500">Submitted {formatDateTime(e.createdAt)} · Status: <strong className="text-slate-700">{st.label}</strong></p>

      <div className="mt-5 grid md:grid-cols-[1fr_18rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card className="p-4 sm:p-5">
            {st.step < 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-600"><XCircle className="h-5 w-5 text-slate-400" />{st.label}. {e.status === 'withdrawn' ? 'Your details were not shared.' : 'Contact support if you think this is a mistake.'}</p>
            ) : (
              <ol className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {steps.map((label, i) => {
                  const done = doneFlags[i];
                  const current = i === currentIdx;
                  return (
                    <li key={label} className="flex sm:flex-col gap-2 sm:gap-1 items-center sm:items-start">
                      {done ? <CheckCircle2 className="h-5 w-5 text-teal-600" /> : current ? <Clock className="h-5 w-5 text-amber-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                      <span className={cx('text-sm', done ? 'text-slate-800 font-medium' : 'text-slate-500')}>{label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {st.step === 0 && <p className="mt-3 text-sm text-amber-800">Your phone isn’t verified yet. <Link className="underline" to={`/enquire${p ? `?project=${p.id}` : ''}`}>Submit again</Link> to receive a demo code.</p>}
            {st.step === 2 && <p className="mt-3 text-sm text-slate-600">We’re assigning one verified partner who works with {p ? 'this project' : 'matching projects'}. You’ll be notified here.</p>}
          </Card>

          {cp && asg && (
            <Card as="section">
              <CardHeader title="Your assigned partner" subtitle={`Assigned ${formatDateTime(asg.at)}`} />
              <div className="p-4 sm:p-5 flex gap-4">
                <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0"><UserRound className="h-6 w-6" /></div>
                <div className="min-w-0 text-sm space-y-1">
                  <p className="font-semibold text-navy-900">{cp.displayName}</p>
                  <p className="text-slate-600">{cp.contactName} · {cp.kind === 'brokerage' ? 'Brokerage' : 'Individual partner'} · {cp.experienceYears} yrs experience</p>
                  <p className="text-slate-600 flex items-center gap-1"><Languages className="h-3.5 w-3.5" />{cp.languages.join(', ')}</p>
                  <p className="text-slate-600">Business contact: {cp.phone} · {cp.email}</p>
                  <p className="text-xs text-slate-500">Partner registration (as supplied, demo): {cp.registrationNo}</p>
                  {e.sharingStoppedAt && <p className="text-xs text-red-700 bg-red-50 rounded p-2">You asked us to stop sharing on {formatDateTime(e.sharingStoppedAt)}. We told the partner to stop contacting you. Details already shared can’t be recalled.</p>}
                </div>
              </div>
              {visits.length > 0 && (
                <div className="px-4 sm:px-5 pb-4 text-sm">
                  <p className="font-medium text-slate-700 mb-1">Site visits</p>
                  <ul className="space-y-1">{visits.map((v) => <li key={v.id} className="flex flex-wrap gap-2 items-center"><StatusBadge status={v.state} />{v.requestedBy === 'customer' ? `You requested: ${v.note}` : `${formatDateTime(v.at)} · ${s.projects.find((x) => x.id === v.projectId)?.name ?? ''}`}</li>)}</ul>
                </div>
              )}
              <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setText(e.visitAvailability ?? ''); setVisitOpen(true); }} disabled={!!e.sharingStoppedAt}>Request a site visit</Button>
                <Button size="sm" variant="secondary" onClick={() => { setText(''); setSupportOpen('report_partner'); }}><MessageSquareWarning className="h-4 w-4" />Report a problem with this partner</Button>
              </div>
            </Card>
          )}

          <Card as="section">
            <CardHeader title="Your requirement" />
            <div className="p-4 sm:p-5">
              <KeyValue items={[['Budget', formatPriceRange(e.budgetMin, e.budgetMax)], ['Configuration', bhkLabel(e.bhk)], ['Timeline', TIMELINE_LABEL[e.timeline]], ['Preferred localities', e.preferredLocalities.join(', ') || 'Any'], ['Site visit availability', e.visitAvailability || '—'], ['Alternatives allowed', e.allowAlternatives ? 'Yes' : 'No — this project only']]} />
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4 text-sm space-y-3">
            <p className="font-semibold text-navy-900">Contact preference</p>
            <p className="text-slate-600">{CONTACT_PREF_LABEL[pref]} · {CONTACT_TIME_LABEL[e.contactTime]}</p>
            <Button size="sm" variant="secondary" onClick={() => setPrefOpen(true)} disabled={!!e.consent.withdrawnAt}>Change</Button>
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Your consent</p>
            <p className="text-slate-600">Share with one assigned partner: <strong>{e.consent.withdrawnAt ? `withdrawn ${formatDateTime(e.consent.withdrawnAt)}` : e.consent.shareWithAssignedPartner ? 'given' : 'not given'}</strong></p>
            <p className="text-xs text-slate-500">Version {e.consent.shareTextVersion} · {e.consent.shareGivenAt ? formatDateTime(e.consent.shareGivenAt) : '—'} · source {e.consent.source}</p>
            <p className="text-slate-600">Marketing updates: <strong>{e.consent.marketing ? 'yes' : 'no'}</strong></p>
            {!e.consent.withdrawnAt && !['rejected', 'duplicate'].includes(e.status) && (
              <Button size="sm" variant="danger" onClick={() => ask({
                title: asg ? 'Stop sharing my details?' : 'Withdraw this enquiry?',
                body: asg ? <><p>Your details were already shared with {cp?.displayName}. We’ll tell them to stop contacting you and open a support ticket.</p><p>We can’t recall details that were already shared.</p></> : <p>Your enquiry will be withdrawn and your details will not be shared with any partner.</p>,
                confirmLabel: asg ? 'Stop sharing' : 'Withdraw enquiry', tone: 'danger',
                onConfirm: () => act((d, ctx) => withdrawConsent(d, ctx, e.id), { success: asg ? 'Partner told to stop contact' : 'Enquiry withdrawn' }),
              })}>{asg ? 'Stop sharing / contact' : 'Withdraw enquiry'}</Button>
            )}
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900 flex items-center gap-2"><LifeBuoy className="h-4 w-4" />Need help?</p>
            <Button size="sm" variant="secondary" onClick={() => { setText(''); setSupportOpen('general'); }}>Contact support</Button>
          </Card>
        </aside>
      </div>

      <PrefDialog open={prefOpen} onClose={() => setPrefOpen(false)} pref={pref} time={e.contactTime} onSave={(pp, tt) => { act((d, ctx) => setContactPreference(d, ctx, e.id, pp, tt), { success: 'Contact preference saved' }); setPrefOpen(false); }} />
      <Dialog open={visitOpen} onClose={() => setVisitOpen(false)} title="Request a site visit" footer={<><Button variant="secondary" onClick={() => setVisitOpen(false)}>Cancel</Button><Button onClick={() => { if (act((d, ctx) => requestVisit(d, ctx, e.id, text), { success: 'Visit request sent to your partner' }) !== undefined) setVisitOpen(false); }}>Send request</Button></>}>
        <Field label="When suits you?" required htmlFor="v-when"><Input id="v-when" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="e.g. Saturday 11 am" /></Field>
        <p className="mt-2 text-xs text-slate-500">Your partner confirms the slot. Demo mode sends no messages.</p>
      </Dialog>
      <Dialog open={!!supportOpen} onClose={() => setSupportOpen(null)} title={supportOpen === 'report_partner' ? 'Report a problem' : 'Contact support'} footer={<><Button variant="secondary" onClick={() => setSupportOpen(null)}>Cancel</Button><Button onClick={() => { const ok = act((d, ctx) => raiseSupportTicket(d, ctx, e.customerId, supportOpen!, text, e.id), { success: 'Support request sent' }); if (ok) setSupportOpen(null); }}>Send</Button></>}>
        <Field label="What happened?" required htmlFor="s-text"><Textarea id="s-text" rows={4} value={text} onChange={(ev) => setText(ev.target.value)} /></Field>
      </Dialog>
      {node}
    </div>
  );
}

function PrefDialog({ open, onClose, pref, time, onSave }: { open: boolean; onClose: () => void; pref: ContactPreference; time: ContactTime; onSave: (p: ContactPreference, t: ContactTime) => void }) {
  const [p, setP] = useState(pref);
  const [t, setT] = useState(time);
  return (
    <Dialog open={open} onClose={onClose} title="Contact preference" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(p, t)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Contact me by" required htmlFor="p-pref"><Select id="p-pref" value={p} onChange={(e) => setP(e.target.value as ContactPreference)}>{Object.entries(CONTACT_PREF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Best time" required htmlFor="p-time"><Select id="p-time" value={t} onChange={(e) => setT(e.target.value as ContactTime)}>{Object.entries(CONTACT_TIME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}
