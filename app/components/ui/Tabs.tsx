import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type SegOption<T extends string = string> = { value: T; label: ReactNode };

/**
 * 세그먼트 컨트롤(링크형) — 결제기준/소진기준, 일/주/월 뷰 같은 상호배타 토글.
 * BasisToggle 등 일회성 토글을 대체하는 단일 출처.
 */
export function SegmentedNav<T extends string>({
  options,
  current,
  hrefFor,
  size = 'md',
  className,
}: {
  options: SegOption<T>[];
  current: T;
  hrefFor: (v: T) => string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-muted p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-surface text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export type TabItem = { value: string; label: ReactNode; href: string; count?: number };

/** 상세 화면 탭(링크형) — 회원 상세의 예약/결제/횟수권/출석/메모 등. */
export function Tabs({ items, active, className }: { items: TabItem[]; active: string; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((t) => {
        const on = t.value === active;
        return (
          <Link
            key={t.value}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              on
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-line-strong hover:text-slate-700',
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className={cn('rounded-full px-1.5 text-xs', on ? 'bg-brand-soft text-brand-700' : 'bg-slate-100 text-slate-500')}>
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
