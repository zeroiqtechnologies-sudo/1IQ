import { Link } from 'react-router-dom';
import { X, GitCompareArrows, Heart, Building2, Users, ShieldCheck } from 'lucide-react';
import { useDb, useDocumentTitle } from '../../state/hooks';
import { formatPossession } from '../../domain/format';
import { Breadcrumbs, EmptyState, LinkButton, cx } from '../../ui/kit';
import { ProjectVisual } from '../../ui/visuals';
import { CONSTRUCTION_LABEL, ProjectCard, RegistrationBadge, summary, useShortlist } from './common';

export function Compare() {
  useDocumentTitle('Compare projects');
  const s = useDb();
  const { toggleCompare } = useShortlist();
  const items = s.compare.map((id) => s.projects.find((p) => p.id === id && p.status === 'published')).filter(Boolean) as typeof s.projects;
  const rows: [string, (p: (typeof items)[number]) => React.ReactNode][] = [
    ['Developer', (p) => s.developers.find((d) => d.id === p.developerId)?.shortName],
    ['Locality', (p) => p.locality],
    ['Price range', (p) => <strong>{summary(p).priceLabel}</strong>],
    ['Configurations', (p) => summary(p).bhkLabel],
    ['Carpet area', (p) => summary(p).carpetLabel],
    ['Possession', (p) => formatPossession(p.possession)],
    ['Status', (p) => CONSTRUCTION_LABEL[p.constructionStatus]],
    ['Property type', (p) => (p.propertyType === 'villa' ? 'Villa' : 'Apartment')],
    ['Units available', (p) => `${summary(p).available} of ${summary(p).units}`],
    ['Amenities', (p) => `${p.amenities.length}: ${p.amenities.slice(0, 5).join(', ')}${p.amenities.length > 5 ? '…' : ''}`],
    ['Registration', (p) => <RegistrationBadge p={p} />],
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Compare' }]} />
      <h1 className="mt-2 text-2xl font-bold text-navy-900">Compare projects</h1>
      <p className="text-sm text-slate-500">Up to three projects side by side. {items.length}/3 selected.</p>
      {!items.length ? (
        <EmptyState icon={GitCompareArrows} title="Nothing to compare yet" body="Use the Compare button on any project card to add up to three projects." action={<LinkButton to="/projects">Browse projects</LinkButton>} />
      ) : (
        <div className="mt-5 overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[640px] text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="w-36 sticky left-0 bg-white" />
                {items.map((p) => (
                  <th key={p.id} className="p-2 align-top text-left font-normal">
                    <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
                      <ProjectVisual project={p} className="aspect-[16/9]" />
                      <div className="p-3 flex items-start justify-between gap-2">
                        <Link to={`/projects/${p.id}`} className="font-semibold text-navy-900 hover:text-teal-700">{p.name}</Link>
                        <button onClick={() => toggleCompare(s, p.id)} aria-label={`Remove ${p.name}`} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </th>
                ))}
                {items.length < 3 && <th className="p-2 align-top"><Link to="/projects" className="flex h-full min-h-[10rem] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-700 text-sm font-medium">+ Add a project</Link></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn], i) => (
                <tr key={label} className={cx(i % 2 === 0 && 'bg-slate-50')}>
                  <th scope="row" className={cx('text-left font-medium text-slate-500 px-3 py-2.5 sticky left-0', i % 2 === 0 ? 'bg-slate-50' : 'bg-white')}>{label}</th>
                  {items.map((p) => <td key={p.id} className="px-3 py-2.5 align-top">{fn(p)}</td>)}
                  {items.length < 3 && <td />}
                </tr>
              ))}
              <tr>
                <th />
                {items.map((p) => <td key={p.id} className="px-3 py-3"><LinkButton to={`/enquire?project=${p.id}`} size="sm" className="w-full">Enquire</LinkButton></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Shortlist() {
  useDocumentTitle('Shortlist');
  const s = useDb();
  const items = s.shortlist.map((id) => s.projects.find((p) => p.id === id)).filter(Boolean) as typeof s.projects;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shortlist' }]} />
      <h1 className="mt-2 text-2xl font-bold text-navy-900">Your shortlist</h1>
      <p className="text-sm text-slate-500">Saved in this browser (demo).</p>
      {!items.length ? (
        <EmptyState icon={Heart} title="No saved projects" body="Tap the heart on a project to save it here." action={<LinkButton to="/projects">Browse projects</LinkButton>} />
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => p.status === 'published' ? <ProjectCard key={p.id} s={s} p={p} /> : <div key={p.id} className="rounded-xl ring-1 ring-slate-200 p-4 text-sm text-slate-500">{p.name} is no longer listed.</div>)}
        </div>
      )}
    </div>
  );
}

export function Partners() {
  useDocumentTitle('For partners & developers');
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-navy-900">Business portal</h1>
      <p className="mt-2 text-slate-600 max-w-2xl">Developers list projects. Channel partners follow projects and bid for consented, qualified, anonymised leads. Admin keeps the marketplace fair.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { to: '/developer', icon: Building2, t: 'Developers', b: 'Onboard your company, submit projects for review, see partner interest and aggregated outcomes.' },
          { to: '/cp', icon: Users, t: 'Channel partners', b: 'Follow projects, bid on matching qualified leads from a prepaid balance, and manage follow-ups.' },
          { to: '/admin', icon: ShieldCheck, t: 'Admin', b: 'Verification, listing review, qualification, auctions, disputes, metrics and demo controls.' },
        ].map(({ to, icon: I, t, b }) => (
          <Link key={to} to={to} className="rounded-2xl ring-1 ring-slate-200 p-5 hover:ring-teal-400 hover:shadow-md transition">
            <I className="h-7 w-7 text-teal-700" />
            <h2 className="mt-3 font-semibold text-navy-900">{t}</h2>
            <p className="mt-1 text-sm text-slate-600">{b}</p>
            <p className="mt-3 text-sm font-semibold text-teal-700">Open demo workspace →</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">Lead purchase fees buy access to one enquiry. They do not guarantee a booking and are separate from any developer-to-partner commission terms.</p>
    </div>
  );
}

export function NotFound() {
  useDocumentTitle('Page not found');
  return <div className="mx-auto max-w-xl px-4 py-20"><EmptyState title="Page not found" body="The link may be outdated, or the item may have been removed or reset." action={<LinkButton to="/">Go home</LinkButton>} /></div>;
}
