import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShieldCheck, UserCheck, PhoneOff } from 'lucide-react';
import { useDb, useDocumentTitle } from '../../state/hooks';
import { publicProjects } from '../../domain/projects';
import { LOCALITIES } from '../../data/seed';
import { Button, Select } from '../../ui/kit';
import { ProjectCard, summary } from './common';

export default function Home() {
  useDocumentTitle('New homes in Pune');
  const s = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [bhk, setBhk] = useState('');
  const [budget, setBudget] = useState('');
  const projects = publicProjects(s);
  const featured = projects.filter((p) => p.featured).slice(0, 3);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (bhk) params.set('bhk', bhk);
    if (budget) params.set('budgetMax', budget);
    nav(`/projects?${params}`);
  };
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight max-w-2xl">New developer projects in Pune, with one trusted partner to help you.</h1>
          <p className="mt-3 text-navy-100 max-w-2xl text-sm sm:text-base">Search verified-status listings directly from developers. When you enquire, only one assigned channel partner receives your details — never a crowd of callers.</p>
          <form onSubmit={go} className="mt-6 bg-white rounded-2xl p-2 sm:p-3 shadow-lg grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] text-slate-800" role="search">
            <label className="relative">
              <span className="sr-only">City, locality or project</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Baner, Wakad, a project name…" className="w-full h-12 rounded-xl pl-10 pr-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-teal-600 border-0" />
            </label>
            <Select aria-label="Configuration" value={bhk} onChange={(e) => setBhk(e.target.value)} className="h-12 sm:w-36">
              <option value="">Any BHK</option>
              {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b} BHK</option>)}
            </Select>
            <Select aria-label="Maximum budget" value={budget} onChange={(e) => setBudget(e.target.value)} className="h-12 sm:w-40">
              <option value="">Any budget</option>
              <option value="60">Up to ₹60 L</option>
              <option value="100">Up to ₹1 Cr</option>
              <option value="150">Up to ₹1.5 Cr</option>
              <option value="250">Up to ₹2.5 Cr</option>
            </Select>
            <Button type="submit" size="lg" className="h-12">Search</Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Popular localities">
            {LOCALITIES.map((l) => (
              <Link key={l} to={`/projects?locality=${l}`} className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">{l} · {projects.filter((p) => p.locality === l).length}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy-900">Featured projects</h2>
            <p className="text-sm text-slate-500">{projects.length} published projects across {new Set(projects.map((p) => p.locality)).size} Pune localities</p>
          </div>
          <Link to="/projects" className="shrink-0 whitespace-nowrap text-sm font-semibold text-teal-700 hover:underline">See all</Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => <ProjectCard key={p.id} s={s} p={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, t: 'Explicit review status', b: 'We show whether registration details were reviewed. A number alone is not verification.' },
            { icon: UserCheck, t: 'One partner per enquiry', b: 'Your details go to one assigned partner only, and only after you agree.' },
            { icon: PhoneOff, t: 'You stay in control', b: 'Change contact preferences, withdraw consent or report a problem any time.' },
          ].map(({ icon: I, t, b }) => (
            <div key={t} className="rounded-xl bg-teal-50 ring-1 ring-teal-100 p-4">
              <I className="h-6 w-6 text-teal-700" aria-hidden />
              <h3 className="mt-2 font-semibold text-navy-900">{t}</h3>
              <p className="text-sm text-slate-600 mt-1">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <h2 className="text-xl font-bold text-navy-900">Browse by budget</h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['Under ₹60 L', 0, 60], ['₹60 L – ₹1 Cr', 60, 100], ['₹1 Cr – ₹2 Cr', 100, 200], ['Above ₹2 Cr', 200, 0]].map(([label, min, max]) => {
            const count = projects.filter((p) => { const sm = summary(p); return sm.priceMax >= (min as number) * 1e7 && (!max || sm.priceMin <= (max as number) * 1e7); }).length;
            return (
              <Link key={label as string} to={`/projects?${new URLSearchParams({ ...(min ? { budgetMin: String(min) } : {}), ...(max ? { budgetMax: String(max) } : {}) })}`} className="rounded-xl ring-1 ring-slate-200 p-4 hover:ring-teal-400 hover:bg-teal-50/30">
                <p className="font-semibold text-navy-900">{label}</p>
                <p className="text-xs text-slate-500">{count} project{count === 1 ? '' : 's'}</p>
              </Link>
            );
          })}
        </div>
        <div className="mt-8 rounded-2xl bg-navy-50 ring-1 ring-navy-100 p-5 sm:flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-navy-900">Not sure which project yet?</h2>
            <p className="text-sm text-slate-600">Tell us your requirement. With your permission, we match a few relevant projects and one partner helps you compare.</p>
          </div>
          <Link to="/enquire" className="mt-3 sm:mt-0 inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 shrink-0">Make a general enquiry</Link>
        </div>
      </section>
    </>
  );
}
