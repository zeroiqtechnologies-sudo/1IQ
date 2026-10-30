import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone, MessageCircle, Mail, CalendarPlus, BellPlus, StickyNote, Flag, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAct, useDocumentTitle, useNow } from '../../state/hooks';
import { useCp } from './CpRoutes';
import { readPurchasedContact, logContactAccess } from '../../domain/views';
import { CRM_LABEL, CRM_STAGES, DISPUTE_REASON_LABEL, addNote, addReminder, completeReminder, logOutreachPreview, raiseDispute, scheduleVisit, setStage, setVisitState } from '../../domain/crm';
import { CONTACT_PREF_LABEL, CONTACT_TIME_LABEL, PURPOSE_LABEL, TIMELINE_LABEL, bhkLabel, formatDateTime, formatINR, formatPriceRange } from '../../domain/format';
import { Badge, Button, Card, CardHeader, DataTable, DemoTag, Dialog, EmptyState, Field, Input, KeyValue, LinkButton, PageHeader, Select, StatusBadge, Textarea } from '../../ui/kit';
import { attempt } from '../../services/local';
import type { CrmStage, DisputeReason } from '../../domain/types';

function toLocalInput(t: number) {
  // datetime-local in IST
  const d = new Date(t + 5.5 * 3600_000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? Date.parse(`${v}:00+05:30`) : 0;
}

export function Leads() {
  useDocumentTitle('My leads');
  const { s, cp } = useCp();
  const nav = useNavigate();
  const [stage, setStageF] = useState('');
  const rows = s.assignments.filter((a) => a.cpId === cp.id && (!stage || a.stage === stage)).sort((a, b) => b.at - a.at);
  return (
    <>
      <PageHeader title="My leads" crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'My leads' }]} subtitle="Leads you won. You are the only partner with these contact details." />
      <Card>
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/cp/leads/${r.id}`)}
          toolbar={<Select aria-label="Stage" className="sm:w-auto" value={stage} onChange={(e) => setStageF(e.target.value)}><option value="">All stages</option>{CRM_STAGES.map((c) => <option key={c} value={c}>{CRM_LABEL[c]}</option>)}</Select>}
          search={(r) => { const e = s.enquiries.find((x) => x.id === r.enquiryId)!; const c = s.customers.find((x) => x.id === e.customerId); return `${c?.name} ${s.projects.find((p) => p.id === e.projectId)?.name ?? ''} ${r.stage}`; }}
          empty={<EmptyState title="No purchased leads yet" body="Win an auction to see the lead here." action={<LinkButton to="/cp/auctions" size="sm">Browse auctions</LinkButton>} />}
          columns={[
            { key: 'cust', header: 'Customer', cell: (r) => { const e = s.enquiries.find((x) => x.id === r.enquiryId)!; return <span className="font-medium">{s.customers.find((c) => c.id === e.customerId)?.name}</span>; } },
            { key: 'proj', header: 'Project', cell: (r) => { const l = s.leads.find((x) => x.id === r.leadId)!; return l.matches.map((m) => s.projects.find((p) => p.id === m.projectId)?.name).join(', '); } },
            { key: 'stage', header: 'Stage', cell: (r) => <StatusBadge status={r.stage} label={CRM_LABEL[r.stage]} /> },
            { key: 'next', header: 'Next follow-up', cell: (r) => { const n = s.activities.filter((a) => a.assignmentId === r.id && a.kind === 'reminder' && !a.done).sort((a, b) => a.dueAt! - b.dueAt!)[0]; return n ? <span className="text-xs">{formatDateTime(n.dueAt!)}</span> : <span className="text-slate-400">—</span>; } },
            { key: 'won', header: 'Purchased', cell: (r) => <span className="text-xs">{formatDateTime(r.at)}</span>, mobileHidden: true },
          ]} />
      </Card>
    </>
  );
}

export function LeadDetail() {
  const { id } = useParams();
  const { s, cp, user } = useCp();
  const now = useNow(30_000);
  const act = useAct();
  const [dlg, setDlg] = useState<null | 'call' | 'message' | 'visit' | 'reminder' | 'dispute' | 'lost'>(null);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [visitProject, setVisitProject] = useState('');
  const [reason, setReason] = useState<DisputeReason>('invalid_contact');
  const [note, setNote] = useState('');
  useDocumentTitle('Lead');
  const asg = s.assignments.find((a) => a.id === id);
  const mine = asg?.cpId === cp.id;
  // Sensitive access is logged once per visit.
  useEffect(() => { if (mine && id) attempt(user.id, (d, ctx) => logContactAccess(d, ctx, cp.id, id)); }, [mine, id, cp.id, user.id]);
  if (!asg || !mine) return <EmptyState title="Lead not available" body="This lead is assigned to another partner, or doesn’t exist. Contact details are only shown to the winning partner." action={<LinkButton to="/cp/leads">My leads</LinkButton>} />;
  const contact = readPurchasedContact(s, cp.id, asg.id);
  const e = s.enquiries.find((x) => x.id === asg.enquiryId)!;
  const lead = s.leads.find((l) => l.id === asg.leadId)!;
  const q = s.qualifications.find((x) => x.id === lead.qualificationId)!;
  const pur = s.purchases.find((p) => p.id === asg.purchaseId)!;
  const disputes = s.disputes.filter((d) => d.purchaseId === pur.id);
  const acts = s.activities.filter((a) => a.assignmentId === asg.id).sort((a, b) => b.at - a.at);
  const reminders = acts.filter((a) => a.kind === 'reminder');
  const visits = s.visits.filter((v) => v.assignmentId === asg.id).sort((a, b) => b.at - a.at);
  const projects = lead.matches.map((m) => s.projects.find((p) => p.id === m.projectId)!).filter(Boolean);
  const blocked = contact.sharingStopped;
  const open = (k: NonNullable<typeof dlg>) => { setText(''); setWhen(toLocalInput(now + 24 * 3600_000)); setVisitProject(projects[0]?.id ?? ''); setDlg(k); };
  const close = () => setDlg(null);
  const ok = (v: unknown) => { if (v !== undefined) close(); };

  return (
    <>
      <PageHeader title={contact.name} crumbs={[{ label: 'Partner', to: '/cp' }, { label: 'My leads', to: '/cp/leads' }, { label: contact.name }]} subtitle={`Lead ${lead.id.toUpperCase()} · purchased ${formatDateTime(asg.at)}`}
        actions={<Select aria-label="CRM stage" className="sm:w-auto" value={asg.stage} onChange={(ev) => { const st = ev.target.value as CrmStage; if (st === 'lost') { setNote(''); setDlg('lost'); } else act((d, ctx) => setStage(d, ctx, cp.id, asg.id, st), { success: `Stage: ${CRM_LABEL[st]}` }); }}>{CRM_STAGES.map((c) => <option key={c} value={c}>Stage: {CRM_LABEL[c]}</option>)}</Select>} />
      {blocked && <div className="mb-5 flex gap-3 rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" /><p><strong>Customer asked to stop contact.</strong> Do not call or message. Support is handling the request. Outreach actions are disabled.</p></div>}
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Customer contact" subtitle="Exclusive to you. Access is recorded in the audit trail." action={<Badge tone="green">Unlocked</Badge>} />
            <div className="p-4 sm:p-5 space-y-4">
              <KeyValue items={[['Name', contact.name], ['Phone', contact.phone], ['Email', contact.email ?? '—'], ['Prefers', `${CONTACT_PREF_LABEL[e.contactPreference]} · ${CONTACT_TIME_LABEL[e.contactTime]}`], ['Consent', `Share with one partner · ${e.consent.shareTextVersion} · ${formatDateTime(e.consent.shareGivenAt!)}`], ['Marketing consent', e.consent.marketing ? 'Yes' : 'No']]} />
              {e.message && <p className="text-sm rounded-lg bg-slate-50 p-3"><span className="text-slate-500">Customer note: </span>{e.message}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={blocked} onClick={() => open('call')}><Phone className="h-4 w-4" />Call (preview)</Button>
                <Button size="sm" variant="secondary" disabled={blocked} onClick={() => open('message')}>{e.contactPreference === 'email' ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}Message (preview)</Button>
                <Button size="sm" variant="secondary" disabled={blocked} onClick={() => open('visit')}><CalendarPlus className="h-4 w-4" />Schedule site visit</Button>
                <Button size="sm" variant="secondary" onClick={() => open('reminder')}><BellPlus className="h-4 w-4" />Add follow-up</Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Add a note" />
            <form className="p-4 sm:p-5 flex flex-col sm:flex-row gap-2" onSubmit={(ev) => { ev.preventDefault(); if (act((d, ctx) => addNote(d, ctx, cp.id, asg.id, note), { success: 'Note added' }) !== undefined) setNote(''); }}>
              <Input aria-label="Note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Wants a higher floor, east facing" />
              <Button type="submit" variant="secondary"><StickyNote className="h-4 w-4" />Save note</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Activity history" />
            <ul className="divide-y divide-slate-100 text-sm">
              {acts.filter((a) => a.kind !== 'reminder').map((a) => (
                <li key={a.id} className="px-4 sm:px-5 py-3"><p>{a.text}</p><p className="text-[11px] text-slate-500 mt-0.5">{a.kind.replace('_', ' ')} · {formatDateTime(a.at)}</p></li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Requirement</p>
            <p>{bhkLabel(e.bhk)} · {formatPriceRange(e.budgetMin, e.budgetMax)}</p>
            <p className="text-slate-600">{TIMELINE_LABEL[e.timeline]} · {PURPOSE_LABEL[e.purpose]}</p>
            <p className="text-slate-600">Visit availability: {e.visitAvailability ?? '—'}</p>
            <p className="font-semibold text-navy-900 pt-2">Projects</p>
            <ul>{projects.map((p) => <li key={p.id}>{p.name} <span className="text-slate-500">· {p.locality}</span></li>)}</ul>
            <p className="font-semibold text-navy-900 pt-2">Qualification</p>
            <ul className="list-disc pl-5 text-slate-600">{q.evidence.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="text-[11px] text-slate-500">Qualified {formatDateTime(q.at)} · budget customer-stated</p>
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Follow-ups</p>
            {!reminders.length && <p className="text-slate-500">None yet.</p>}
            <ul className="space-y-2">{reminders.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2">
                <span className={r.done ? 'line-through text-slate-400' : ''}>{r.text}<span className={`block text-[11px] ${!r.done && r.dueAt! < now ? 'text-red-600' : 'text-slate-500'}`}>{formatDateTime(r.dueAt!)}</span></span>
                {!r.done && <Button size="sm" variant="ghost" onClick={() => act((d, ctx) => completeReminder(d, ctx, cp.id, r.id))} aria-label="Mark done"><CheckCircle2 className="h-4 w-4" /></Button>}
              </li>
            ))}</ul>
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Site visits</p>
            {!visits.length && <p className="text-slate-500">No visits yet.</p>}
            <ul className="space-y-2">{visits.map((v) => (
              <li key={v.id}>
                <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={v.state} /><span>{v.requestedBy === 'customer' ? `Customer asked: ${v.note}` : formatDateTime(v.at)}</span></div>
                <p className="text-xs text-slate-500">{s.projects.find((p) => p.id === v.projectId)?.name}</p>
                {v.state === 'scheduled' && <div className="mt-1 flex gap-1"><Button size="sm" variant="secondary" onClick={() => act((d, ctx) => setVisitState(d, ctx, cp.id, v.id, 'completed'), { success: 'Visit completed' })}>Completed</Button><Button size="sm" variant="ghost" onClick={() => act((d, ctx) => setVisitState(d, ctx, cp.id, v.id, 'no_show'))}>No-show</Button></div>}
                {v.state === 'requested' && <Button size="sm" variant="secondary" className="mt-1" onClick={() => open('visit')}>Schedule it</Button>}
              </li>
            ))}</ul>
          </Card>
          <Card className="p-4 text-sm space-y-2">
            <p className="font-semibold text-navy-900">Purchase</p>
            <p>{pur.receiptNo} · {formatINR(pur.amount)}</p>
            {disputes.map((d) => (
              <div key={d.id} className="rounded-lg bg-slate-50 p-2 text-xs space-y-1">
                <p><StatusBadge status={d.status} label={`Dispute ${d.status}`} /> {DISPUTE_REASON_LABEL[d.reason]}</p>
                {d.decisionNote && <p className="text-slate-600">Admin: {d.decisionNote}</p>}
                {d.refundLedgerId && <p className="text-teal-700">Refund credited ({d.refundLedgerId})</p>}
              </div>
            ))}
            {!disputes.some((d) => d.status !== 'rejected') && <Button size="sm" variant="secondary" onClick={() => { setText(''); setReason('invalid_contact'); setDlg('dispute'); }}><Flag className="h-4 w-4" />Report invalid lead</Button>}
            <p className="text-[11px] text-slate-500">Refunds need admin approval. Not converting a lead is not, by itself, a refund reason.</p>
          </Card>
        </aside>
      </div>

      <Dialog open={dlg === 'call' || dlg === 'message'} onClose={close} title={dlg === 'call' ? 'Call customer (preview)' : 'Message customer (preview)'} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => ok(act((d, ctx) => logOutreachPreview(d, ctx, cp.id, asg.id, dlg === 'call' ? 'call_preview' : 'message_preview', text || (dlg === 'call' ? 'Call attempted' : 'Intro message')), { success: 'Logged (nothing was sent)' }))}>Log {dlg === 'call' ? 'call' : 'message'}</Button></>}>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-2 text-amber-900"><DemoTag /> No real call, SMS, WhatsApp or email is made. In production this would open your dialer or an approved messaging provider.</p>
          <p>{dlg === 'call' ? `Would dial ${contact.phone}` : `Would send via ${CONTACT_PREF_LABEL[e.contactPreference]} to ${e.contactPreference === 'email' ? contact.email ?? contact.phone : contact.phone}`}</p>
          <Field label={dlg === 'call' ? 'Call outcome' : 'Message'} htmlFor="o-text"><Textarea id="o-text" rows={3} value={text} onChange={(ev) => setText(ev.target.value)} placeholder={dlg === 'call' ? 'e.g. Spoke for 5 min, keen on 3 BHK' : `Hi ${contact.name.split(' ')[0]}, this is ${cp.contactName} from ${cp.displayName}…`} /></Field>
        </div>
      </Dialog>
      <Dialog open={dlg === 'visit'} onClose={close} title="Schedule a site visit" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => ok(act((d, ctx) => scheduleVisit(d, ctx, cp.id, asg.id, visitProject, fromLocalInput(when), text), { success: 'Visit scheduled (demo)' }))}>Schedule</Button></>}>
        <div className="space-y-3">
          <Field label="Project" required htmlFor="v-p"><Select id="v-p" value={visitProject} onChange={(ev) => setVisitProject(ev.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Date & time (IST)" required htmlFor="v-t"><Input id="v-t" type="datetime-local" value={when} onChange={(ev) => setWhen(ev.target.value)} /></Field>
          <Field label="Note" htmlFor="v-n"><Input id="v-n" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Meeting point, documents to bring…" /></Field>
        </div>
      </Dialog>
      <Dialog open={dlg === 'reminder'} onClose={close} title="Add follow-up reminder" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => ok(act((d, ctx) => addReminder(d, ctx, cp.id, asg.id, text, fromLocalInput(when)), { success: 'Reminder added' }))}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="What to do" required htmlFor="r-t"><Input id="r-t" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Share floor plans" /></Field>
          <Field label="Due (IST)" required htmlFor="r-d"><Input id="r-d" type="datetime-local" value={when} onChange={(ev) => setWhen(ev.target.value)} /></Field>
        </div>
      </Dialog>
      <Dialog open={dlg === 'lost'} onClose={close} title="Mark lead as lost" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" onClick={() => ok(act((d, ctx) => setStage(d, ctx, cp.id, asg.id, 'lost', note), { success: 'Marked lost' }))}>Mark lost</Button></>}>
        <Field label="Lost reason" required htmlFor="l-r"><Select id="l-r" value={note} onChange={(ev) => setNote(ev.target.value)}><option value="">Choose…</option>{['Bought elsewhere', 'Budget mismatch', 'Postponed purchase', 'Not responding', 'Other'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
      </Dialog>
      <Dialog open={dlg === 'dispute'} onClose={close} title="Report an invalid lead" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => ok(act((d, ctx) => raiseDispute(d, ctx, cp.id, asg.id, reason, text), { success: 'Dispute submitted for admin review' }))}>Submit</Button></>}>
        <div className="space-y-3">
          <Field label="Reason" required htmlFor="d-r"><Select id="d-r" value={reason} onChange={(ev) => setReason(ev.target.value as DisputeReason)}>{Object.entries(DISPUTE_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Evidence" required htmlFor="d-e" hint="Call attempts, dates, what you observed."><Textarea id="d-e" rows={4} value={text} onChange={(ev) => setText(ev.target.value)} /></Field>
          <p className="text-xs text-slate-500">If approved, the purchase amount is credited to your balance once as a separate refund entry. The original purchase stays on record.</p>
        </div>
      </Dialog>
    </>
  );
}
