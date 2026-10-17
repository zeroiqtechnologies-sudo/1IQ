import { Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Gavel, Users, Building2, Wallet, UserCog, AlertTriangle } from 'lucide-react';
import PortalLayout from '../../layouts/PortalLayout';
import { useDb, useDocumentTitle, useNow, useSession } from '../../state/hooks';
import { cpDashboard } from '../../domain/views';
import { CRM_LABEL } from '../../domain/crm';
import { formatDateTime, formatINR, formatPriceRange, bhkLabel } from '../../domain/format';
import { Card, CardHeader, Countdown, EmptyState, LinkButton, PageHeader, Stat, StatusBadge } from '../../ui/kit';
import { NotFound } from '../customer/Collections';
import { AuctionDetail, Auctions } from './Auctions';
import { WalletPage } from './Wallet';
import { LeadDetail, Leads } from './Leads';
import { CpProjectDetail, CpProjects, CpProfilePage } from './Projects';
import { Link } from 'react-router-dom';

export function useCp() {
  const s = useDb();
  const user = useSession();
  const cp = s.cps.find((c) => c.id === user?.orgId)!;
  return { s, user: user!, cp };
}

export function VerificationBanner() {
  const { cp } = useCp();
  if (cp.reviewStatus === 'approved') return null;
  const msg = { pending: 'Your partner profile is under review. You can follow projects, but you can’t bid until an admin approves you.', rejected: `Your profile was not approved${cp.reviewNote ? `: ${cp.reviewNote}` : ''}. Update it and resubmit.`, suspended: `Your account is suspended${cp.reviewNote ? `: ${cp.reviewNote}` : ''}. You can’t bid or register new interest.` }[cp.reviewStatus];
  return <div className="mb-5 flex gap-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Profile {cp.reviewStatus}</p><p>{msg} <Link to="/cp/profile" className="underline">View profile</Link></p></div></div>;
}

function Dashboard() {
  useDocumentTitle('Partner dashboard');
  const { s, cp } = useCp();
  const now = useNow();
  const d = cpDashboard(s, cp.id, now);
  const max = Math.max(1, d.funnel.purchased);
  return (
    <>
      <PageHeader title={`Welcome, ${cp.contactName.split(' ')[0]}`} subtitle={cp.displayName} actions={<><LinkButton to="/cp/auctions" variant="amber">View live auctions</LinkButton><LinkButton to="/cp/wallet" variant="secondary">Add demo funds</LinkButton></>} />
      <VerificationBanner />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Available to bid" value={formatINR(d.bal.available)} tone="teal" hint={`Total ${formatINR(d.bal.total)}`} to="/cp/wallet" />
        <Stat label="Held in bids" value={formatINR(d.bal.held)} tone="amber" hint="Released if you’re outbid" to="/cp/wallet" />
        <Stat label="Active bids" value={`${d.leading} leading`} hint={`${d.outbid} outbid · ${d.active.length} live auctions`} to="/cp/auctions" />
        <Stat label="Purchased leads" value={d.won} hint={`${d.due.length} follow-up(s) due in 24 h`} to="/cp/leads" />
      </div>
      <div className="mt-6 grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Live auctions for your projects" action={<Link to="/cp/auctions" className="text-sm font-medium text-teal-700">All</Link>} />
          {!d.active.length ? <EmptyState title="No live auctions" body="Mark yourself Interested in projects to see matching qualified leads here." action={<LinkButton to="/cp/projects" size="sm" variant="secondary">Browse projects</LinkButton>} /> : (
            <ul className="divide-y divide-slate-100">
              {d.active.slice(0, 5).map((a) => (
                <li key={a.auctionId}>
                  <Link to={`/cp/auctions/${a.auctionId}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.projects.map((p) => p.name).join(' + ')}</p>
                      <p className="text-xs text-slate-500">{bhkLabel(a.requirement.bhk)} · {formatPriceRange(a.requirement.budgetMin, a.requirement.budgetMax)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Countdown endsAt={a.endsAt} now={now} className="text-sm" />
                      <div className="mt-0.5">{a.viewer.status !== 'none' ? <StatusBadge status={a.viewer.status} /> : <span className="text-xs text-slate-500">{a.currentBid ? formatINR(a.currentBid) : 'No bids'}</span>}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Follow-ups due" subtitle="Next 24 hours and overdue" />
          {!d.due.length ? <EmptyState title="Nothing due" body="Add reminders on your purchased leads." /> : (
            <ul className="divide-y divide-slate-100">
              {d.due.map((r) => {
                const asg = s.assignments.find((a) => a.id === r.assignmentId)!;
                const name = s.customers.find((c) => c.id === s.enquiries.find((e) => e.id === asg.enquiryId)?.customerId)?.name;
                return (
                  <li key={r.id}><Link to={`/cp/leads/${asg.id}`} className="block px-4 sm:px-5 py-3 hover:bg-slate-50 text-sm"><p className="font-medium">{r.text}</p><p className={r.dueAt! < now ? 'text-red-600 text-xs' : 'text-slate-500 text-xs'}>{name} · due {formatDateTime(r.dueAt!)}</p></Link></li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Your lead funnel" subtitle="From your CRM stages (demo records)" />
          <div className="p-4 sm:p-5 space-y-3">
            {([['Purchased', d.funnel.purchased], ['Contacted or beyond', d.funnel.contacted], ['Visited', d.funnel.visited], ['Booked (CP-reported)', d.funnel.booked]] as const).map(([l, v]) => (
              <div key={l} className="text-sm">
                <div className="flex justify-between"><span>{l}</span><span className="font-semibold tabular-nums">{v}</span></div>
                <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-600" style={{ width: `${(v / max) * 100}%` }} /></div>
              </div>
            ))}
            <p className="text-xs text-slate-500">Stages: {Object.values(CRM_LABEL).join(' → ')}</p>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function CpRoutes() {
  const s = useDb();
  const user = useSession();
  const now = useNow(5000);
  const live = user?.role === 'cp' ? s.auctions.filter((a) => a.state === 'live' && a.endsAt > now && s.leads.find((l) => l.id === a.leadId)?.matches.some((m) => s.interests.some((i) => i.cpId === user.orgId && i.projectId === m.projectId && i.state === 'interested'))).length : 0;
  const nav = [
    { to: '/cp', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/cp/auctions', label: 'Lead auctions', icon: Gavel, badge: live },
    { to: '/cp/leads', label: 'My leads', icon: Users },
    { to: '/cp/projects', label: 'Projects', icon: Building2 },
    { to: '/cp/wallet', label: 'Wallet', icon: Wallet },
    { to: '/cp/profile', label: 'Profile', icon: UserCog },
  ];
  return (
    <Routes>
      <Route element={<PortalLayout role="cp" nav={nav} orgName={(st, id) => st.cps.find((c) => c.id === id)?.displayName ?? ''} />}>
        <Route index element={<Dashboard />} />
        <Route path="auctions" element={<Auctions />} />
        <Route path="auctions/:id" element={<AuctionDetail />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="projects" element={<CpProjects />} />
        <Route path="projects/:id" element={<CpProjectDetail />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="profile" element={<CpProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
