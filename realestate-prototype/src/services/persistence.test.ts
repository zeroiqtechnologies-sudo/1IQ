// Persistence: refresh keeps demo progress; reset restores the seed.
class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('local persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('survives a reload and resets to seed', async () => {
    const m1 = await import('./local');
    const seedCount = m1.getState().enquiries.length;
    m1.tx('user_admin', (s) => { s.projects[0].name = 'Renamed in demo'; });
    m1.auth.signInAs('user_cp_1');

    vi.resetModules(); // simulate a page refresh: module state is rebuilt from storage
    const m2 = await import('./local');
    expect(m2.getState().projects[0].name).toBe('Renamed in demo');
    expect(m2.auth.currentUser()?.id).toBe('user_cp_1');

    m2.resetDemo();
    expect(m2.getState().projects[0].name).toBe('Sahyadri Skyline');
    expect(m2.getState().enquiries).toHaveLength(seedCount);
    expect(m2.auth.currentUser()).toBeNull();
  });

  it('failed operations commit nothing (transaction rollback)', async () => {
    const m = await import('./local');
    const { DomainError } = await import('../domain/util');
    const before = JSON.stringify(m.getState());
    const r = m.attempt('user_admin', (s) => { s.projects[0].name = 'half-done'; throw new DomainError('x', 'boom'); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('boom');
    expect(JSON.stringify(m.getState())).toBe(before);
  });
});
