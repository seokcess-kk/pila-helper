'use client';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useDialog } from './useDialog';
import { IconButton } from './Button';
import { Icons } from '../icons';
import { cn } from './cn';

/**
 * 우측 슬라이드 드로어 — 정보가 많은 상세(예약/회원 상세 등)에 사용.
 * 목록을 가린 채 상세를 보여주고, 닫으면 목록으로 자연스럽게 복귀.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 animate-fade-in" onClick={onClose} role="presentation">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex h-full w-full flex-col bg-surface shadow-drawer outline-none animate-slide-in-right',
          width === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-bold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <IconButton aria-label="닫기" onClick={onClose} size="sm">
            <Icons.x className="h-5 w-5" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
