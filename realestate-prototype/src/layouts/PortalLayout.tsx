import { Suspense, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ExternalLink } from 'lucide-react';
import { DemoBar, Logo, NotificationBell, ROLE_LABEL, RolePrompt } from './shared';
import { useDb, useSession } from '../state/hooks';
import { cx, Spinner } from '../ui/kit';
import type { Role } from '../domain/types';

export interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean; badge?: number }

export default function PortalLayout({ role, nav, orgName }: { role: Role; nav: NavItem[]; orgName?: (s: ReturnType<typeof useDb>, orgId?: string) => string }) {
  const user = useSession();
  const s = useDb();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const allowed = user?.role === role;

  const links = (
    <ul className="space-y-0.5">
      {nav.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-white/10 text-white' : 'text-navy-100 hover:bg-white/5 hover:text-white')}>
            <n.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{n.label}</span>
            {!!n.badge && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-navy-950">{n.badge}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <DemoBar />
      {!allowed ? (
        <RolePrompt role={role} />
      ) : (
        <div className="flex flex-1 min-h-0">
          <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-navy-900 text-white">
            <div className="h-16 flex items-center px-5 border-b border-white/10"><Link to="/"><Logo light /></Link></div>
            <div className="px-5 py-4 border-b border-white/10">
              <p className="text-[11px] uppercase tracking-wider text-navy-100/70">{ROLE_LABEL[role]}</p>
              <p className="text-sm font-semibold truncate">{orgName ? orgName(s, user.orgId) : user.name}</p>
            </div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label={`${ROLE_LABEL[role]} navigation`}>{links}</nav>
            <Link to="/" className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-navy-100 hover:bg-white/5"><ExternalLink className="h-3.5 w-3.5" />View customer website</Link>
          </aside>
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-14 lg:h-16 bg-white border-b border-slate-200 flex items-center gap-3 px-4 sticky top-0 z-30">
              <button className="lg:hidden p-2 -ml-2 rounded-md text-slate-700 hover:bg-slate-100" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
              <span className="lg:hidden"><Logo /></span>
              <span className="hidden lg:block text-sm text-slate-500 truncate">{user.name} · {ROLE_LABEL[role]}</span>
              <div className="ml-auto"><NotificationBell /></div>
            </header>
            {open && (
              <div className="lg:hidden bg-navy-900 text-white p-3 shadow-lg" key={loc.pathname}>
                <p className="px-3 pb-2 text-xs text-navy-100/80">{orgName ? orgName(s, user.orgId) : user.name}</p>
                <nav aria-label={`${ROLE_LABEL[role]} navigation`}>{links}</nav>
              </div>
            )}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              <Suspense fallback={<Spinner />}><Outlet /></Suspense>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
