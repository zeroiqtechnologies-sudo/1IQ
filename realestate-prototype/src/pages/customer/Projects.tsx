import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react';
import { useDb, useDocumentTitle } from '../../state/hooks';
import { publicProjects } from '../../domain/projects';
import { AMENITIES, LOCALITIES } from '../../data/seed';
import { Breadcrumbs, Button, Chip, cx, EmptyState, Input, Select } from '../../ui/kit';
import { LocalityMap } from '../../ui/visuals';
import { CONSTRUCTION_LABEL, ProjectCard, summary } from './common';
import type { Project } from '../../domain/types';

const L = 1e7; // paise per lakh

export default function Projects() {
  useDocumentTitle('Explore projects');
  const s = useDb();
  const [sp, setSp] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapSel, setMapSel] = useState<string>();
  const get = (k: string) => sp.get(k) ?? '';
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(',') : []);
  const set = (k: string, v: string | string[]) => {
    const n = new URLSearchParams(sp);
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) n.set(k, val); else n.delete(k);
    setSp(n, { replace: true });
  };
  const toggleIn = (k: string, v: string) => { const cur = list(k); set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); };

  const view = (get('view') || 'grid') as 'grid' | 'list' | 'map';
  const sort = get('sort') || 'relevance';
  const q = get('q').toLowerCase();

  const results = useMemo(() => {
    const bhk = list('bhk').map(Number);
    const locs = list('locality');
    const am = list('amenities');
    const bMin = Number(get('budgetMin') || 0) * L;
    const bMax = Number(get('budgetMax') || 0) * L;
    const cMin = Number(get('carpetMin') || 0);
    const possBy = get('possessionBy');
    const type = get('type');
    const status = get('status');
    const city = get('city');
    let r = publicProjects(s).filter((p) => {
      const sm = summary(p);
      const dev = s.developers.find((d) => d.id === p.developerId);
      if (q && !`${p.name} ${p.locality} ${p.city} ${dev?.shortName ?? ''}`.toLowerCase().includes(q)) return false;
      if (city && p.city !== city) return false;
      if (locs.length && !locs.includes(p.locality)) return false;
      if (bhk.length && !p.configs.some((c) => bhk.includes(c.bhk))) return false;
      if (bMax && sm.priceMin > bMax) return false;
      if (bMin && sm.priceMax < bMin) return false;
      if (cMin && sm.carpetMax < cMin) return false;
      if (possBy && p.possession > `${possBy}-12`) return false;
      if (type && p.propertyType !== type) return false;
      if (status && p.constructionStatus !== status) return false;
      if (am.length && !am.every((a) => p.amenities.includes(a))) return false;
      return true;
    });
    const score = (p: Project) => (p.featured ? 2 : 0) + (q && p.name.toLowerCase().includes(q) ? 5 : 0) + (p.registrationReview === 'reviewed' ? 1 : 0);
    r = [...r].sort((a, b) => {
      if (sort === 'price_asc') return summary(a).priceMin - summary(b).priceMin;
      if (sort === 'price_desc') return summary(b).priceMax - summary(a).priceMax;
      if (sort === 'possession') return a.possession.localeCompare(b.possession);
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, sp]);

  const activeCount = ['q', 'locality', 'bhk', 'budgetMin', 'budgetMax', 'carpetMin', 'possessionBy', 'type', 'status', 'amenities', 'city'].filter((k) => sp.get(k)).length;

  const filters = (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="f-q">Project, locality or developer</label>
        <Input id="f-q" className="mt-1" value={get('q')} onChange={(e) => set('q', e.target.value)} placeholder="e.g. Baner" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="f-city">City</label>
        <Select id="f-city" className="mt-1" value={get('city')} onChange={(e) => set('city', e.target.value)}>
          <option value="">All cities</option><option value="Pune">Pune</option>
        </Select>
        <p className="text-xs text-slate-400 mt-1">Pune-first launch. More cities later.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Locality</legend>
        <div className="mt-2 flex flex-wrap gap-2">{LOCALITIES.map((l) => <Chip key={l} active={list('locality').includes(l)} onClick={() => toggleIn('locality', l)}>{l}</Chip>)}</div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Budget (₹ lakh)</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select aria-label="Minimum budget" value={get('budgetMin')} onChange={(e) => set('budgetMin', e.target.value)}>
            <option value="">No min</option>{[40, 60, 80, 100, 150, 200].map((v) => <option key={v} value={v}>{v >= 100 ? `₹${v / 100} Cr` : `₹${v} L`}</option>)}
          </Select>
          <Select aria-label="Maximum budget" value={get('budgetMax')} onChange={(e) => set('budgetMax', e.target.value)}>
            <option value="">No max</option>{[60, 80, 100, 150, 200, 250, 350].map((v) => <option key={v} value={v}>{v >= 100 ? `₹${v / 100} Cr` : `₹${v} L`}</option>)}
          </Select>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Configuration</legend>
        <div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4].map((b) => <Chip key={b} active={list('bhk').includes(String(b))} onClick={() => toggleIn('bhk', String(b))}>{b} BHK</Chip>)}</div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="f-type">Property type</label>
          <Select id="f-type" className="mt-1" value={get('type')} onChange={(e) => set('type', e.target.value)}><option value="">Any</option><option value="apartment">Apartment</option><option value="villa">Villa</option></Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="f-carpet">Min carpet</label>
          <Select id="f-carpet" className="mt-1" value={get('carpetMin')} onChange={(e) => set('carpetMin', e.target.value)}><option value="">Any</option>{[500, 700, 900, 1200, 1600].map((v) => <option key={v} value={v}>{v}+ sq ft</option>)}</Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="f-poss">Possession by</label>
          <Select id="f-poss" className="mt-1" value={get('possessionBy')} onChange={(e) => set('possessionBy', e.target.value)}><option value="">Any time</option>{['2026', '2027', '2028'].map((y) => <option key={y} value={y}>End of {y}</option>)}</Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="f-status">Construction</label>
          <Select id="f-status" className="mt-1" value={get('status')} onChange={(e) => set('status', e.target.value)}><option value="">Any</option>{Object.entries(CONSTRUCTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Amenities</legend>
        <div className="mt-2 flex flex-wrap gap-2">{AMENITIES.slice(0, 10).map((a) => <Chip key={a} active={list('amenities').includes(a)} onClick={() => toggleIn('amenities', a)}>{a}</Chip>)}</div>
      </fieldset>
      {activeCount > 0 && <Button variant="ghost" onClick={() => setSp(new URLSearchParams(view !== 'grid' ? { view } : {}), { replace: true })}>Clear all filters</Button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Projects in Pune' }]} />
      <div className="mt-2 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">New projects in Pune</h1>
          <p className="text-sm text-slate-500" aria-live="polite">{results.length} project{results.length === 1 ? '' : 's'} found</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="h-4 w-4" />Filters{activeCount ? ` (${activeCount})` : ''}</Button>
          <Select aria-label="Sort by" value={sort} onChange={(e) => set('sort', e.target.value === 'relevance' ? '' : e.target.value)} className="sm:w-auto">
            <option value="relevance">Sort: Relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="possession">Possession: earliest</option>
          </Select>
          <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden" role="group" aria-label="View">
            {([['grid', LayoutGrid], ['list', List], ['map', MapIcon]] as const).map(([v, I]) => (
              <button key={v} aria-pressed={view === v} aria-label={`${v} view`} onClick={() => set('view', v === 'grid' ? '' : v)} className={cx('h-10 w-10 inline-flex items-center justify-center', view === v ? 'bg-navy-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}><I className="h-4 w-4" /></button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid lg:grid-cols-[17rem_1fr] gap-6">
        <aside className="hidden lg:block" aria-label="Filters"><div className="sticky top-24 rounded-xl ring-1 ring-slate-200 p-4 max-h-[calc(100vh-7rem)] overflow-y-auto">{filters}</div></aside>
        {filtersOpen && (
          <div className="fixed inset-0 z-[80] lg:hidden">
            <div className="absolute inset-0 bg-navy-950/50" onClick={() => setFiltersOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-label="Filters">
              <div className="flex items-center justify-between px-4 py-3 border-b"><p className="font-semibold">Filters</p><button aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X className="h-5 w-5" /></button></div>
              <div className="flex-1 overflow-y-auto p-4">{filters}</div>
              <div className="p-3 border-t"><Button className="w-full" onClick={() => setFiltersOpen(false)}>Show {results.length} results</Button></div>
            </div>
          </div>
        )}
        <section aria-label="Results" className="min-w-0">
          {!results.length ? (
            <EmptyState title="No projects match these filters" body="Try widening your budget or removing a locality. You can also make a general enquiry and we’ll suggest options." action={<Button variant="secondary" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear filters</Button>} />
          ) : view === 'map' ? (
            <div className="space-y-4">
              <LocalityMap projects={results} onSelect={setMapSel} selectedId={mapSel} />
              <div className="grid gap-4 sm:grid-cols-2">
                {(mapSel ? results.filter((p) => p.id === mapSel) : results).map((p) => <ProjectCard key={p.id} s={s} p={p} />)}
              </div>
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {results.map((p) => <ProjectCard key={p.id} s={s} p={p} layout={view} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
