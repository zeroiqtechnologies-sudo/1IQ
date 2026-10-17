import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { DbState, ID, OpContext } from '../domain/types';
import { attempt, auth, clock, getState, realtime } from '../services/local';
import { useToast } from '../ui/toast';

export function useDb(): DbState {
  return useSyncExternalStore(realtime.subscribe, getState, getState);
}

export function useSession() {
  const [, force] = useState(0);
  useEffect(() => realtime.subscribe(() => force((n) => n + 1)), []);
  return auth.currentUser();
}

/** Re-renders every second with the demo clock's current time. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(clock.now());
  useEffect(() => {
    const t = setInterval(() => setNow(clock.now()), intervalMs);
    const un = realtime.subscribe(() => setNow(clock.now()));
    return () => { clearInterval(t); un(); };
  }, [intervalMs]);
  return now;
}

/** Run a domain operation as the current user; shows a toast on failure (and optionally on success). Returns undefined on failure. */
export function useAct() {
  const toast = useToast();
  return useCallback(
    <T,>(fn: (s: DbState, ctx: OpContext) => T, opts: { success?: string; actorId?: ID } = {}): T | undefined => {
      const actor = opts.actorId ?? auth.currentUser()?.id ?? 'guest';
      const r = attempt(actor, fn);
      if (!r.ok) {
        toast.push({ tone: 'danger', title: 'Not done', body: r.error });
        return undefined;
      }
      if (opts.success) toast.push({ tone: 'success', title: opts.success });
      // Void operations return `true` so callers can distinguish success from failure (undefined).
      return (r.value === undefined ? true : r.value) as T;
    },
    [toast],
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · SetuHomes (Demo)`;
  }, [title]);
}
