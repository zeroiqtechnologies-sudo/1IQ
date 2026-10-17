import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, Building2, FolderKanban, PlusCircle, Users, Share2, Lock, AlertTriangle } from 'lucide-react';
import PortalLayout from '../../layouts/PortalLayout';
import { useAct, useDb, useDocumentTitle, useSession } from '../../state/hooks';
import { decideInterest, setCpApprovalRequired, setProjectPaused, shareBrochure, submitProject, updateDeveloperProfile } from '../../domain/projects';
import { confirmBooking, CRM_LABEL } from '../../domain/crm';
import { formatDate, formatDateTime } from '../../domain/format';
import { Badge, Button, Card, CardHeader, Checkbox, DataTable, EmptyState, Field, Input, KeyValue, LinkButton, PageHeader, Stat, StatusBadge, Textarea, useConfirm } from '../../ui/kit';
import { NotFound } from '../customer/Collections';
import { summary } from '../customer/common';
import { ProjectWizard } from './ProjectWizard';
import type { DbState, ID, Project } from '../../domain/types';

export function useDev() {
  const s = useDb();
  const user = useSession();
  const dev = s.developers.find((d) => d.id === user?.orgId)!;
  return { s, user: user!, dev };
}

/** Aggregated outcomes for a developer's project. Never includes customer identity or contacts. */
export function projectOutcomes(s: DbState, projectId: ID) {
  const leads = s.leads.filter((l) => l.matches.some((m) => m.projectId === projectId));
  const enquiries = s.enquiries.filter((e) => e.projectId === projectId);
  const asg = s.assignments.filter((a) => leads.some((l) => l.id === a.leadId));
  const stages: Record<string, number> = {};
  for (const a of asg) stages[a.stage] = (stages[a.stage] ?? 0) + 1;
  return {
    enquiries: enquiries.length,
    qualified: leads.length,
    assigned: asg.length,
    stages,
    visitsCompleted: s.visits.filter((v) => v.projectId === projectId && v.state === 'completed').length,
    visitsScheduled: s.visits.filter((v) => v.projectId === projectId && v.state === 'scheduled').length,
    bookedReported: asg.filter((a) => a.stage === 'booked').length,
    bookedConfirmed: asg.filter((a) => a.stage === 'booked' && a.developerConfirmedBooking).length,
    assignments: asg,
  };
}

