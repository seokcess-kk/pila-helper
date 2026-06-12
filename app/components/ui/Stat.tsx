import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icons } from '../icons';

export type StatTone = 'default' | 'pos' | 'neg' | 'warn';

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-slate-900',
  pos: 'text-success-fg',
  neg: 'text-danger-fg',
  warn: 'text-warning-fg',
};

const MARK: Record<StatTone, string> = { default: '', pos: '▲ ', neg: '▼ ', warn: '⚠ ' };

/** 소형 지표 타일 — 카드 내부 그리드용. href 지정 시 클릭 가능(딥링크). */
export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        {label}
      </div>
      <div className={cn('mt-0.5 text-lg font-bold tnum', TONE_TEXT[tone])}>
        {/* 색에만 의존하지 않도록 방향/주의 기호 병기(색맹 접근성) */}
        {MARK[tone] ? <span aria-hidden="true">{MARK[tone]}</span> : null}
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
    </>
  );
  const base = 'block rounded-lg bg-muted p-3';
  if (href) {
    return (
      <Link href={href} className={cn(base, 'group transition-colors hover:bg-brand-soft')}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">{inner}</div>
          <Icons.chevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
        </div>
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** 대형 핵심지표 카드 — 대시보드 히어로 숫자(매출·이익 등). 전월대비 델타 옵션. */
export function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  delta,
  href,
  emphasis = false,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  delta?: { value: ReactNode; dir: 'up' | 'down' | 'flat'; good?: boolean };
  href?: string;
  emphasis?: boolean;
}) {
  const deltaTone =
    delta?.dir === 'flat' ? 'text-slate-400' : delta?.good ? 'text-success-fg' : 'text-danger-fg';
  const className = cn(
    'block rounded-card border bg-surface p-4 shadow-card transition',
    emphasis ? 'border-brand-200 ring-1 ring-brand-100' : 'border-line',
    href && 'hover:border-brand-300 hover:shadow-pop',
  );
  const inner = (
    <>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tnum', TONE_TEXT[tone])}>{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {delta ? (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', deltaTone)}>
            {delta.dir === 'up' ? <Icons.trendUp className="h-3.5 w-3.5" /> : delta.dir === 'down' ? <Icons.trendDown className="h-3.5 w-3.5" /> : null}
            {delta.value}
          </span>
        ) : null}
        {sub ? <span className="text-xs text-slate-400">{sub}</span> : null}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
