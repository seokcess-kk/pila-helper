'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icons } from '../icons';
import { cn } from './cn';

type ToastVariant = 'success' | 'error' | 'info';
type ToastItem = { id: number; title: ReactNode; description?: ReactNode; variant: ToastVariant };

type ToastInput = { title: ReactNode; description?: ReactNode; variant?: ToastVariant };

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const VARIANT: Record<ToastVariant, { border: string; icon: ReactNode }> = {
  success: { border: 'border-l-success', icon: <Icons.check className="h-4 w-4 text-success-fg" /> },
  error: { border: 'border-l-danger', icon: <Icons.circleAlert className="h-4 w-4 text-danger-fg" /> },
  info: { border: 'border-l-info', icon: <Icons.info className="h-4 w-4 text-info-fg" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current;
      setItems((xs) => [...xs, { id, title: t.title, description: t.description, variant: t.variant ?? 'success' }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border border-l-4 border-line bg-surface px-3.5 py-3 shadow-pop animate-slide-up',
              VARIANT[t.variant].border,
            )}
            role="status"
          >
            <span className="mt-0.5 shrink-0">{VARIANT[t.variant].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-xs text-slate-500">{t.description}</p> : null}
            </div>
            <button type="button" aria-label="닫기" onClick={() => remove(t.id)} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-muted">
              <Icons.x className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
