import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral' | 'muted';

const TONE: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  brand: 'bg-brand-soft text-brand-700',
  neutral: 'bg-slate-100 text-slate-600',
  muted: 'bg-slate-100 text-slate-400',
};

const DOT: Record<BadgeTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  brand: 'bg-brand-500',
  neutral: 'bg-slate-400',
  muted: 'bg-slate-300',
};

/** 상태코드 → 톤 매핑(도메인 enum 값 전반). 색만이 아니라 라벨 텍스트도 항상 병기. */
const STATUS_TONE: Record<string, BadgeTone> = {
  // 회원/수강권/예약/결제 — 긍정
  enrolled: 'success',
  re_enrolled: 'success',
  active: 'success',
  attended: 'success',
  paid: 'success',
  deposited: 'success',
  // 주의(액션 필요)
  expiring: 'warning',
  receivable: 'warning',
  waitlisted: 'warning',
  awaiting_deposit: 'warning',
  partial: 'warning',
  no_show_risk: 'warning',
  late: 'warning',
  on_hold: 'warning',
  // 부정/위험
  expired: 'danger',
  no_show: 'danger',
  lost: 'danger',
  absent: 'danger',
  long_absent: 'danger',
  // 정보(진행중)
  new_inquiry: 'info',
  contacted: 'info',
  consulting: 'info',
  booked: 'info',
  scheduled: 'info',
  open: 'info',
  excused: 'info',
  // 브랜드(체험/VIP)
  trial: 'brand',
  trial_booked: 'brand',
  trial_done: 'brand',
  vip: 'brand',
  package: 'brand',
  // 중립/비활성
  dormant: 'neutral',
  paused: 'neutral',
  closed: 'neutral',
  // 종료/소멸(흐리게)
  canceled: 'muted',
  refunded: 'muted',
  used_up: 'muted',
  completed: 'muted',
};

export function statusTone(value: string): BadgeTone {
  return STATUS_TONE[value] ?? 'neutral';
}

export function Badge({
  value,
  label,
  tone,
  dot = false,
  className,
}: {
  value?: string;
  label?: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  const t = tone ?? (value ? statusTone(value) : 'neutral');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        TONE[t],
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', DOT[t])} aria-hidden="true" /> : null}
      {label ?? value}
    </span>
  );
}
