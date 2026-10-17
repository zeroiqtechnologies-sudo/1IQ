import { Link } from 'react-router-dom';
import { Heart, GitCompareArrows, MapPin, ShieldCheck, ShieldAlert, CalendarClock, Ruler } from 'lucide-react';
import type { DbState, Project } from '../../domain/types';
import { formatPossession, formatPriceRange } from '../../domain/format';
import { Badge, cx } from '../../ui/kit';
import { ProjectVisual } from '../../ui/visuals';
import { tx } from '../../services/local';
import { useToast } from '../../ui/toast';

export function summary(p: Project) {
  const priceMin = Math.min(...p.configs.map((c) => c.priceMin));
  const priceMax = Math.max(...p.configs.map((c) => c.priceMax));
  const carpetMin = Math.min(...p.configs.map((c) => c.carpetMinSqft));
  const carpetMax = Math.max(...p.configs.map((c) => c.carpetMaxSqft));
  const bhks = [...new Set(p.configs.map((c) => c.bhk))].sort();
  const units = p.configs.reduce((t, c) => t + c.unitsTotal, 0);
  const available = p.configs.reduce((t, c) => t + c.unitsAvailable, 0);
  return { priceMin, priceMax, carpetMin, carpetMax, bhks, units, available, priceLabel: formatPriceRange(priceMin, priceMax), bhkLabel: `${bhks.join(', ')} BHK`, carpetLabel: `${carpetMin.toLocaleString('en-IN')}–${carpetMax.toLocaleString('en-IN')} sq ft` };
}

export const CONSTRUCTION_LABEL = { new_launch: 'New launch', under_construction: 'Under construction', ready_to_move: 'Ready to move' } as const;

export function RegistrationBadge({ p }: { p: Project }) {
  if (p.registrationReview === 'reviewed') return <Badge tone="green"><ShieldCheck className="h-3 w-3" />Registration details reviewed</Badge>;
  if (p.registrationReview === 'mismatch') return <Badge tone="red"><ShieldAlert className="h-3 w-3" />Registration mismatch</Badge>;
  return <Badge tone="gray"><ShieldAlert className="h-3 w-3" />Registration supplied · not yet reviewed</Badge>;
}

export function useShortlist() {
  const toast = useToast();
  const toggleSave = (id: string) => tx('guest', (s) => { s.shortlist = s.shortlist.includes(id) ? s.shortlist.filter((x) => x !== id) : [...s.shortlist, id]; });
  const toggleCompare = (s: DbState, id: string) => {
    if (!s.compare.includes(id) && s.compare.length >= 3) {
      toast.push({ tone: 'warning', title: 'Compare up to three projects', body: 'Remove one from Compare to add another.' });
      return;
    }
    tx('guest', (d) => { d.compare = d.compare.includes(id) ? d.compare.filter((x) => x !== id) : [...d.compare, id]; });
  };
  return { toggleSave, toggleCompare };
}

export function SaveCompareButtons({ s, p, compact }: { s: DbState; p: Project; compact?: boolean }) {
  const { toggleSave, toggleCompare } = useShortlist();
  const saved = s.shortlist.includes(p.id);
  const comparing = s.compare.includes(p.id);
  return (
    <div className="flex gap-2">
      <button type="button" onClick={(e) => { e.preventDefault(); toggleSave(p.id); }} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from shortlist` : `Save ${p.name} to shortlist`} className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-xs font-semibold ring-1 ring-inset', saved ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
        <Heart className={cx('h-3.5 w-3.5', saved && 'fill-rose-600 text-rose-600')} />{!compact && (saved ? 'Saved' : 'Save')}
      </button>
      <button type="button" onClick={(e) => { e.preventDefault(); toggleCompare(s, p.id); }} aria-pressed={comparing} aria-label={comparing ? `Remove ${p.name} from compare` : `Add ${p.name} to compare`} className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-xs font-semibold ring-1 ring-inset', comparing ? 'bg-teal-50 text-teal-800 ring-teal-300' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
        <GitCompareArrows className="h-3.5 w-3.5" />{!compact && (comparing ? 'Comparing' : 'Compare')}
      </button>
    </div>
  );
}

export function ProjectCard({ s, p, layout = 'grid' }: { s: DbState; p: Project; layout?: 'grid' | 'list' }) {
  const dev = s.developers.find((d) => d.id === p.developerId);
  const sm = summary(p);
  return (
    <article className={cx('group rounded-xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:ring-teal-300 transition flex', layout === 'grid' ? 'flex-col' : 'flex-col sm:flex-row')}>
      <Link to={`/projects/${p.id}`} className={cx('block relative', layout === 'grid' ? 'aspect-[16/10]' : 'aspect-[16/10] sm:aspect-auto sm:w-72 shrink-0')} aria-label={`View ${p.name}`}>
        <ProjectVisual project={p} className="h-full w-full" />
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
          <Badge tone="navy" className="bg-white/95">{CONSTRUCTION_LABEL[p.constructionStatus]}</Badge>
          {p.propertyType === 'villa' && <Badge tone="purple" className="bg-white/95">Villa</Badge>}
        </div>
      </Link>
      <div className="p-4 flex flex-col flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-navy-900 truncate"><Link to={`/projects/${p.id}`} className="hover:text-teal-700">{p.name}</Link></h3>
            <p className="text-xs text-slate-500 truncate">by {dev?.shortName}</p>
          </div>
          <SaveCompareButtons s={s} p={p} compact />
        </div>
        <p className="mt-2 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400" />{p.locality}, {p.city}</p>
        <p className="mt-2 text-lg font-bold text-navy-900">{sm.priceLabel}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="font-medium text-slate-800">{sm.bhkLabel}</span>
          <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />{sm.carpetLabel} carpet</span>
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />Possession {formatPossession(p.possession)}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
          <RegistrationBadge p={p} />
          <Link to={`/projects/${p.id}`} className="text-sm font-semibold text-teal-700 hover:underline shrink-0">View details</Link>
        </div>
      </div>
    </article>
  );
}
