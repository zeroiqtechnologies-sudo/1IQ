import type { CpProfile, DbState, Developer, ID, OpContext, Project, ReviewStatus } from './types';
import { audit, byId, fail, must, nextId, notifyOrg, notifyRole } from './util';

export type ProjectDraft = Omit<Project, 'id' | 'developerId' | 'status' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'registrationReview' | 'reviewNote' | 'featured'>;

/** Fields whose change after approval sends a listing back to review. */
const MATERIAL_FIELDS: (keyof ProjectDraft)[] = ['registrationNo', 'registrationAuthority', 'possession', 'configs', 'propertyType', 'locality', 'name'];

function assertOwner(s: DbState, developerId: ID, projectId: ID): Project {
  const p = must(s.projects, projectId, 'Project');
  if (p.developerId !== developerId) fail('forbidden', 'You can only manage your own projects');
  return p;
}

function assertDeveloperUser(s: DbState, ctx: OpContext, developerId: ID) {
  const u = byId(s.users, ctx.actorId);
  if (!u || u.role !== 'developer' || u.orgId !== developerId) fail('forbidden', 'Only this developer’s users can do that. CPs and customers cannot list projects.');
}

export function validateProjectDraft(d: Partial<ProjectDraft>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name || d.name.trim().length < 3) e.name = 'Project name is required';
  if (!d.locality) e.locality = 'Choose a locality';
  if (!d.description || d.description.trim().length < 20) e.description = 'Add a description (20+ characters)';
  if (!d.configs || !d.configs.length) e.configs = 'Add at least one unit configuration';
  for (const c of d.configs ?? []) {
    if (c.carpetMinSqft <= 0 || c.carpetMaxSqft < c.carpetMinSqft) e.configs = `Check carpet area for ${c.label}`;
    if (c.priceMin <= 0 || c.priceMax < c.priceMin) e.configs = `Check price range for ${c.label}`;
    if (c.unitsAvailable > c.unitsTotal) e.configs = `Available units exceed total for ${c.label}`;
  }
  if (!d.possession || !/^\d{4}-\d{2}$/.test(d.possession)) e.possession = 'Choose a possession month';
  if (!d.registrationNo || d.registrationNo.trim().length < 6) e.registrationNo = 'Enter the project registration number';
  if (d.cpTerms && (d.cpTerms.commissionPercent < 0 || d.cpTerms.commissionPercent > 10)) e.cpTerms = 'Commission must be between 0% and 10%';
  return e;
}

export function createProject(s: DbState, ctx: OpContext, developerId: ID, d: ProjectDraft): Project {
  assertDeveloperUser(s, ctx, developerId);
  const dev = must(s.developers, developerId, 'Developer');
  if (dev.verificationStatus === 'rejected' || dev.verificationStatus === 'suspended') fail('dev_inactive', 'Your company account cannot create listings');
  const p: Project = { ...d, id: nextId(s, 'prj'), developerId, status: 'draft', registrationReview: 'not_reviewed', featured: false, createdAt: ctx.now, updatedAt: ctx.now };
  s.projects.push(p);
  audit(s, ctx, 'project.created', 'project', p.id, p.name);
  return p;
}

