import { useState } from 'react';
import { Printer, RefreshCcw, CreditCard } from 'lucide-react';
import { useDocumentTitle } from '../../state/hooks';
import { useCp } from './CpRoutes';
import { DEMO_TOPUP_AMOUNTS, walletBalance } from '../../domain/wallet';
import { formatDateTime, formatINR } from '../../domain/format';
import { Badge, Button, Card, CardHeader, DataTable, DemoTag, Dialog, PageHeader, Stat, StatusBadge, cx } from '../../ui/kit';
import { payments } from '../../services/local';
import { useToast } from '../../ui/toast';
import type { LedgerEntry, Purchase } from '../../domain/types';

const TYPE_LABEL: Record<LedgerEntry['type'], string> = { top_up: 'Top-up', hold: 'Hold', hold_release: 'Hold release', lead_purchase: 'Lead purchase', refund: 'Refund', admin_adjustment: 'Admin adjustment' };

export function WalletPage() {
  useDocumentTitle('Wallet');
  const { s, cp } = useCp();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [simulate, setSimulate] = useState<'succeeded' | 'failed'>('succeeded');
  const [receipt, setReceipt] = useState<Purchase | null>(null);
  const bal = walletBalance(s, cp.id);
  const ledger = s.ledger.filter((l) => l.cpId === cp.id).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  const purchases = s.purchases.filter((p) => p.cpId === cp.id).sort((a, b) => b.at - a.at);
  const lastPayment = [...s.payments].filter((p) => p.cpId === cp.id && p.outcome !== 'pending').sort((a, b) => b.createdAt - a.createdAt)[0];

  const topUp = async (amount: number) => {
    setBusy(amount);
    try {
      const p = await payments.startTopUp(cp.id, amount, simulate);
      toast.push(p.outcome === 'succeeded' ? { tone: 'success', title: `${formatINR(amount)} added (demo)` } : { tone: 'danger', title: 'Demo top-up failed', body: 'No funds were added. Try again with “Simulate success”.' });
    } catch (e) {
      toast.push({ tone: 'danger', title: 'Top-up not started', body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Prepaid lead balance" crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'Wallet' }]} subtitle="Used only to buy leads won at auction. No withdrawals, transfers or payouts in this prototype." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Total balance" value={formatINR(bal.total)} hint="Top-ups + refunds − purchases" />
        <Stat label="Held in active bids" value={formatINR(bal.held)} tone="amber" hint="Reserved while you lead an auction" />
        <Stat label="Available to bid" value={formatINR(bal.available)} tone="teal" hint="Total − held. Shared across all auctions." />
      </div>

      <Card className="mt-5">
        <CardHeader title={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Add demo funds <DemoTag /></span>} subtitle="Simulated gateway. No card, UPI or bank details are collected and no money moves." />
        <div className="p-4 sm:p-5 space-y-4">
          <fieldset className="flex flex-wrap gap-2 text-sm" aria-label="Simulated outcome">
            {(['succeeded', 'failed'] as const).map((o) => (
              <label key={o} className={cx('inline-flex items-center gap-2 rounded-lg px-3 h-9 ring-1 ring-inset cursor-pointer', simulate === o ? (o === 'succeeded' ? 'bg-teal-50 ring-teal-300' : 'bg-red-50 ring-red-300') : 'ring-slate-300')}>
                <input type="radio" name="sim" className="text-teal-600" checked={simulate === o} onChange={() => setSimulate(o)} />Simulate {o === 'succeeded' ? 'success' : 'failure'}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {DEMO_TOPUP_AMOUNTS.map((a) => <Button key={a} variant={simulate === 'failed' ? 'secondary' : 'primary'} loading={busy === a} disabled={busy !== null} onClick={() => topUp(a)}>Add {formatINR(a)}</Button>)}
          </div>
          {busy !== null && <p className="text-sm text-slate-500" role="status">Waiting for simulated gateway confirmation…</p>}
          {lastPayment && (
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>Last payment {lastPayment.id} · {lastPayment.outcome} · callbacks received: {lastPayment.callbacksReceived}</span>
              <Button size="sm" variant="ghost" onClick={() => { const r = payments.replayCallback(lastPayment.id); toast.push({ tone: 'info', title: r.duplicate ? 'Duplicate callback ignored' : 'Callback processed', body: 'Repeated gateway callbacks never credit twice.' }); }}><RefreshCcw className="h-3.5 w-3.5" />Replay callback (demo)</Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Transaction ledger" subtitle="Append-only. Holds change availability, not the total balance." />
        <DataTable rows={ledger} rowKey={(r) => r.id} search={(r) => `${r.id} ${TYPE_LABEL[r.type]} ${r.memo} ${r.ref}`} pageSize={12}
          columns={[
            { key: 'at', header: 'Time', cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.at)}</span> },
            { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'top_up' || r.type === 'refund' ? 'green' : r.type === 'lead_purchase' ? 'navy' : r.type === 'hold' ? 'amber' : 'gray'}>{TYPE_LABEL[r.type]}</Badge> },
            { key: 'memo', header: 'Details', cell: (r) => <span className="text-slate-600">{r.memo}</span>, mobileHidden: true },
            { key: 'amount', header: 'Balance effect', className: 'text-right', cell: (r) => <span className={cx('tabular-nums font-medium', r.amount > 0 ? 'text-teal-700' : r.amount < 0 ? 'text-slate-900' : 'text-slate-400')}>{r.amount === 0 ? '—' : `${r.amount > 0 ? '+' : ''}${formatINR(r.amount)}`}</span> },
            { key: 'hold', header: 'Hold change', className: 'text-right', cell: (r) => <span className="tabular-nums text-xs text-amber-700">{r.holdDelta ? `${r.holdDelta > 0 ? '+' : ''}${formatINR(r.holdDelta)}` : '—'}</span> },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'ref', header: 'Reference', cell: (r) => <code className="text-[11px] text-slate-500">{r.id} · {r.ref}</code>, mobileHidden: true },
          ]} />
      </Card>

      <Card className="mt-5">
        <CardHeader title="Lead purchase receipts" />
        <DataTable rows={purchases} rowKey={(r) => r.id} empty={<p className="p-6 text-sm text-slate-500 text-center">No purchases yet.</p>}
          columns={[
            { key: 'no', header: 'Receipt', cell: (r) => <span className="font-medium">{r.receiptNo}</span> },
            { key: 'at', header: 'Date', cell: (r) => formatDateTime(r.at) },
            { key: 'amt', header: 'Amount', cell: (r) => formatINR(r.amount) },
            { key: 'refund', header: 'Refund', cell: (r) => { const d = s.disputes.find((x) => x.purchaseId === r.id); return d ? <StatusBadge status={d.status} label={`Dispute ${d.status}`} /> : <span className="text-slate-400">—</span>; } },
            { key: 'v', header: '', cell: (r) => <Button size="sm" variant="secondary" onClick={() => setReceipt(r)}>View</Button> },
          ]} />
      </Card>
      {receipt && (
        <Dialog open onClose={() => setReceipt(null)} title={`Receipt ${receipt.receiptNo}`} footer={<><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button><Button onClick={() => setReceipt(null)}>Close</Button></>}>
          <div className="text-sm space-y-2">
            <p className="text-xs uppercase tracking-wide font-semibold text-amber-700">Demo receipt · not a tax invoice</p>
            <p><strong>{cp.displayName}</strong><br />{cp.contactName}</p>
            <table className="w-full text-sm"><tbody>
              <tr><td className="py-1 text-slate-500">Purchase</td><td className="text-right">{receipt.id}</td></tr>
              <tr><td className="py-1 text-slate-500">Lead</td><td className="text-right">{receipt.leadId.toUpperCase()}</td></tr>
              <tr><td className="py-1 text-slate-500">Auction</td><td className="text-right">{receipt.auctionId}</td></tr>
              <tr><td className="py-1 text-slate-500">Date</td><td className="text-right">{formatDateTime(receipt.at)}</td></tr>
              <tr><td className="py-1 text-slate-500">Ledger entry</td><td className="text-right">{receipt.ledgerEntryId}</td></tr>
              <tr className="border-t"><td className="py-2 font-semibold">Lead access fee</td><td className="text-right font-semibold">{formatINR(receipt.amount, { paise: true })}</td></tr>
            </tbody></table>
            <p className="text-xs text-slate-500">Paid from prepaid lead balance. Tax treatment requires review before launch. This fee is separate from any developer commission.</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
