import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check } from 'lucide-react';
import { useAct, useDocumentTitle } from '../../state/hooks';
import { useDev } from './DeveloperRoutes';
import { createProject, submitProject, updateProject, validateProjectDraft, type ProjectDraft } from '../../domain/projects';
import { AMENITIES, LOCALITIES, LOCALITY_COORDS } from '../../data/seed';
import { formatPriceRange, lakh } from '../../domain/format';
import { Button, Card, Checkbox, DemoTag, Field, Input, PageHeader, Select, Textarea, cx } from '../../ui/kit';
import { ProjectVisual } from '../../ui/visuals';
import type { ConstructionStatus, Project, PropertyType } from '../../domain/types';

interface CfgRow { id: string; bhk: number; cMin: string; cMax: string; pMin: string; pMax: string; total: string; avail: string }
const STEPS = ['Basics', 'Units & pricing', 'Amenities & media', 'Registration & CP terms', 'Review'];

export function ProjectWizard({ existing }: { existing?: Project }) {
  useDocumentTitle(existing ? `Edit ${existing.name}` : 'New project');
  const { s, dev } = useDev();
  const act = useAct();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const e0 = existing;
  const [f, setF] = useState({
    name: e0?.name ?? '', locality: e0?.locality ?? '', address: e0?.address ?? '', lat: String(e0?.lat ?? ''), lng: String(e0?.lng ?? ''),
    description: e0?.description ?? '', propertyType: (e0?.propertyType ?? 'apartment') as PropertyType, constructionStatus: (e0?.constructionStatus ?? 'under_construction') as ConstructionStatus,
    possession: e0?.possession ?? '', amenities: e0?.amenities ?? ['Clubhouse', 'Gym', '24x7 security'], galleryCount: e0?.galleryCount ?? 5,
    mediaFiles: e0 ? ['exterior-render.jpg', 'site-plan.pdf'] : [] as string[], brochureName: e0?.brochureName ?? '',
    inclusions: (e0?.priceInclusions ?? ['Base price', 'Covered car parking (1)']).join('\n'), exclusions: (e0?.priceExclusions ?? ['Stamp duty & registration', 'GST as applicable']).join('\n'),
    registrationNo: e0?.registrationNo ?? '', registrationAuthority: e0?.registrationAuthority ?? 'Demo State Real Estate Authority (fictional)',
    commission: String(e0?.cpTerms.commissionPercent ?? 2), payoutTrigger: e0?.cpTerms.payoutTrigger ?? 'On registration of agreement for sale', termsNotes: e0?.cpTerms.notes ?? '', cpApprovalRequired: e0?.cpApprovalRequired ?? false,
  });
  const [cfgs, setCfgs] = useState<CfgRow[]>(e0 ? e0.configs.map((c) => ({ id: c.id, bhk: c.bhk, cMin: String(c.carpetMinSqft), cMax: String(c.carpetMaxSqft), pMin: String(c.priceMin / 1e7), pMax: String(c.priceMax / 1e7), total: String(c.unitsTotal), avail: String(c.unitsAvailable) })) : [{ id: 'new_1', bhk: 2, cMin: '', cMax: '', pMin: '', pMax: '', total: '', avail: '' }]);
  const up = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const draft = (): ProjectDraft => {
    const [dlat, dlng] = LOCALITY_COORDS[f.locality] ?? [18.52, 73.85];
    return {
      name: f.name.trim(), city: 'Pune', locality: f.locality, address: f.address || `${f.locality}, Pune`, lat: Number(f.lat) || dlat, lng: Number(f.lng) || dlng,
      description: f.description.trim(), propertyType: f.propertyType, constructionStatus: f.constructionStatus,
      configs: cfgs.map((c, i) => ({ id: c.id.startsWith('new') ? `cfg_n${Date.now() % 100000}_${i}` : c.id, bhk: c.bhk, label: `${c.bhk} BHK`, carpetMinSqft: Number(c.cMin), carpetMaxSqft: Number(c.cMax), priceMin: lakh(Number(c.pMin)), priceMax: lakh(Number(c.pMax)), unitsTotal: Number(c.total), unitsAvailable: Number(c.avail) })),
      possession: f.possession, amenities: f.amenities, galleryCount: f.galleryCount, paletteSeed: e0?.paletteSeed ?? (s.projects.length + 3),
      brochureName: f.brochureName || `${f.name.replace(/\s+/g, '-') || 'Project'}-Brochure-DEMO.txt`,
      priceInclusions: f.inclusions.split('\n').map((x) => x.trim()).filter(Boolean), priceExclusions: f.exclusions.split('\n').map((x) => x.trim()).filter(Boolean),
      registrationNo: f.registrationNo.trim(), registrationAuthority: f.registrationAuthority,
      cpTerms: { commissionPercent: Number(f.commission), payoutTrigger: f.payoutTrigger, notes: f.termsNotes || 'Separate from lead purchase fees.' }, cpApprovalRequired: f.cpApprovalRequired,
    };
  };

  const stepErrors = (i: number): Record<string, string> => {
    const all = validateProjectDraft(draft());
    const e: Record<string, string> = {};
    const pick = (keys: string[]) => keys.forEach((k) => all[k] && (e[k] = all[k]));
    if (i === 0) { pick(['name', 'locality', 'description', 'possession']); }
    if (i === 1) { pick(['configs']); if (cfgs.some((c) => !c.cMin || !c.cMax || !c.pMin || !c.pMax || !c.total || c.avail === '')) e.configs = 'Fill in every field for each configuration'; }
    if (i === 3) pick(['registrationNo', 'cpTerms']);
    return e;
  };
  const next = () => { const e = stepErrors(step); setErrors(e); if (!Object.keys(e).length) setStep((x) => Math.min(STEPS.length - 1, x + 1)); };

  const save = (submit: boolean) => {
    for (let i = 0; i < 4; i++) { const e = stepErrors(i); if (Object.keys(e).length && (submit || i === 0)) { setErrors(e); setStep(i); return; } }
    const d = draft();
    if (existing) {
      const r = act((st, ctx) => updateProject(st, ctx, dev.id, existing.id, d));
      if (!r) return;
      if (submit && ['draft', 'changes_requested'].includes(existing.status)) act((st, ctx) => submitProject(st, ctx, dev.id, existing.id), { success: 'Submitted for admin review' });
      else act(() => null, { success: r.returnedToReview ? 'Saved — material change sent the listing back to admin review' : 'Changes saved' });
      nav(`/developer/projects/${existing.id}`);
    } else {
      const p = act((st, ctx) => { const np = createProject(st, ctx, dev.id, d); if (submit) submitProject(st, ctx, dev.id, np.id); return np; }, { success: submit ? 'Project submitted for admin review' : 'Draft saved' });
      if (p) nav(`/developer/projects/${p.id}`);
    }
  };

  const d = draft();
  return (
    <>
      <PageHeader title={existing ? `Edit ${existing.name}` : 'New project'} crumbs={[{ label: 'Developer', to: '/developer' }, { label: 'Projects', to: '/developer/projects' }, { label: existing ? 'Edit' : 'New' }]} subtitle="You can only list projects for your own company. Listings stay hidden until admin approves and publishes them." />
      <ol className="flex gap-1 overflow-x-auto mb-5 -mx-1 px-1" aria-label="Steps">
        {STEPS.map((l, i) => (
          <li key={l} className="shrink-0">
            <button type="button" onClick={() => i < step && setStep(i)} className={cx('flex items-center gap-2 rounded-full px-3 h-8 text-xs font-medium ring-1 ring-inset', i === step ? 'bg-navy-800 text-white ring-navy-800' : i < step ? 'bg-teal-50 text-teal-800 ring-teal-200' : 'bg-white text-slate-500 ring-slate-200')} aria-current={i === step ? 'step' : undefined}>
              <span className="tabular-nums">{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{l}
            </button>
          </li>
        ))}
      </ol>
      <Card className="p-4 sm:p-6">
        {step === 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Project name" required error={errors.name} htmlFor="w-n"><Input id="w-n" value={f.name} onChange={(e) => up('name', e.target.value)} placeholder="e.g. Sahyadri Lakeview" /></Field>
            <Field label="City" required htmlFor="w-c"><Select id="w-c" value="Pune" disabled><option>Pune</option></Select></Field>
            <Field label="Locality" required error={errors.locality} htmlFor="w-l"><Select id="w-l" value={f.locality} onChange={(e) => { up('locality', e.target.value); const c = LOCALITY_COORDS[e.target.value]; if (c) { up('lat', String(c[0])); up('lng', String(c[1])); } }}><option value="">Choose…</option>{LOCALITIES.map((l) => <option key={l}>{l}</option>)}</Select></Field>
            <Field label="Address" htmlFor="w-a"><Input id="w-a" value={f.address} onChange={(e) => up('address', e.target.value)} /></Field>
            <Field label="Latitude" hint="Map coordinates" htmlFor="w-lat"><Input id="w-lat" value={f.lat} onChange={(e) => up('lat', e.target.value)} /></Field>
            <Field label="Longitude" htmlFor="w-lng"><Input id="w-lng" value={f.lng} onChange={(e) => up('lng', e.target.value)} /></Field>
            <Field label="Property type" required htmlFor="w-t"><Select id="w-t" value={f.propertyType} onChange={(e) => up('propertyType', e.target.value as PropertyType)}><option value="apartment">Apartment</option><option value="villa">Villa</option></Select></Field>
            <Field label="Construction status" required htmlFor="w-s"><Select id="w-s" value={f.constructionStatus} onChange={(e) => up('constructionStatus', e.target.value as ConstructionStatus)}><option value="new_launch">New launch</option><option value="under_construction">Under construction</option><option value="ready_to_move">Ready to move</option></Select></Field>
            <Field label="Possession month" required error={errors.possession} htmlFor="w-p"><Input id="w-p" type="month" value={f.possession} onChange={(e) => up('possession', e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Description" required error={errors.description} htmlFor="w-d"><Textarea id="w-d" rows={4} value={f.description} onChange={(e) => up('description', e.target.value)} /></Field></div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            {errors.configs && <p className="text-sm text-red-600" role="alert">{errors.configs}</p>}
            {cfgs.map((c, i) => (
              <div key={c.id} className="rounded-xl ring-1 ring-slate-200 p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
                <Field label="BHK" required htmlFor={`c-b-${i}`}><Select id={`c-b-${i}`} value={c.bhk} onChange={(e) => setCfgs(cfgs.map((x, j) => (j === i ? { ...x, bhk: Number(e.target.value) } : x)))}>{[1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b} BHK</option>)}</Select></Field>
                {([['cMin', 'Carpet min (sq ft)'], ['cMax', 'Carpet max (sq ft)'], ['pMin', 'Price min (₹ L)'], ['pMax', 'Price max (₹ L)'], ['total', 'Total units'], ['avail', 'Available']] as const).map(([k, l]) => (
                  <Field key={k} label={l} required htmlFor={`c-${k}-${i}`}><Input id={`c-${k}-${i}`} type="number" min={0} step={k.startsWith('p') ? '0.5' : '1'} value={c[k]} onChange={(e) => setCfgs(cfgs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></Field>
                ))}
                <Button variant="ghost" aria-label="Remove configuration" disabled={cfgs.length === 1} onClick={() => setCfgs(cfgs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setCfgs([...cfgs, { id: `new_${cfgs.length + 1}_${Date.now() % 1000}`, bhk: 3, cMin: '', cMax: '', pMin: '', pMax: '', total: '', avail: '' }])}><Plus className="h-4 w-4" />Add configuration</Button>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Price includes" hint="One per line" htmlFor="w-in"><Textarea id="w-in" rows={3} value={f.inclusions} onChange={(e) => up('inclusions', e.target.value)} /></Field>
              <Field label="Price excludes" hint="One per line" htmlFor="w-ex"><Textarea id="w-ex" rows={3} value={f.exclusions} onChange={(e) => up('exclusions', e.target.value)} /></Field>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <fieldset><legend className="text-sm font-medium text-slate-700 mb-2">Amenities</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{AMENITIES.map((a) => <Checkbox key={a} checked={f.amenities.includes(a)} onChange={(v) => up('amenities', v ? [...f.amenities, a] : f.amenities.filter((x) => x !== a))} label={a} />)}</div>
            </fieldset>
            <div>
              <p className="text-sm font-medium text-slate-700">Media <DemoTag /></p>
              <p className="text-xs text-slate-500 mb-2">Demo: files are not uploaded. The listing uses generated illustrations; file names are recorded for review.</p>
              <div className="flex flex-wrap gap-2 mb-2">{f.mediaFiles.map((m) => <span key={m} className="text-xs rounded bg-slate-100 px-2 py-1">{m} <button aria-label={`Remove ${m}`} onClick={() => up('mediaFiles', f.mediaFiles.filter((x) => x !== m))}>×</button></span>)}</div>
              <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-slate-300 text-sm cursor-pointer hover:bg-slate-50">Choose files (names only)<input type="file" multiple className="sr-only" onChange={(e) => up('mediaFiles', [...f.mediaFiles, ...Array.from(e.target.files ?? []).map((x) => x.name)])} /></label>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-xl">{(['exterior', 'aerial', 'amenity', 'interior', 'lobby'] as const).map((k) => <ProjectVisual key={k} project={{ paletteSeed: e0?.paletteSeed ?? s.projects.length + 3, propertyType: f.propertyType, name: f.name || 'New project' }} kind={k} className="aspect-[4/3] rounded-md" />)}</div>
            </div>
            <Field label="Brochure file name" hint="A demo text brochure is generated for download" htmlFor="w-b"><Input id="w-b" value={f.brochureName} onChange={(e) => up('brochureName', e.target.value)} placeholder="Project-Brochure.pdf" /></Field>
          </div>
        )}
        {step === 3 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Project registration number" required error={errors.registrationNo} hint="Admin reviews it explicitly. A number alone isn’t shown as verified." htmlFor="w-r"><Input id="w-r" value={f.registrationNo} onChange={(e) => up('registrationNo', e.target.value)} placeholder="DEMO-REG-…" /></Field>
            <Field label="Registration authority" required htmlFor="w-ra"><Input id="w-ra" value={f.registrationAuthority} onChange={(e) => up('registrationAuthority', e.target.value)} /></Field>
            <Field label="CP commission (%)" required error={errors.cpTerms} hint="Developer → partner brokerage. Separate from lead purchase fees." htmlFor="w-cm"><Input id="w-cm" type="number" step="0.25" min={0} max={10} value={f.commission} onChange={(e) => up('commission', e.target.value)} /></Field>
            <Field label="Payout trigger" required htmlFor="w-pt"><Input id="w-pt" value={f.payoutTrigger} onChange={(e) => up('payoutTrigger', e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Terms notes" htmlFor="w-tn"><Textarea id="w-tn" rows={2} value={f.termsNotes} onChange={(e) => up('termsNotes', e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Checkbox checked={f.cpApprovalRequired} onChange={(v) => up('cpApprovalRequired', v)} label="Require my approval before a partner can bid on this project’s leads" description="Optional and off by default." /></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-navy-900 text-base">{d.name || 'Untitled'} · {d.locality || '—'}</p>
            <p className="text-slate-600">{d.description}</p>
            <ul className="space-y-1">{d.configs.map((c) => <li key={c.id}>{c.label}: {c.carpetMinSqft}–{c.carpetMaxSqft} sq ft · {c.priceMin && c.priceMax ? formatPriceRange(c.priceMin, c.priceMax) : '—'} · {c.unitsAvailable}/{c.unitsTotal} available</li>)}</ul>
            <p>Possession {d.possession || '—'} · {d.amenities.length} amenities · registration {d.registrationNo || '—'} · commission {d.cpTerms.commissionPercent}%</p>
            {Object.keys(validateProjectDraft(d)).length > 0 && <p className="text-red-600">Fix: {Object.values(validateProjectDraft(d)).join('; ')}</p>}
            {existing && ['approved', 'published', 'paused'].includes(existing.status) && <p className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-2 text-amber-900">Changing name, locality, configurations, possession or registration details will send this listing back to admin review.</p>}
          </div>
        )}
      </Card>
      <div className="mt-4 flex flex-wrap gap-2 justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => save(false)}>{existing ? 'Save changes' : 'Save draft'}</Button>
          {step < STEPS.length - 1 ? <Button onClick={next}>Next</Button> : (!existing || ['draft', 'changes_requested'].includes(existing.status)) ? <Button onClick={() => save(true)}>Submit for review</Button> : <Button onClick={() => save(false)}>Save changes</Button>}
        </div>
      </div>
    </>
  );
}