export function updateProject(s: DbState, ctx: OpContext, developerId: ID, projectId: ID, patch: Partial<ProjectDraft>): { returnedToReview: boolean } {
  assertDeveloperUser(s, ctx, developerId);
  const p = assertOwner(s, developerId, projectId);
  if (p.status === 'archived') fail('archived', 'Archived projects cannot be edited');
  const material = MATERIAL_FIELDS.some((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(p[k]));
  Object.assign(p, patch);
  p.updatedAt = ctx.now;
  let returnedToReview = false;
  if (material && ['approved', 'published', 'paused'].includes(p.status)) {
    p.status = 'submitted';
    if ('registrationNo' in patch || 'registrationAuthority' in patch) p.registrationReview = 'not_reviewed';
    returnedToReview = true;
    notifyRole(s, ctx, 'admin', { title: 'Listing changed — re-review', body: `${p.name} changed approved details and is back in review.`, tone: 'warning', link: `/admin/listings/${p.id}` });
  }
  audit(s, ctx, returnedToReview ? 'project.material_change' : 'project.updated', 'project', p.id);
  return { returnedToReview };
}

export function submitProject(s: DbState, ctx: OpContext, developerId: ID, projectId: ID) {
  assertDeveloperUser(s, ctx, developerId);
  const p = assertOwner(s, developerId, projectId);
  if (!['draft', 'changes_requested'].includes(p.status)) fail('bad_state', `Cannot submit a project that is ${p.status}`);
  const errs = validateProjectDraft(p);
  if (Object.keys(errs).length) fail('validation', Object.values(errs)[0]);
  p.status = 'submitted';
  p.updatedAt = ctx.now;
  audit(s, ctx, 'project.submitted', 'project', p.id);
  notifyRole(s, ctx, 'admin', { title: 'Listing submitted for review', body: p.name, tone: 'info', link: `/admin/listings/${p.id}` });
}

export function setProjectPaused(s: DbState, ctx: OpContext, developerId: ID, projectId: ID, paused: boolean) {
  assertDeveloperUser(s, ctx, developerId);
  const p = assertOwner(s, developerId, projectId);
  if (paused && p.status !== 'published') fail('bad_state', 'Only published projects can be paused');
  if (!paused && p.status !== 'paused') fail('bad_state', 'Project is not paused');
  p.status = paused ? 'paused' : 'published';
  p.updatedAt = ctx.now;
  audit(s, ctx, paused ? 'project.paused' : 'project.resumed', 'project', p.id);
}

export function setCpApprovalRequired(s: DbState, ctx: OpContext, developerId: ID, projectId: ID, required: boolean) {
  assertDeveloperUser(s, ctx, developerId);
  const p = assertOwner(s, developerId, projectId);
  p.cpApprovalRequired = required;
  for (const i of s.interests.filter((x) => x.projectId === p.id)) {
    if (required && i.approval === 'not_required') i.approval = 'pending';
    if (!required) i.approval = 'not_required';
  }
  audit(s, ctx, 'project.cp_approval_setting', 'project', p.id, String(required));
}

/** Admin moderation of listings. */
export function moderateProject(s: DbState, ctx: OpContext, projectId: ID, action: 'approve' | 'request_changes' | 'publish' | 'approve_and_publish' | 'archive', note?: string) {
  const p = must(s.projects, projectId, 'Project');
  const dev = must(s.developers, p.developerId, 'Developer');
  if (action === 'request_changes') {
    if (p.status !== 'submitted') fail('bad_state', 'Only submitted listings can be sent back');
    if (!note?.trim()) fail('note_required', 'Explain what needs to change');
    p.status = 'changes_requested';
    p.reviewNote = note;
  } else if (action === 'approve' || action === 'approve_and_publish') {
    if (p.status !== 'submitted') fail('bad_state', 'Only submitted listings can be approved');
    if (dev.verificationStatus !== 'approved') fail('dev_unverified', 'Verify the developer company before approving its listings');
    p.status = action === 'approve' ? 'approved' : 'published';
    p.reviewNote = note;
    if (action === 'approve_and_publish') p.publishedAt = ctx.now;
  } else if (action === 'publish') {
    if (p.status !== 'approved') fail('bad_state', 'Approve the listing before publishing');
    p.status = 'published';
    p.publishedAt = ctx.now;
  } else if (action === 'archive') {
    p.status = 'archived';
  }
  p.updatedAt = ctx.now;
  audit(s, ctx, `project.${action}`, 'project', p.id, note);
  notifyOrg(s, ctx, p.developerId, {
    title: action === 'request_changes' ? 'Changes requested on your listing' : `Listing ${p.status.replace(/_/g, ' ')}`,
    body: `${p.name}${note ? ` — ${note}` : ''}`,
    tone: action === 'request_changes' ? 'warning' : 'success',
    link: `/developer/projects/${p.id}`,
  });
}

export function reviewRegistration(s: DbState, ctx: OpContext, projectId: ID, result: 'reviewed' | 'mismatch') {
  const p = must(s.projects, projectId, 'Project');
  p.registrationReview = result;
  p.updatedAt = ctx.now;
  audit(s, ctx, `project.registration_${result}`, 'project', p.id, p.registrationNo);
}

export function reviewDeveloper(s: DbState, ctx: OpContext, developerId: ID, status: ReviewStatus, note?: string): Developer {
  const d = must(s.developers, developerId, 'Developer');
  d.verificationStatus = status;
  d.verificationNote = note;
  d.reviewedAt = ctx.now;
  audit(s, ctx, `developer.${status}`, 'developer', d.id, note);
  notifyOrg(s, ctx, d.id, { title: `Company verification: ${status}`, body: note ?? '', tone: status === 'approved' ? 'success' : 'warning', link: '/developer/company' });
  return d;
}

export function reviewCp(s: DbState, ctx: OpContext, cpId: ID, status: ReviewStatus, note?: string): CpProfile {
  const c = must(s.cps, cpId, 'CP');
  c.reviewStatus = status;
  c.reviewNote = note;
  for (const u of s.users.filter((x) => x.orgId === cpId)) u.status = status === 'suspended' ? 'suspended' : 'active';
  audit(s, ctx, `cp.${status}`, 'cp', c.id, note);
  notifyOrg(s, ctx, c.id, { title: `Partner profile: ${status}`, body: note ?? '', tone: status === 'approved' ? 'success' : 'warning', link: '/cp/profile' });
  return c;
}

export function updateCpProfile(s: DbState, ctx: OpContext, cpId: ID, patch: Partial<Omit<CpProfile, 'id' | 'reviewStatus' | 'submittedAt'>>) {
  const c = must(s.cps, cpId, 'CP');
  Object.assign(c, patch);
  if (c.reviewStatus === 'rejected') c.reviewStatus = 'pending';
  audit(s, ctx, 'cp.profile_updated', 'cp', c.id);
}

export function updateDeveloperProfile(s: DbState, ctx: OpContext, developerId: ID, patch: Partial<Omit<Developer, 'id' | 'verificationStatus'>>, resubmit: boolean) {
  const d = must(s.developers, developerId, 'Developer');
  Object.assign(d, patch);
  if (resubmit) {
    d.verificationStatus = 'pending';
    d.submittedAt = ctx.now;
    notifyRole(s, ctx, 'admin', { title: 'Developer verification submitted', body: d.company, tone: 'info', link: '/admin/verification' });
  }
  audit(s, ctx, resubmit ? 'developer.verification_submitted' : 'developer.profile_updated', 'developer', d.id);
}

/** CP marks itself Interested in a published project (distinct from city preferences). */
export function setInterest(s: DbState, ctx: OpContext, cpId: ID, projectId: ID, interested: boolean) {
  const cp = must(s.cps, cpId, 'CP');
  const p = must(s.projects, projectId, 'Project');
  if (interested && p.status !== 'published') fail('not_published', 'You can only follow published projects');
  if (interested && (cp.reviewStatus === 'suspended' || cp.reviewStatus === 'rejected')) fail('cp_inactive', 'Your account cannot register interest');
  let it = s.interests.find((i) => i.cpId === cpId && i.projectId === projectId);
  if (!it) {
    it = { id: nextId(s, 'int'), cpId, projectId, state: 'withdrawn', approval: p.cpApprovalRequired ? 'pending' : 'not_required', createdAt: ctx.now, updatedAt: ctx.now };
    s.interests.push(it);
  }
  it.state = interested ? 'interested' : 'withdrawn';
  it.updatedAt = ctx.now;
  if (interested && p.cpApprovalRequired && it.approval !== 'approved') it.approval = 'pending';
  audit(s, ctx, interested ? 'interest.added' : 'interest.withdrawn', 'project', p.id, cpId);
  if (interested) notifyOrg(s, ctx, p.developerId, { title: 'New partner interest', body: `${cp.displayName} is interested in ${p.name}${p.cpApprovalRequired ? ' (awaiting your approval)' : ''}.`, tone: 'info', link: `/developer/projects/${p.id}` });
  return it;
}

export function decideInterest(s: DbState, ctx: OpContext, developerId: ID, interestId: ID, approve: boolean) {
  assertDeveloperUser(s, ctx, developerId);
  const it = must(s.interests, interestId, 'Interest');
  assertOwner(s, developerId, it.projectId);
  const p = must(s.projects, it.projectId, 'Project');
  if (!p.cpApprovalRequired) fail('not_required', 'CP approval is not enabled for this project');
  it.approval = approve ? 'approved' : 'rejected';
  it.updatedAt = ctx.now;
  audit(s, ctx, approve ? 'interest.approved' : 'interest.rejected', 'project', p.id, it.cpId);
  notifyOrg(s, ctx, it.cpId, { title: approve ? 'Project access approved' : 'Project access declined', body: p.name, tone: approve ? 'success' : 'warning', link: `/cp/projects/${p.id}` });
}

export function shareBrochure(s: DbState, ctx: OpContext, developerId: ID, projectId: ID) {
  assertDeveloperUser(s, ctx, developerId);
  const p = assertOwner(s, developerId, projectId);
  const cps = s.interests.filter((i) => i.projectId === p.id && i.state === 'interested').map((i) => i.cpId);
  for (const c of cps) notifyOrg(s, ctx, c, { title: 'Brochure shared', body: `${p.name}: the developer shared ${p.brochureName}.`, tone: 'info', link: `/cp/projects/${p.id}` });
  audit(s, ctx, 'project.brochure_shared', 'project', p.id, `${cps.length} CP(s)`);
  return cps.length;
}

export function publicProjects(s: DbState): Project[] {
  return s.projects.filter((p) => p.status === 'published');
}
