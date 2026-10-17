import type { AppNotification, AuditEvent, DbState, ID, OpContext, Role } from './types';

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}

/** Deterministic, sequential ids, so seed data and tests are reproducible. */
export function nextId(s: DbState, prefix: string): ID {
  s.seq += 1;
  return `${prefix}_${String(s.seq).padStart(4, '0')}`;
}

export function audit(s: DbState, ctx: OpContext, action: string, objectType: string, objectId: ID, detail?: string, sensitive = false) {
  const ev: AuditEvent = { id: nextId(s, 'aud'), actorId: ctx.actorId, action, objectType, objectId, detail, sensitive, at: ctx.now };
  s.audit.push(ev);
}

export function notify(s: DbState, ctx: OpContext, recipientId: ID | undefined, n: Omit<AppNotification, 'id' | 'recipientId' | 'read' | 'at'>) {
  if (!recipientId) return;
  s.notifications.push({ ...n, id: nextId(s, 'ntf'), recipientId, read: false, at: ctx.now });
}

export function usersForOrg(s: DbState, orgId: ID) {
  return s.users.filter((u) => u.orgId === orgId);
}

export function notifyOrg(s: DbState, ctx: OpContext, orgId: ID, n: Omit<AppNotification, 'id' | 'recipientId' | 'read' | 'at'>) {
  for (const u of usersForOrg(s, orgId)) notify(s, ctx, u.id, n);
}

export function notifyRole(s: DbState, ctx: OpContext, role: Role, n: Omit<AppNotification, 'id' | 'recipientId' | 'read' | 'at'>) {
  for (const u of s.users.filter((x) => x.role === role)) notify(s, ctx, u.id, n);
}

export function byId<T extends { id: ID }>(list: T[], id: ID | undefined): T | undefined {
  if (!id) return undefined;
  return list.find((x) => x.id === id);
}

export function must<T extends { id: ID }>(list: T[], id: ID | undefined, what: string): T {
  const v = byId(list, id);
  if (!v) fail('not_found', `${what} not found`);
  return v;
}

/** Which user is the customer record's user (customers log in as themselves). */
export function customerUserId(customerId: ID): ID {
  return `user_${customerId}`;
}