function Dashboard() {
  useDocumentTitle('Developer dashboard');
  const { s, dev } = useDev();
  const mine = s.projects.filter((p) => p.developerId === dev.id);
  const live = mine.filter((p) => p.status === 'published');
  const pending = mine.filter((p) => ['submitted', 'changes_requested', 'approved'].includes(p.status));
  const out = mine.map((p) => projectOutcomes(s, p.id));
  const sum = (k: 'enquiries' | 'assigned' | 'visitsCompleted' | 'bookedReported' | 'bookedConfirmed') => out.reduce((t, o) => t + o[k], 0);
  const cpIds = new Set(out.flatMap((o) => o.assignments.map((a) => a.cpId)));
  const interest = s.interests.filter((i) => i.state === 'interested' && mine.some((p) => p.id === i.projectId));
  return (
    <>
      <PageHeader title={dev.shortName} subtitle="Developer dashboard · figures derived from demo records" actions={<LinkButton to="/developer/projects/new"><PlusCircle className="h-4 w-4" />New project</LinkButton>} />
      {dev.verificationStatus !== 'approved' && <div className="mb-5 flex gap-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><p>Company verification is <strong>{dev.verificationStatus}</strong>. You can prepare drafts, but listings can’t be approved until verification completes. <Link className="underline" to="/developer/company">View company profile</Link></p></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Live projects" value={live.length} to="/developer/projects" />
        <Stat label="Awaiting review / changes" value={pending.length} tone="amber" to="/developer/projects" />
        <Stat label="Enquiries received" value={sum('enquiries')} hint="Aggregate only — no contact data" />
        <Stat label="Partners assigned" value={cpIds.size} hint={`${interest.length} interest record(s)`} />
      </div>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Site visits (CP-reported)" value={sum('visitsCompleted')} tone="teal" />
        <Stat label="Bookings (CP-reported)" value={sum('bookedReported')} tone="teal" />
        <Stat label="Bookings (you confirmed)" value={sum('bookedConfirmed')} hint="Confirm on each project page" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Your projects" action={<Link className="text-sm font-medium text-teal-700" to="/developer/projects">Manage</Link>} />
        <ul className="divide-y divide-slate-100">
          {mine.map((p, i) => (
            <li key={p.id}><Link to={`/developer/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 text-sm">
              <span className="min-w-0"><span className="font-medium block truncate">{p.name}</span><span className="text-xs text-slate-500">{p.locality} · {out[i].enquiries} enquiries · {s.interests.filter((x) => x.projectId === p.id && x.state === 'interested').length} interested partners</span></span>
              <StatusBadge status={p.status} />
            </Link></li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function ProjectsList() {
  useDocumentTitle('My projects');
  const { s, dev } = useDev();
  const nav = useNavigate();
  const rows = s.projects.filter((p) => p.developerId === dev.id).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <PageHeader title="Projects" crumbs={[{ label: 'Developer', to: '/developer' }, { label: 'Projects' }]} actions={<LinkButton to="/developer/projects/new"><PlusCircle className="h-4 w-4" />New project</LinkButton>} subtitle="Draft → submitted → changes requested / approved → published → paused. Admin approval is required before customers can see a listing." />
      <Card>
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/developer/projects/${r.id}`)} search={(r) => `${r.name} ${r.locality} ${r.status}`}
          empty={<EmptyState title="No projects yet" action={<LinkButton to="/developer/projects/new">Create your first project</LinkButton>} />}
          columns={[
            { key: 'n', header: 'Project', cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'l', header: 'Locality', cell: (r) => r.locality },
            { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'p', header: 'Price', cell: (r) => summary(r).priceLabel, mobileHidden: true },
            { key: 'u', header: 'Updated', cell: (r) => <span className="text-xs">{formatDate(r.updatedAt)}</span> },
          ]} />
      </Card>
    </>
  );
}

function ProjectManage() {
  const { id } = useParams();
  const { s, dev } = useDev();
  const act = useAct();
  const { ask, node } = useConfirm();
  const p = s.projects.find((x) => x.id === id);
  useDocumentTitle(p?.name ?? 'Project');
  if (!p) return <NotFound />;
  if (p.developerId !== dev.id) return <EmptyState icon={Lock} title="Not your project" body="Developers can only view and edit their own listings." action={<LinkButton to="/developer/projects">My projects</LinkButton>} />;
  const out = projectOutcomes(s, p.id);
  const interests = s.interests.filter((i) => i.projectId === p.id && i.state === 'interested');
  const canEdit = p.status !== 'archived';
  return (
    <>
      <PageHeader title={p.name} crumbs={[{ label: 'Developer', to: '/developer' }, { label: 'Projects', to: '/developer/projects' }, { label: p.name }]} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /> {p.locality}, Pune · updated {formatDateTime(p.updatedAt)}</span>}
        actions={<>
          {canEdit && <LinkButton to={`/developer/projects/${p.id}/edit`} variant="secondary">Edit</LinkButton>}
          {['draft', 'changes_requested'].includes(p.status) && <Button onClick={() => act((d, ctx) => submitProject(d, ctx, dev.id, p.id), { success: 'Submitted for admin review' })}>Submit for review</Button>}
          {p.status === 'published' && <Button variant="secondary" onClick={() => ask({ title: 'Pause this listing?', body: 'It will disappear from customer search until you resume it. Existing assigned leads are unaffected.', confirmLabel: 'Pause listing', onConfirm: () => act((d, ctx) => setProjectPaused(d, ctx, dev.id, p.id, true), { success: 'Listing paused' }) })}>Pause</Button>}
          {p.status === 'paused' && <Button onClick={() => act((d, ctx) => setProjectPaused(d, ctx, dev.id, p.id, false), { success: 'Listing resumed' })}>Resume</Button>}
          {p.status === 'published' && <Link to={`/projects/${p.id}`} className="inline-flex h-10 items-center px-3 text-sm font-semibold text-teal-700 hover:underline">View public page</Link>}
        </>} />
      {p.reviewNote && <div className="mb-5 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900"><strong>Admin note:</strong> {p.reviewNote}</div>}
      {p.status === 'submitted' && <div className="mb-5 rounded-xl bg-sky-50 ring-1 ring-sky-200 p-4 text-sm text-sky-900">Waiting for admin review. Customers can’t see this listing yet.</div>}
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Aggregated outcomes" subtitle="Customer identities and contacts are not shared with developers by default." />
            <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[['Enquiries', out.enquiries], ['Qualified leads', out.qualified], ['Assigned to partners', out.assigned], ['Visits completed', out.visitsCompleted]].map(([l, v]) => <div key={l as string}><p className="text-slate-500 text-xs">{l}</p><p className="text-xl font-bold">{v}</p></div>)}
            </div>
            <div className="px-4 sm:px-5 pb-4 text-sm">
              <p className="text-xs text-slate-500 mb-2">CP-reported CRM stages</p>
              <div className="flex flex-wrap gap-1.5">{Object.entries(out.stages).map(([k, v]) => <Badge key={k} tone="gray">{CRM_LABEL[k as keyof typeof CRM_LABEL]}: {v}</Badge>)}{!Object.keys(out.stages).length && <span className="text-slate-400">No assigned leads yet</span>}</div>
            </div>
            {out.assignments.filter((a) => a.stage === 'booked').length > 0 && (
              <div className="px-4 sm:px-5 pb-4 text-sm border-t border-slate-100 pt-3 space-y-2">
                <p className="font-medium">Bookings reported by partners</p>
                {out.assignments.filter((a) => a.stage === 'booked').map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2"><span>{s.cps.find((c) => c.id === a.cpId)?.displayName} · lead {a.leadId.toUpperCase()}</span>{a.developerConfirmedBooking ? <Badge tone="green">Developer-confirmed</Badge> : <Button size="sm" variant="secondary" onClick={() => act((d, ctx) => confirmBooking(d, ctx, dev.id, a.id), { success: 'Booking confirmed' })}>Confirm booking</Button>}</div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title={`Interested partners (${interests.length})`} subtitle={p.cpApprovalRequired ? 'Approval is required before a partner can bid on this project’s leads.' : 'Approval is off: any approved, interested partner can bid.'}
              action={<Button size="sm" variant="secondary" disabled={!interests.length || p.status !== 'published'} onClick={() => act((d, ctx) => shareBrochure(d, ctx, dev.id, p.id), { success: 'Brochure shared with interested partners' })}><Share2 className="h-4 w-4" />Share brochure</Button>} />
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100"><Checkbox checked={p.cpApprovalRequired} onChange={(v) => act((d, ctx) => setCpApprovalRequired(d, ctx, dev.id, p.id, v), { success: v ? 'Partner approval required' : 'Partner approval turned off' })} label="Require my approval for partner access" description="Optional. Off by default." /></div>
            {!interests.length ? <EmptyState icon={Users} title="No interested partners yet" body={p.status === 'published' ? 'Partners see published projects and can mark Interested.' : 'Partners can follow this project once it is published.'} /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {interests.map((i) => {
                  const cp = s.cps.find((c) => c.id === i.cpId)!;
                  return (
                    <li key={i.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0"><p className="font-medium">{cp.displayName}</p><p className="text-xs text-slate-500">{cp.kind} · {cp.experienceYears} yrs · {cp.serviceLocalities.join(', ')} · profile {cp.reviewStatus}</p></div>
                      {p.cpApprovalRequired ? (
                        i.approval === 'pending' ? <div className="flex gap-2"><Button size="sm" onClick={() => act((d, ctx) => decideInterest(d, ctx, dev.id, i.id, true), { success: 'Access approved' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => act((d, ctx) => decideInterest(d, ctx, dev.id, i.id, false), { success: 'Access declined' })}>Decline</Button></div> : <StatusBadge status={i.approval} />
                      ) : <span className="text-xs text-slate-400">Interested {formatDate(i.updatedAt)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4 text-sm"><KeyValue items={[['Price', summary(p).priceLabel], ['Configurations', summary(p).bhkLabel], ['Registration', p.registrationNo], ['Registration review', <StatusBadge key="r" status={p.registrationReview} />], ['CP commission', `${p.cpTerms.commissionPercent}%`]]} /></Card>
          <Card className="p-4 text-xs text-slate-500 space-y-1"><p className="font-semibold text-slate-700 text-sm">Material changes</p><p>Changing name, locality, configurations, possession or registration details on an approved listing sends it back to admin review.</p></Card>
        </aside>
      </div>
      {node}
    </>
  );
}

function Company() {
  useDocumentTitle('Company');
  const { dev } = useDev();
  const act = useAct();
  const [f, setF] = useState({ company: dev.company, shortName: dev.shortName, contactPerson: dev.contactPerson, contactEmail: dev.contactEmail, cin: dev.cin, yearsActive: String(dev.yearsActive), about: dev.about, docs: dev.verificationDocs.join('\n') });
  const [err, setErr] = useState<Record<string, string>>({});
  const save = (resubmit: boolean) => {
    const e: Record<string, string> = {};
    if (f.company.trim().length < 3) e.company = 'Enter the legal company name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail)) e.contactEmail = 'Enter a valid email';
    if (f.cin.trim().length < 6) e.cin = 'Enter the company identification number';
    if (resubmit && !f.docs.trim()) e.docs = 'Add at least one verification document';
    setErr(e);
    if (Object.keys(e).length) return;
    act((d, ctx) => updateDeveloperProfile(d, ctx, dev.id, { company: f.company, shortName: f.shortName, contactPerson: f.contactPerson, contactEmail: f.contactEmail, cin: f.cin, yearsActive: Number(f.yearsActive) || 0, about: f.about, verificationDocs: f.docs.split('\n').map((x) => x.trim()).filter(Boolean) }, resubmit), { success: resubmit ? 'Submitted for verification' : 'Saved' });
  };
  return (
    <>
      <PageHeader title="Company onboarding" crumbs={[{ label: 'Developer', to: '/developer' }, { label: 'Company' }]} actions={<StatusBadge status={dev.verificationStatus} label={`Verification: ${dev.verificationStatus}`} />} />
      {dev.verificationNote && <div className="mb-5 rounded-xl bg-slate-100 p-3 text-sm">Admin note: {dev.verificationNote}</div>}
      <Card>
        <form className="p-4 sm:p-6 grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save(false); }}>
          <Field label="Legal company name" required error={err.company} htmlFor="c-n"><Input id="c-n" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
          <Field label="Brand / short name" required htmlFor="c-s"><Input id="c-s" value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} /></Field>
          <Field label="Contact person" required htmlFor="c-c"><Input id="c-c" value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} /></Field>
          <Field label="Contact email" required error={err.contactEmail} htmlFor="c-e"><Input id="c-e" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
          <Field label="Company ID (CIN / LLPIN)" required error={err.cin} hint="Fictional in this demo" htmlFor="c-i"><Input id="c-i" value={f.cin} onChange={(e) => setF({ ...f, cin: e.target.value })} /></Field>
          <Field label="Years active" required htmlFor="c-y"><Input id="c-y" type="number" min={0} value={f.yearsActive} onChange={(e) => setF({ ...f, yearsActive: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="About the company" required htmlFor="c-a"><Textarea id="c-a" rows={3} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Verification documents" required error={err.docs} hint="One file name per line. Demo: no files are uploaded or stored; production needs private document storage." htmlFor="c-d"><Textarea id="c-d" rows={3} value={f.docs} onChange={(e) => setF({ ...f, docs: e.target.value })} /></Field></div>
          <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" variant="secondary">Save</Button><Button type="button" onClick={() => save(true)}>Save & submit for verification</Button></div>
        </form>
      </Card>
    </>
  );
}

function ProjectEdit() {
  const { id } = useParams();
  const { s, dev } = useDev();
  const p = s.projects.find((x) => x.id === id) as Project | undefined;
  if (!p) return <NotFound />;
  if (p.developerId !== dev.id) return <EmptyState icon={Lock} title="Not your project" body="You can only edit your own projects." />;
  return <ProjectWizard existing={p} />;
}

export default function DeveloperRoutes() {
  const nav = [
    { to: '/developer', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/developer/projects', label: 'Projects', icon: FolderKanban, end: true },
    { to: '/developer/projects/new', label: 'New project', icon: PlusCircle },
    { to: '/developer/company', label: 'Company & verification', icon: Building2 },
  ];
  return (
    <Routes>
      <Route element={<PortalLayout role="developer" nav={nav} orgName={(st, id) => st.developers.find((d) => d.id === id)?.shortName ?? ''} />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<ProjectsList />} />
        <Route path="projects/new" element={<ProjectWizard />} />
        <Route path="projects/:id" element={<ProjectManage />} />
        <Route path="projects/:id/edit" element={<ProjectEdit />} />
        <Route path="company" element={<Company />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
