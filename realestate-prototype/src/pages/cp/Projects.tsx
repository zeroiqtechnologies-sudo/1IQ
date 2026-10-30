import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star, Download, Info } from 'lucide-react';
import { useAct, useDocumentTitle } from '../../state/hooks';
import { useCp, VerificationBanner } from './CpRoutes';
import { setInterest, updateCpProfile } from '../../domain/projects';
import { formatPossession } from '../../domain/format';
import { LOCALITIES } from '../../data/seed';
import { Badge, Button, Card, CardHeader, Chip, EmptyState, Field, Input, KeyValue, LinkButton, PageHeader, SearchInput, StatusBadge, cx } from '../../ui/kit';
import { ProjectVisual } from '../../ui/visuals';
import { summary } from '../customer/common';
import { downloadBrochure } from '../customer/ProjectDetail';
import type { DbState, ID } from '../../domain/types';

function interestOf(s: DbState, cpId: ID, projectId: ID) {
  return s.interests.find((i) => i.cpId === cpId && i.projectId === projectId);
}

function InterestButton({ projectId }: { projectId: ID }) {
  const { s, cp } = useCp();
  const act = useAct();
  const it = interestOf(s, cp.id, projectId);
  const on = it?.state === 'interested';
  const p = s.projects.find((x) => x.id === projectId)!;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => act((d, ctx) => setInterest(d, ctx, cp.id, projectId, !on), { success: on ? 'Interest removed' : `Interested in ${p.name}` })}>
        <Star className={cx('h-4 w-4', on && 'fill-white')} />{on ? 'Interested' : 'Mark Interested'}
      </Button>
      {on && p.cpApprovalRequired && <StatusBadge status={it!.approval === 'approved' ? 'approved' : it!.approval === 'rejected' ? 'rejected' : 'pending'} label={`Developer approval: ${it!.approval}`} />}
    </div>
  );
}

