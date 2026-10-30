import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import { useAct, useDb, useDocumentTitle } from '../../state/hooks';
import { CONSENT_TEXT, submitEnquiry, validateEnquiry, verifyOtp, type EnquiryInput } from '../../domain/enquiry';
import { CONTACT_PREF_LABEL, CONTACT_TIME_LABEL, PURPOSE_LABEL, TIMELINE_LABEL, formatDateTime, lakh } from '../../domain/format';
import { LOCALITIES } from '../../data/seed';
import { Breadcrumbs, Button, Card, Checkbox, Chip, DemoTag, Field, Input, LinkButton, Select, Textarea } from '../../ui/kit';
import { auth, otp as otpService } from '../../services/local';
import { customerUserId } from '../../domain/util';
import { summary } from './common';
import type { ContactPreference, ContactTime, Purpose, Timeline } from '../../domain/types';

const BUDGETS = [30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 200, 250, 300, 350, 400];
const bLabel = (v: number) => (v >= 100 ? `₹${v / 100} Cr` : `₹${v} L`);

export default function Enquire() {
  useDocumentTitle('Enquire');
  const s = useDb();
  const act = useAct();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const project = s.projects.find((p) => p.id === sp.get('project') && p.status === 'published');
  const sm = project ? summary(project) : undefined;
  const nearest = (paise: number, up: boolean) => {
    const l = paise / 1e7;
    return up ? BUDGETS.find((b) => b >= l) ?? BUDGETS[BUDGETS.length - 1] : [...BUDGETS].reverse().find((b) => b <= l) ?? BUDGETS[0];
  };
  const [f, setF] = useState({
    name: '', phone: '', email: '',
    budgetMin: sm ? nearest(sm.priceMin, false) : 60, budgetMax: sm ? nearest(sm.priceMax, true) : 100,
    bhk: [] as number[], preferredLocalities: project ? [project.locality] : ([] as string[]),
    timeline: '' as Timeline | '', purpose: 'self_use' as Purpose, contactPreference: 'call' as ContactPreference, contactTime: 'evening' as ContactTime,
    visitAvailability: '', message: '', allowAlternatives: false, consentShare: false, consentMarketing: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [enqId, setEnqId] = useState<string>();
  const [code, setCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [sending, setSending] = useState(false);
  const [otpErr, setOtpErr] = useState('');
  const up = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const input = (): EnquiryInput => ({
    name: f.name, phone: f.phone, email: f.email || undefined, projectId: project?.id, allowAlternatives: project ? f.allowAlternatives : f.allowAlternatives,
    budgetMin: lakh(f.budgetMin), budgetMax: lakh(f.budgetMax), bhk: f.bhk, preferredLocalities: f.preferredLocalities, timeline: (f.timeline || 'exploring') as Timeline,
    purpose: f.purpose, contactPreference: f.contactPreference, contactTime: f.contactTime, visitAvailability: f.visitAvailability, message: f.message,
    consentShare: f.consentShare, consentMarketing: f.consentMarketing, source: project ? 'web:project-detail' : 'web:general-enquiry',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateEnquiry(input());
    if (!f.timeline) errs.timeline = 'Choose your buying timeline';
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    const enq = act((st, ctx) => submitEnquiry(st, ctx, input()), { actorId: 'web' });
    if (!enq) return;
    setEnqId(enq.id);
    setStep('otp');
    setSending(true);
    const r = await otpService.send(f.phone);
    setOtpHint(r.hint);
    setSending(false);
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    setOtpErr('');
    if (!enqId) return;
    const st = s.enquiries.find((x) => x.id === enqId);
    const ok = act((d, ctx) => verifyOtp(d, ctx, enqId, code), { actorId: 'web' });
    if (ok) {
      if (st) auth.signInAs(customerUserId(st.customerId));
      setStep('done');
    } else setOtpErr('That code didn’t match. In demo mode the code is 123456.');
  };

  const enq = s.enquiries.find((x) => x.id === enqId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, ...(project ? [{ label: project.name, to: `/projects/${project.id}` }] : []), { label: 'Enquire' }]} />
      <h1 className="mt-2 text-2xl font-bold text-navy-900">{project ? `Enquire about ${project.name}` : 'Tell us what you’re looking for'}</h1>
      <p className="text-sm text-slate-500">{project ? `${project.locality}, Pune · ${sm!.priceLabel}` : 'A general enquiry. With your permission we’ll match relevant projects.'}</p>

      {step === 'form' && (
        <form onSubmit={submit} noValidate className="mt-5 space-y-5">
          <Card className="p-4 sm:p-6 space-y-4">
            <h2 className="font-semibold text-navy-900">Your details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" required error={errors.name} htmlFor="f-name"><Input id="f-name" autoComplete="name" value={f.name} onChange={(e) => up('name', e.target.value)} invalid={!!errors.name} /></Field>
              <Field label="Mobile number" required error={errors.phone} hint="10-digit Indian mobile. Use a fictional number in this demo." htmlFor="f-phone"><Input id="f-phone" inputMode="tel" autoComplete="tel" placeholder="98xxxxxxxx" value={f.phone} onChange={(e) => up('phone', e.target.value)} invalid={!!errors.phone} /></Field>
              <Field label="Email" error={errors.email} htmlFor="f-email"><Input id="f-email" type="email" autoComplete="email" value={f.email} onChange={(e) => up('email', e.target.value)} invalid={!!errors.email} /></Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 space-y-4">
            <h2 className="font-semibold text-navy-900">Your requirement</h2>
            <Field label="Budget" required error={errors.budget} htmlFor="f-budget">
              <div className="grid grid-cols-2 gap-2">
                <Select id="f-budget" aria-label="Minimum budget" value={f.budgetMin} onChange={(e) => up('budgetMin', Number(e.target.value))}>{BUDGETS.map((b) => <option key={b} value={b}>From {bLabel(b)}</option>)}</Select>
                <Select aria-label="Maximum budget" value={f.budgetMax} onChange={(e) => up('budgetMax', Number(e.target.value))}>{BUDGETS.map((b) => <option key={b} value={b}>Up to {bLabel(b)}</option>)}</Select>
              </div>
            </Field>
            <Field label="Configuration (BHK)" required error={errors.bhk}>
              <div className="flex flex-wrap gap-2" id="f-bhk" tabIndex={-1}>
                {(project ? summary(project).bhks : [1, 2, 3, 4]).map((b) => <Chip key={b} active={f.bhk.includes(b)} onClick={() => up('bhk', f.bhk.includes(b) ? f.bhk.filter((x) => x !== b) : [...f.bhk, b])}>{b} BHK</Chip>)}
              </div>
            </Field>
            <Field label="Preferred localities">
              <div className="flex flex-wrap gap-2">{LOCALITIES.map((l) => <Chip key={l} active={f.preferredLocalities.includes(l)} onClick={() => up('preferredLocalities', f.preferredLocalities.includes(l) ? f.preferredLocalities.filter((x) => x !== l) : [...f.preferredLocalities, l])}>{l}</Chip>)}</div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Buying timeline" required error={errors.timeline} htmlFor="f-timeline">
                <Select id="f-timeline" value={f.timeline} onChange={(e) => up('timeline', e.target.value as Timeline)} invalid={!!errors.timeline}><option value="">Choose…</option>{Object.entries(TIMELINE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              <Field label="Purpose" required htmlFor="f-purpose">
                <Select id="f-purpose" value={f.purpose} onChange={(e) => up('purpose', e.target.value as Purpose)}>{Object.entries(PURPOSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              <Field label="How should the partner contact you?" required htmlFor="f-pref">
                <Select id="f-pref" value={f.contactPreference} onChange={(e) => up('contactPreference', e.target.value as ContactPreference)}>{Object.entries(CONTACT_PREF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              <Field label="Preferred contact time" required htmlFor="f-time">
                <Select id="f-time" value={f.contactTime} onChange={(e) => up('contactTime', e.target.value as ContactTime)}>{Object.entries(CONTACT_TIME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
            </div>
            <Field label="Site visit availability" hint="e.g. Saturday morning, weekday evenings" htmlFor="f-visit"><Input id="f-visit" value={f.visitAvailability} onChange={(e) => up('visitAvailability', e.target.value)} /></Field>
            <Field label="Anything else?" hint="Only the assigned partner sees this, after assignment." htmlFor="f-msg"><Textarea id="f-msg" rows={3} value={f.message} onChange={(e) => up('message', e.target.value)} /></Field>
          </Card>

          <Card className="p-4 sm:p-6 space-y-4">
            <h2 className="font-semibold text-navy-900 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-700" />Your permission</h2>
            <div id="f-allowAlternatives" tabIndex={-1}>
              <Checkbox checked={f.allowAlternatives} onChange={(v) => up('allowAlternatives', v)} invalid={!!errors.allowAlternatives}
                label={project ? 'Also consider a few relevant alternative projects for me' : 'Match my requirement with relevant projects'}
                description={project ? 'Optional. If unticked, your enquiry stays with this project only.' : 'Needed for a general enquiry so we can find matching projects.'} />
              {errors.allowAlternatives && <p className="text-xs text-red-600 mt-1" role="alert">{errors.allowAlternatives}</p>}
            </div>
            <div id="f-consentShare" tabIndex={-1} className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3">
              <Checkbox checked={f.consentShare} onChange={(v) => up('consentShare', v)} invalid={!!errors.consentShare} label={<><strong>Required:</strong> {CONSENT_TEXT[s.settings.consentTextVersion]}</>} description={`Consent text version ${s.settings.consentTextVersion}. We record the time and source when you submit.`} />
              {errors.consentShare && <p className="text-xs text-red-600 mt-2" role="alert">{errors.consentShare}</p>}
            </div>
            <Checkbox checked={f.consentMarketing} onChange={(v) => up('consentMarketing', v)} label={CONSENT_TEXT[s.settings.marketingTextVersion]} description={`Separate and optional · version ${s.settings.marketingTextVersion}`} />
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg">Continue to verify phone</Button>
            <p className="text-xs text-slate-500">Next: a one-time code to confirm your number.</p>
          </div>
        </form>
      )}

      {step === 'otp' && (
        <Card className="mt-5 p-5 sm:p-6 max-w-md">
          <Smartphone className="h-8 w-8 text-teal-700" />
          <h2 className="mt-2 font-semibold text-navy-900">Verify your mobile number</h2>
          <p className="text-sm text-slate-600 mt-1">We “sent” a 6-digit code to {f.phone}. <DemoTag /></p>
          <p className="mt-2 text-xs rounded-md bg-amber-50 ring-1 ring-amber-200 p-2 text-amber-900">{sending ? 'Sending simulated code…' : otpHint}</p>
          <form onSubmit={verify} className="mt-4 space-y-3">
            <Field label="One-time code" required error={otpErr} htmlFor="otp"><Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} invalid={!!otpErr} /></Field>
            <div className="flex gap-2"><Button type="submit" disabled={code.length !== 6}>Verify & submit</Button><Button type="button" variant="ghost" onClick={async () => { setSending(true); setOtpHint((await otpService.send(f.phone)).hint); setSending(false); }}>Resend</Button></div>
          </form>
        </Card>
      )}

      {step === 'done' && enq && (
        <Card className="mt-5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
          <h2 className="mt-3 text-xl font-bold text-navy-900">Enquiry received</h2>
          <p className="mt-1 text-sm text-slate-600">Reference <strong>{enq.id.toUpperCase()}</strong> · {formatDateTime(enq.createdAt)}</p>
          <ol className="mt-5 text-left text-sm space-y-2 max-w-md mx-auto">
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5" />Phone verified (demo OTP)</li>
            <li className="flex gap-2"><span className="h-4 w-4 rounded-full ring-2 ring-slate-300 mt-0.5" />Our team reviews your requirement</li>
            <li className="flex gap-2"><span className="h-4 w-4 rounded-full ring-2 ring-slate-300 mt-0.5" />One verified partner is assigned and contacts you by {CONTACT_PREF_LABEL[enq.contactPreference].toLowerCase()}</li>
          </ol>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LinkButton to={`/my-enquiries/${enq.id}`}>Track this enquiry</LinkButton>
            <Button variant="secondary" onClick={() => nav('/projects')}>Keep browsing</Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">You’re now signed in as {f.name} (demo customer). <Link to="/my-enquiries" className="text-teal-700 hover:underline">All my enquiries</Link></p>
        </Card>
      )}
    </div>
  );
}
