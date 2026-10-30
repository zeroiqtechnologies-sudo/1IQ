import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Inbox, Loader2, Search, X, AlertOctagon } from 'lucide-react';
import { formatDuration, formatINR } from '../domain/format';
import type { Paise } from '../domain/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber' | 'navy';
export function Button({ variant = 'primary', size = 'md', loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 focus-visible:ring-teal-500',
    secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:ring-teal-500',
    ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
    amber: 'bg-amber-500 text-navy-950 hover:bg-amber-400 focus-visible:ring-amber-500',
    navy: 'bg-navy-800 text-white hover:bg-navy-700 focus-visible:ring-navy-600',
  };
  const s = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size];
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap', v[variant], s, className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    amber: 'bg-amber-500 text-navy-950 hover:bg-amber-400',
    navy: 'bg-navy-800 text-white hover:bg-navy-700',
  };
  const s = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size];
  return <Link to={to} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 whitespace-nowrap', v[variant], s, className)}>{children}</Link>;
}

type Tone = 'gray' | 'teal' | 'amber' | 'red' | 'navy' | 'green' | 'blue' | 'purple';
export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t: Record<Tone, string> = {
    gray: 'bg-slate-100 text-slate-700 ring-slate-200',
    teal: 'bg-teal-50 text-teal-800 ring-teal-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    navy: 'bg-navy-50 text-navy-800 ring-navy-100',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    blue: 'bg-sky-50 text-sky-800 ring-sky-200',
    purple: 'bg-violet-50 text-violet-800 ring-violet-200',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', t[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  draft: 'gray', submitted: 'blue', changes_requested: 'amber', approved: 'teal', published: 'green', paused: 'gray', archived: 'gray',
  pending: 'amber', rejected: 'red', suspended: 'red',
  received: 'gray', verification_pending: 'amber', qualification_pending: 'blue', qualified: 'teal', duplicate: 'purple', withdrawn: 'gray', in_auction: 'amber', assigned: 'green', unassigned: 'gray',
  scheduled: 'blue', live: 'amber', settlement_pending: 'blue', expired_no_bids: 'gray', cancelled: 'gray', settlement_failed: 'red',
  leading: 'teal', outbid: 'red', won: 'green', lost: 'gray', none: 'gray',
  requested: 'amber', succeeded: 'green', failed: 'red', active: 'amber', released: 'gray', consumed: 'navy',
  new: 'blue', attempted: 'gray', contacted: 'teal', visit_scheduled: 'purple', visit_completed: 'purple', negotiation: 'amber', booked: 'green',
  open: 'amber', closed: 'gray', completed: 'green', no_show: 'red', reviewed: 'green', not_reviewed: 'gray', mismatch: 'red', flagged: 'purple', cleared: 'teal', confirmed: 'purple',
};
const STATUS_LABEL: Record<string, string> = { expired_no_bids: 'Expired · no bids', in_auction: 'Matching partner', unassigned: 'Awaiting review', not_reviewed: 'Not reviewed', settlement_failed: 'Settlement failed', verification_pending: 'Verify phone', qualification_pending: 'Under review' };
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const l = label ?? STATUS_LABEL[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{l}</Badge>;
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-xl bg-white ring-1 ring-slate-200 shadow-sm', className)}>{children}</As>;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, error, hint, children, required, htmlFor }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-600" aria-hidden>*</span> : <span className="text-slate-400 font-normal text-xs">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = 'block w-full rounded-lg border-0 py-2 px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-teal-600 disabled:bg-slate-50';
export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, invalid && 'ring-red-400', className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <select {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, 'pr-8', invalid && 'ring-red-400', className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, invalid && 'ring-red-400', className)} />;
}

export function Checkbox({ checked, onChange, label, description, id, invalid }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; id?: string; invalid?: boolean }) {
  const gen = useId();
  const cid = id ?? gen;
  return (
    <div className="flex gap-3 items-start">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid || undefined} className={cx('mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600', invalid && 'ring-2 ring-red-400')} />
      <label htmlFor={cid} className="text-sm text-slate-700 leading-snug">
        {label}
        {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
      </label>
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx('h-8 px-3 rounded-full text-sm font-medium ring-1 ring-inset transition', active ? 'bg-teal-600 text-white ring-teal-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
      {children}
    </button>
  );
}

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 0);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-navy-950/50" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'primary' }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger' | 'amber' }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={tone} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
      <div className="text-sm text-slate-600 space-y-2">{body}</div>
    </Dialog>
  );
}