export function CpProjects() {
  useDocumentTitle('Projects');
  const { s, cp } = useCp();
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const list = s.projects.filter((p) => p.status === 'published')
    .filter((p) => !q || `${p.name} ${p.locality}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => !mine || interestOf(s, cp.id, p.id)?.state === 'interested');
  return (
    <>
      <PageHeader title="Developer projects" crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Projects' }]} subtitle="Mark Interested in projects you actively sell. Only interested (and, where required, developer-approved) partners can bid on that project’s leads." />
      <VerificationBanner />
      <div className="mb-4 rounded-xl bg-navy-50 ring-1 ring-navy-100 p-3 text-sm text-navy-800 flex gap-2"><Info className="h-4 w-4 shrink-0 mt-0.5" /><p>Your service localities ({cp.serviceLocalities.join(', ')}) are preferences for discovery only. They do not make you eligible to bid — explicit project interest does. <Link to="/cp/profile" className="underline">Edit preferences</Link></p></div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex-1 min-w-[14rem]"><SearchInput value={q} onChange={setQ} placeholder="Search projects or localities" /></div>
        <Chip active={mine} onClick={() => setMine((m) => !m)}>Only my interests</Chip>
      </div>
      {!list.length ? <EmptyState title="No projects" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const sm = summary(p);
            const pref = cp.serviceLocalities.includes(p.locality);
            return (
              <Card key={p.id} className="overflow-hidden flex flex-col">
                <Link to={`/cp/projects/${p.id}`}><ProjectVisual project={p} className="aspect-[16/8]" /></Link>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/cp/projects/${p.id}`} className="font-semibold text-navy-900 hover:text-teal-700">{p.name}</Link>
                    {pref && <Badge tone="blue">In your localities</Badge>}
                  </div>
                  <p className="text-sm text-slate-600">{p.locality} · {sm.bhkLabel} · {sm.priceLabel}</p>
                  <p className="text-xs text-slate-500">Commission {p.cpTerms.commissionPercent}% · {p.cpApprovalRequired ? 'Developer approval required' : 'Open to approved partners'}</p>
                  <div className="mt-auto pt-2"><InterestButton projectId={p.id} /></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function CpProjectDetail() {
  const { id } = useParams();
  const { s, cp } = useCp();
  const p = s.projects.find((x) => x.id === id && x.status === 'published');
  useDocumentTitle(p?.name ?? 'Project');
  if (!p) return <EmptyState title="Project not available" action={<LinkButton to="/cp/projects">Back</LinkButton>} />;
  const dev = s.developers.find((d) => d.id === p.developerId)!;
  const sm = summary(p);
  const shared = s.notifications.some((n) => n.recipientId === `user_${cp.id}` && n.title === 'Brochure shared' && n.body.startsWith(p.name));
  return (
    <>
      <PageHeader title={p.name} crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Projects', to: '/cp/projects' }, { label: p.name }]} subtitle={`${p.locality}, Pune · by ${dev.shortName}`} actions={<InterestButton projectId={p.id} />} />
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        <div className="space-y-5 min-w-0">
          <ProjectVisual project={p} className="aspect-[16/7] rounded-xl" label />
          <Card>
            <CardHeader title="Project summary" />
            <div className="p-4 sm:p-5"><KeyValue items={[['Configurations', sm.bhkLabel], ['Price', sm.priceLabel], ['Carpet area', sm.carpetLabel], ['Possession', formatPossession(p.possession)], ['Inventory', `${sm.available} of ${sm.units} available`], ['Registration (supplied)', p.registrationNo]]} /></div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Developer–CP commercial terms</p>
            <p className="text-2xl font-bold text-teal-700">{p.cpTerms.commissionPercent}%</p>
            <p className="text-slate-600">Payout: {p.cpTerms.payoutTrigger}</p>
            <p className="text-xs text-slate-500">{p.cpTerms.notes}</p>
            <p className="text-xs text-amber-800 bg-amber-50 rounded p-2">Commission is agreed between you and the developer. It is separate from lead purchase fees paid on this platform.</p>
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Resources</p>
            <Button size="sm" variant="secondary" onClick={() => downloadBrochure(p, dev.company)}><Download className="h-4 w-4" />{p.brochureName}</Button>
            {shared && <p className="text-xs text-teal-700">The developer shared this brochure with you.</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}

export function CpProfilePage() {
  useDocumentTitle('Partner profile');
  const { s, cp } = useCp();
  const act = useAct();
  const [f, setF] = useState({ displayName: cp.displayName, phone: cp.phone, email: cp.email, languages: cp.languages.join(', '), specialisms: cp.specialisms.join(', '), serviceLocalities: cp.serviceLocalities, experienceYears: String(cp.experienceYears) });
  const interests = s.interests.filter((i) => i.cpId === cp.id && i.state === 'interested');
  const save = () => act((d, ctx) => updateCpProfile(d, ctx, cp.id, { displayName: f.displayName, phone: f.phone, email: f.email, languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean), specialisms: f.specialisms.split(',').map((x) => x.trim()).filter(Boolean), serviceLocalities: f.serviceLocalities, experienceYears: Number(f.experienceYears) || 0 }), { success: 'Profile saved' });
  return (
    <>
      <PageHeader title="Partner profile" crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Profile' }]} actions={<StatusBadge status={cp.reviewStatus} label={`Review: ${cp.reviewStatus}`} />} />
      <VerificationBanner />
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        <Card>
          <CardHeader title="Business details" subtitle={`${cp.kind === 'brokerage' ? 'Brokerage' : 'Individual'} · registration (demo) ${cp.registrationNo}`} />
          <form className="p-4 sm:p-5 grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Display name" required htmlFor="cp-n"><Input id="cp-n" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
            <Field label="Experience (years)" required htmlFor="cp-x"><Input id="cp-x" type="number" min={0} value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} /></Field>
            <Field label="Business phone" required htmlFor="cp-p"><Input id="cp-p" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Business email" required htmlFor="cp-e"><Input id="cp-e" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Languages" required hint="Comma separated" htmlFor="cp-l"><Input id="cp-l" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} /></Field>
            <Field label="Specialisms" hint="Comma separated" htmlFor="cp-s"><Input id="cp-s" value={f.specialisms} onChange={(e) => setF({ ...f, specialisms: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <Field label="Service city & locality preferences" hint="Used for discovery. Not the same as project interest.">
                <div className="flex flex-wrap gap-2"><Badge tone="navy">Pune</Badge>{LOCALITIES.map((l) => <Chip key={l} active={f.serviceLocalities.includes(l)} onClick={() => setF({ ...f, serviceLocalities: f.serviceLocalities.includes(l) ? f.serviceLocalities.filter((x) => x !== l) : [...f.serviceLocalities, l] })}>{l}</Chip>)}</div>
              </Field>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-2 items-center"><Button type="submit">Save profile</Button><span className="text-xs text-slate-500">Documents on file (demo): {cp.documents.join(', ')}</span></div>
          </form>
        </Card>
        <Card className="p-4 text-sm space-y-2 h-fit">
          <p className="font-semibold text-navy-900">Project interests ({interests.length})</p>
          {!interests.length && <p className="text-slate-500">None yet.</p>}
          <ul className="space-y-1">{interests.map((i) => { const p = s.projects.find((x) => x.id === i.projectId); return <li key={i.id} className="flex justify-between gap-2"><Link to={`/cp/projects/${i.projectId}`} className="hover:text-teal-700">{p?.name}</Link>{i.approval !== 'not_required' && <StatusBadge status={i.approval === 'approved' ? 'approved' : i.approval === 'rejected' ? 'rejected' : 'pending'} />}</li>; })}</ul>
          <LinkButton to="/cp/projects" size="sm" variant="secondary">Manage interests</LinkButton>
        </Card>
      </div>
    </>
  );
}
