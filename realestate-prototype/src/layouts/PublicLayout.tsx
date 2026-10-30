import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X, Heart, GitCompareArrows, Briefcase } from 'lucide-react';
import { DemoBar, Logo, NotificationBell, ROLE_HOME } from './shared';
import { useDb, useSession } from '../state/hooks';
import { cx } from '../ui/kit';

export default function PublicLayout() {
  const s = useDb();
  const user = useSession();
  const [open, setOpen] = useState(false);
  const links = [
    { to: '/projects', label: 'Explore projects' },
    { to: '/shortlist', label: `Shortlist${s.shortlist.length ? ` (${s.shortlist.length})` : ''}`, icon: Heart },
    { to: '/compare', label: `Compare${s.compare.length ? ` (${s.compare.length})` : ''}`, icon: GitCompareArrows },
    { to: '/my-enquiries', label: 'My enquiries' },
  ];
  const business = user && user.role !== 'customer' ? { to: ROLE_HOME[user.role], label: 'Open my workspace' } : { to: '/partners', label: 'For partners & developers' };
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <DemoBar />
      <header className="bg-navy-900 text-white sticky top-0 z-40 shadow">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
          <Link to="/" aria-label="SetuHomes home"><Logo light /></Link>
          <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('px-3 py-2 rounded-md text-sm font-medium', isActive ? 'bg-white/10 text-white' : 'text-navy-100 hover:text-white hover:bg-white/5')}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell dark />
            <Link to={business.to} className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-white/30 hover:bg-white/10"><Briefcase className="h-4 w-4" aria-hidden />{business.label}</Link>
            <button className="lg:hidden p-2 rounded-md hover:bg-white/10" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
          </div>
        </div>
        {open && (
          <nav className="lg:hidden border-t border-white/10 px-4 py-2 space-y-1" aria-label="Mobile">
            {[...links, business].map((l) => (
              <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)} className={({ isActive }) => cx('block px-3 py-2.5 rounded-md text-base font-medium', isActive ? 'bg-white/10' : 'text-navy-100 hover:bg-white/5')}>{l.label}</NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-navy-950 text-navy-100 text-sm mt-12">
        <div className="mx-auto max-w-7xl px-4 py-8 grid gap-6 sm:grid-cols-3">
          <div>
            <Logo light />
            <p className="mt-3 text-navy-100/80 text-xs leading-relaxed">A prototype marketplace. All developers, projects, partners, registrations and contacts are fictional. Nothing on this site is an offer or advice.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Customers</p>
            <ul className="mt-2 space-y-1"><li><Link className="hover:text-white" to="/projects">Explore projects</Link></li><li><Link className="hover:text-white" to="/enquire">General enquiry</Link></li><li><Link className="hover:text-white" to="/my-enquiries">Track an enquiry</Link></li></ul>
          </div>
          <div>
            <p className="font-semibold text-white">Business</p>
            <ul className="mt-2 space-y-1"><li><Link className="hover:text-white" to="/cp">Channel partner portal</Link></li><li><Link className="hover:text-white" to="/developer">Developer portal</Link></li><li><Link className="hover:text-white" to="/admin">Admin console</Link></li></ul>
          </div>
        </div>
        <p className="text-center text-[11px] text-navy-100/60 pb-6">Prototype · Demo mode · Times shown in IST (Asia/Kolkata)</p>
      </footer>
    </div>
  );
}