/** Small hook for confirm-dialog state. */
export function useConfirm() {
  const [cfg, setCfg] = useState<null | { title: string; body: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger' | 'amber'; onConfirm: () => void }>(null);
  const node = cfg ? <ConfirmDialog open onClose={() => setCfg(null)} {...cfg} /> : null;
  return { ask: setCfg, node };
}

export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body?: ReactNode; action?: ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="text-center py-10 px-4">
      <Icon className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body, action }: { title?: string; body?: ReactNode; action?: ReactNode }) {
  return <EmptyState icon={AlertOctagon} title={title} body={body} action={action} />;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}</div>;
}

export interface Crumb { label: string; to?: string }
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500 min-w-0">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {c.to ? <Link to={c.to} className="hover:text-teal-700 truncate">{c.label}</Link> : <span className="text-slate-700 truncate" aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, crumbs, actions, subtitle }: { title: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-5 space-y-2">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'navy', to }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'navy' | 'teal' | 'amber' | 'red'; to?: string }) {
  const c = { navy: 'text-navy-900', teal: 'text-teal-700', amber: 'text-amber-700', red: 'text-red-700' }[tone];
  const inner = (
    <Card className={cx('p-4 h-full', to && 'hover:ring-teal-300 transition')}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums', c)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-9')} />
    </div>
  );
}

export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; className?: string; mobileHidden?: boolean }
/** Searchable, paginated table that collapses into cards on small screens. */
export function DataTable<T>({ rows, columns, search, rowKey, empty, pageSize = 10, onRowClick, toolbar }: { rows: T[]; columns: Column<T>[]; search?: (row: T) => string; rowKey: (r: T) => string; empty?: ReactNode; pageSize?: number; onRowClick?: (r: T) => void; toolbar?: ReactNode }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const filtered = search && q.trim() ? rows.filter((r) => search(r).toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const slice = filtered.slice(p * pageSize, p * pageSize + pageSize);
  return (
    <div>
      {(search || toolbar) && (
        <div className="flex flex-wrap gap-2 items-center p-3 border-b border-slate-100">
          {search && <div className="flex-1 min-w-[12rem]"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} /></div>}
          {toolbar}
        </div>
      )}
      {!filtered.length ? (
        empty ?? <EmptyState title={q ? 'No matches' : 'Nothing here yet'} body={q ? 'Try a different search.' : undefined} />
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('px-4 py-2.5', c.className)}>{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slice.map((r) => (
                  <tr key={rowKey(r)} className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                    {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-top', c.className)}>{c.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-slate-100">
            {slice.map((r) => (
              <li key={rowKey(r)} className={cx('p-4 space-y-1.5', onRowClick && 'cursor-pointer active:bg-slate-50')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.filter((c) => !c.mobileHidden).map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-500 shrink-0">{c.header}</span>
                    <span className="text-right min-w-0">{c.cell(r)}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
              <span>Page {p + 1} of {pages} · {filtered.length} rows</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Money({ p, className }: { p: Paise; className?: string }) {
  return <span className={cx('tabular-nums', className)}>{formatINR(p)}</span>;
}

export function Countdown({ endsAt, now, className }: { endsAt: number; now: number; className?: string }) {
  const left = endsAt - now;
  const urgent = left < 2 * 60_000;
  return (
    <span className={cx('tabular-nums font-semibold', left <= 0 ? 'text-slate-500' : urgent ? 'text-red-600' : 'text-amber-700', className)} aria-label={left <= 0 ? 'Closed' : `${formatDuration(left)} remaining`}>
      {left <= 0 ? 'Closed' : formatDuration(left)}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx('px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', value === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DemoTag({ children = 'Demo' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-300">{children}</span>;
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-slate-900 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
