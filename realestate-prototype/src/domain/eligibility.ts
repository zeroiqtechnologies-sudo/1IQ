import type { DbState, Enquiry, ID, Lead, Project, ProjectMatch } from './types';
import { byId } from './util';
import { formatPriceRange } from './format';

export interface Eligibility {
  eligible: boolean;
  reason?: string;
  viaProjectIds: ID[];
}

/**
 * A CP may bid only if: profile approved, account active, and it has an active
 * "Interested" record on at least one matched project, with developer approval
 * where that project requires it. Funds are checked separately at bid time.
 */
export function cpEligibility(s: DbState, cpId: ID, lead: Lead): Eligibility {
  const cp = byId(s.cps, cpId);
  if (!cp) return { eligible: false, reason: 'CP profile not found', viaProjectIds: [] };
  if (cp.reviewStatus === 'pending') return { eligible: false, reason: 'Your partner profile is still under review', viaProjectIds: [] };
  if (cp.reviewStatus === 'rejected') return { eligible: false, reason: 'Your partner profile was not approved', viaProjectIds: [] };
  if (cp.reviewStatus === 'suspended') return { eligible: false, reason: 'Your partner account is suspended', viaProjectIds: [] };
  const users = s.users.filter((u) => u.orgId === cpId);
  if (users.length && users.every((u) => u.status !== 'active')) return { eligible: false, reason: 'Your account is not active', viaProjectIds: [] };

  const via: ID[] = [];
  let pendingApproval: string | undefined;
  for (const m of lead.matches) {
    const p = byId(s.projects, m.projectId);
    if (!p) continue;
    const it = s.interests.find((i) => i.cpId === cpId && i.projectId === m.projectId && i.state === 'interested');
    if (!it) continue;
    if (p.cpApprovalRequired && it.approval !== 'approved') {
      pendingApproval = it.approval === 'rejected' ? `The developer declined your access to ${p.name}` : `Developer approval for ${p.name} is pending`;
      continue;
    }
    via.push(p.id);
  }
  if (via.length) return { eligible: true, viaProjectIds: via };
  if (pendingApproval) return { eligible: false, reason: pendingApproval, viaProjectIds: [] };
  const names = lead.matches.map((m) => byId(s.projects, m.projectId)?.name).filter(Boolean).join(', ');
  return { eligible: false, reason: `Mark yourself Interested in ${names} to bid on this lead`, viaProjectIds: [] };
}

export function eligibleCpIds(s: DbState, lead: Lead): ID[] {
  return s.cps.filter((cp) => cpEligibility(s, cp.id, lead).eligible).map((cp) => cp.id);
}

function projectPriceRange(p: Project) {
  return {
    min: Math.min(...p.configs.map((c) => c.priceMin)),
    max: Math.max(...p.configs.map((c) => c.priceMax)),
  };
}

function bhkOverlap(p: Project, bhk: number[]) {
  if (!bhk.length) return p.configs.map((c) => c.bhk);
  return p.configs.map((c) => c.bhk).filter((b) => bhk.includes(b));
}

/**
 * Deterministic matching. A project-specific enquiry stays with its project;
 * other projects are added only when the customer explicitly allowed alternatives.
 */
export function computeMatches(s: DbState, e: Enquiry): ProjectMatch[] {
  const out: ProjectMatch[] = [];
  const primary = byId(s.projects, e.projectId);
  if (primary) {
    const reasons = ['Customer enquired about this project'];
    const r = projectPriceRange(primary);
    if (r.min <= e.budgetMax && r.max >= e.budgetMin) reasons.push(`Budget fits ${formatPriceRange(r.min, r.max)}`);
    const b = bhkOverlap(primary, e.bhk);
    if (b.length) reasons.push(`Offers ${[...new Set(b)].join(', ')} BHK`);
    out.push({ projectId: primary.id, reasons, primary: true });
  }
  if (!e.allowAlternatives) return out;

  const city = primary?.city ?? 'Pune';
  const candidates = s.projects
    .filter((p) => p.status === 'published' && p.id !== e.projectId && p.city === city)
    .map((p) => {
      const r = projectPriceRange(p);
      const budgetFits = r.min <= e.budgetMax && r.max >= e.budgetMin;
      const b = bhkOverlap(p, e.bhk);
      const localityPref = e.preferredLocalities.includes(p.locality);
      const sameLocality = primary ? primary.locality === p.locality : false;
      let score = 0;
      const reasons: string[] = [];
      if (localityPref) { score += 3; reasons.push(`In preferred locality ${p.locality}`); }
      else if (sameLocality) { score += 2; reasons.push(`Same locality as enquired project`); }
      if (budgetFits) { score += 2; reasons.push(`Budget fits ${formatPriceRange(r.min, r.max)}`); }
      if (b.length) { score += 1; reasons.push(`Offers ${[...new Set(b)].join(', ')} BHK`); }
      return { p, score, ok: budgetFits && b.length > 0 && (localityPref || sameLocality || e.preferredLocalities.length === 0), reasons };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .slice(0, 3);
  for (const c of candidates) out.push({ projectId: c.p.id, reasons: ['Customer allowed relevant alternatives', ...c.reasons], primary: false });
  return out;
}
