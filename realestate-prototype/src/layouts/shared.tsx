import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, FlaskConical, RotateCcw, UserCircle2, ChevronDown, Clock } from 'lucide-react';
import { auth, resetDemo, tx } from '../services/local';
import { useDb, useNow, useSession } from '../state/hooks';
import { formatTime, timeAgo } from '../domain/format';
import { Badge, Button, cx, useConfirm } from '../ui/kit';
import type { Role, UserAccount } from '../domain/types';

export const ROLE_HOME: Record<Role, string> = { customer: '/my-enquiries', cp: '/cp', developer: '/developer', admin: '/admin' };
export const ROLE_LABEL: Record<Role, string> = { customer: 'Customer', cp: 'Channel partner', developer: 'Developer', admin: 'Admin' };

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden><rect width="32" height="32" rx="7" fill={light ? '#ffffff' : '#142647'} /><path d="M7 24V13l9-6 9 6v11h-6v-7h-6v7z" fill="#14a38b" /></svg>
      <span className={light ? 'text-white' : 'text-navy-900'}>SetuHomes</span>
    </span>
  );
}

function accountLabel(s: ReturnType<typeof useDb>, u: UserAccount) {
  if (u.role === 'cp') return `${u.name} · ${s.cps.find((c) => c.id === u.orgId)?.displayName ?? ''}`;
  if (u.role === 'developer') return `${u.name} · ${s.developers.find((d) => d.id === u.orgId)?.shortName ?? ''}`;
  return u.name;
}

/** Visible demo strip on every page: clock, role switcher, reset. */
export function DemoBar() {
  const s = useDb();
  const user = useSession();
  const now = useNow();
  const nav = useNavigate();
  const { ask, node } = useConfirm();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const groups: Role[] = ['admin', 'developer', 'cp', 'customer'];
  return (
    <div className="bg-amber-100 text-amber-950 text-xs border-b border-amber-300 relative z-50">
      <div className="mx-auto max-w-7xl px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-semibold"><FlaskConical className="h-3.5 w-3.5" aria-hidden />DEMO MODE</span>
        <span className="hidden sm:inline">Simulated data, payments, OTP and messages. Role switching is not secure sign-in.</span>
        <span className="inline-flex items-center gap-1 tabular-nums" title="Demo clock (Asia/Kolkata)"><Clock className="h-3.5 w-3.5" aria-hidden />{formatTime(now)}{s.clockOffsetMs > 0 && <span className="font-semibold">(+{Math.round(s.clockOffsetMs / 60000)} min)</span>}</span>
        <div className="ml-auto flex items-center gap-2" ref={ref}>
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 font-medium ring-1 ring-amber-300 hover:bg-white" aria-haspopup="menu" aria-expanded={open}>
            <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
            <span className="max-w-[10rem] sm:max-w-[16rem] truncate">{user ? `${ROLE_LABEL[user.role]}: ${user.name}` : 'Guest (switch role)'}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button onClick={() => ask({ title: 'Reset demo data?', body: 'This restores the original seed data and clears all demo progress in this browser.', confirmLabel: 'Reset data', tone: 'danger', onConfirm: () => { resetDemo(); nav('/'); } })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-white/60">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset
          </button>
          {open && (
            <div role="menu" className="absolute right-2 sm:right-4 top-full mt-1 w-[min(22rem,calc(100vw-1rem))] max-h-[70vh] overflow-y-auto rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200 p-2">
              <p className="px-2 py-1 text-[11px] text-slate-500">Switch demo persona. All personas share one dataset in this browser.</p>
              <button role="menuitem" className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-slate-100" onClick={() => { auth.signOut(); setOpen(false); nav('/'); }}>Guest visitor (public website)</button>
              {groups.map((g) => {
                const list = auth.demoAccounts().filter((u) => u.role === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="mt-1">
                    <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{ROLE_LABEL[g]}</p>
                    {list.map((u) => (
                      <button key={u.id} role="menuitem" className={cx('w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center justify-between gap-2', user?.id === u.id && 'bg-teal-50')} onClick={() => { auth.signInAs(u.id); setOpen(false); nav(ROLE_HOME[u.role]); }}>
                        <span className="truncate">{accountLabel(s, u)}</span>
                        {u.status !== 'active' && <Badge tone="red">suspended</Badge>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {node}
    </div>
  );
}

export function NotificationBell({ dark }: { dark?: boolean }) {
  const s = useDb();
  const user = useSession();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return null;
  const mine = s.notifications.filter((n) => n.recipientId === user.id).sort((a, b) => b.at - a.at);
  const unread = mine.filter((n) => !n.read).length;
  const markAll = () => {
    tx(user.id, (d) => { for (const n of d.notifications) if (n.recipientId === user.id) n.read = true; });
  };
  const toneDot = { info: 'bg-sky-500', success: 'bg-teal-500', warning: 'bg-amber-500', danger: 'bg-red-500' };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={cx('relative rounded-full p-2', dark ? 'text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-amber-500 text-[10px] font-bold text-navy-950 flex items-center justify-center px-1">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl bg-white shadow-xl ring-1 ring-slate-200 z-50 text-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="font-semibold text-sm">Notifications</p>
            {unread > 0 && <button className="text-xs font-medium text-teal-700 hover:underline" onClick={markAll}>Mark all read</button>}
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {!mine.length && <li className="p-6 text-center text-sm text-slate-500">No notifications yet.</li>}
            {mine.slice(0, 30).map((n) => (
              <li key={n.id}>
                <button className={cx('w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3', !n.read && 'bg-teal-50/40')} onClick={() => {
                  tx(user.id, (d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true; });
                  setOpen(false);
                  if (n.link) nav(n.link);
                }}>
                  <span className={cx('mt-1.5 h-2 w-2 rounded-full shrink-0', n.read ? 'bg-slate-200' : toneDot[n.tone])} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{n.body}</span>
                    <span className="block text-[11px] text-slate-400 mt-1">{timeAgo(n.at, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">In-app only. Demo mode sends no SMS, email or push messages.</p>
        </div>
      )}
    </div>
  );
}

export function RolePrompt({ role, reason }: { role: Role; reason?: string }) {
  const nav = useNavigate();
  const user = useSession();
  const s = useDb();
  const list = auth.demoAccounts().filter((u) => u.role === role);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
        <Logo />
        <h1 className="mt-4 text-lg font-semibold text-navy-900">{ROLE_LABEL[role]} workspace</h1>
        <p className="mt-1 text-sm text-slate-600">{reason ?? (user ? `You're signed in as ${ROLE_LABEL[user.role].toLowerCase()} ${user.name}. This area needs a ${ROLE_LABEL[role].toLowerCase()} account.` : `Pick a demo ${ROLE_LABEL[role].toLowerCase()} account to continue.`)}</p>
        <p className="mt-2 text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-md p-2">Demo sign-in only. In production, the server authenticates users and enforces every permission.</p>
        <ul className="mt-4 space-y-2">
          {list.map((u) => (
            <li key={u.id}>
              <Button variant="secondary" className="w-full justify-between" onClick={() => { auth.signInAs(u.id); nav(location.pathname); }}>
                <span className="truncate">{accountLabel(s, u)}</span>
                {u.status !== 'active' ? <Badge tone="red">suspended</Badge> : <span className="text-teal-700 text-xs">Use this account</span>}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm"><Link to="/" className="text-teal-700 hover:underline">Back to the customer website</Link></p>
      </div>
    </div>
  );
}
