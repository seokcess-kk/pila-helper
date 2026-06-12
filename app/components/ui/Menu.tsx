'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 클릭형 드롭다운 메뉴 — 글로벌 바의 ＋빠른등록·계정·행 액션 등에 공용.
 * 바깥 클릭/ESC 로 닫힘. children 은 close 콜백을 받는 렌더 함수.
 */
export function Menu({
  trigger,
  triggerClassName,
  triggerLabel,
  align = 'right',
  width = '14rem',
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  align?: 'left' | 'right';
  width?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          style={{ width }}
          className={cn(
            'absolute z-50 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop animate-slide-up',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  href,
  onClick,
  icon,
  children,
  danger = false,
}: {
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  const cls = cn(
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
    danger ? 'text-danger-fg hover:bg-danger-soft' : 'text-slate-700 hover:bg-muted',
  );
  const body = (
    <>
      {icon ? <span className="shrink-0 text-slate-400">{icon}</span> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={cls} role="menuitem">
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} role="menuitem">
      {body}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-slate-400">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}
