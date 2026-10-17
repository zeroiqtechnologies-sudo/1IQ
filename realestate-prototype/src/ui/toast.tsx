import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

type Tone = 'success' | 'danger' | 'warning' | 'info';
interface Toast { id: number; tone: Tone; title: string; body?: string }
const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === 'danger' ? 7000 : 4000);
  }, []);
  const v = useMemo(() => ({ push }), [push]);
  const icon = { success: CheckCircle2, danger: XCircle, warning: AlertTriangle, info: Info };
  const color = { success: 'text-teal-600', danger: 'text-red-600', warning: 'text-amber-600', info: 'text-navy-600' };
  return (
    <Ctx.Provider value={v}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96" role="status" aria-live="polite">
        {items.map((t) => {
          const I = icon[t.tone];
          return (
            <div key={t.id} className="flex gap-3 items-start rounded-lg bg-white shadow-lg ring-1 ring-slate-200 p-3">
              <I className={`h-5 w-5 shrink-0 ${color[t.tone]}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.body && <p className="text-sm text-slate-600 mt-0.5">{t.body}</p>}
              </div>
              <button className="text-slate-400 hover:text-slate-700" aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
