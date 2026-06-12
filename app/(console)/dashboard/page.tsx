import Link from 'next/link';
import type { ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import { adminDashboard, currentStudio, dateKST, getTimetable, type RequestContext, type RevenueBasis } from '@/biz/index.js';
import { Badge, Card, EmptyState, KpiCard, PageHeader, Stat, buttonVariants, won } from '../../components/ui';
import { BasisToggle } from '../../components/BasisToggle';
import { AddMemberDialog } from '../../components/AddMemberDialog';
import { Icons } from '../../components/icons';

export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<string, 'warning' | 'info' | 'brand'> = { personal: 'warning', group: 'info', trial: 'brand' };

/** 강사 전용 홈 — 오늘 내 수업 + 담당 회원(재무지표 미노출). */
function InstructorHome({ ctx, studioName }: { ctx: RequestContext; studioName: string }) {
  const today = dateKST(ctx.now);
  const staffId = ctx.staff_id ?? '';
  const me = ctx.db.staff.find((s) => s.id === staffId);
  const todays = getTimetable(ctx, today, today).filter(
    (c) => c.session.instructor_staff_id === staffId || c.session.substitute_staff_id === staffId,
  );
  const assigned = ctx.db.members.filter((m) => m.studio_id === ctx.studio_id && !m.deleted_at && m.assigned_staff_id === staffId);
  const booked = todays.reduce((s, c) => s + c.booked, 0);

  return (
    <div>
      <PageHeader title={`${me?.name ?? '내'} 강사님`} sub={`${today} · ${studioName} · 오늘 내 수업`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="오늘 내 수업" value={`${todays.length}개`} href="/timetable?view=day" />
        <Stat label="오늘 예약 인원" value={`${booked}명`} />
        <Stat label="담당 회원" value={`${assigned.length}명`} href="/members" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="오늘 내 수업" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {todays.map((c) => {
              const full = c.booked >= c.capacity;
              const canceled = c.session.session_status === 'canceled';
              return (
                <li key={c.session.id}>
                  <Link href={`/sessions/${c.session.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="tnum text-sm font-semibold text-slate-700">{c.session.start_at.slice(11, 16)}</span>
                      <Badge value={c.session.class_type} tone={TYPE_TONE[c.session.class_type]} label={c.session.name} dot />
                      <span className="truncate text-xs text-slate-500">{c.room_name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {canceled ? <Badge value="canceled" label="폐강" /> : full ? <Badge tone="danger" label="만석" /> : null}
                      <span className="tnum text-slate-500">{c.booked}/{c.capacity}</span>
                      <Icons.chevronRight className="h-4 w-4 text-slate-300" />
                    </span>
                  </Link>
                </li>
              );
            })}
            {todays.length === 0 ? (
              <li className="px-4"><EmptyState compact icon={<Icons.calendar className="h-5 w-5" />} title="오늘 배정된 수업이 없습니다" /></li>
            ) : null}
          </ul>
        </Card>
        <Card title={`담당 회원 (${assigned.length})`} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {assigned.map((m) => (
              <li key={m.id}>
                <Link href={`/members/${m.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-muted">
                  <span className="font-medium text-slate-800">{m.name}</span>
                  <span className="tnum text-xs text-slate-400">{m.phone}</span>
                </Link>
              </li>
            ))}
            {assigned.length === 0 ? (
              <li className="px-4"><EmptyState compact icon={<Icons.users className="h-5 w-5" />} title="배정된 담당 회원이 없습니다" /></li>
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: { basis?: string } }) {
  const ctx = getContext();
  const studio = currentStudio(ctx);
  if (ctx.role === 'instructor') return <InstructorHome ctx={ctx} studioName={studio.name} />;
  const basis = (searchParams.basis === 'consumption' ? 'consumption' : 'payment') as RevenueBasis;
  const d = adminDashboard(ctx, basis);
  const today = getTimetable(ctx, d.today_date, d.today_date);

  // 처리할 일(액션큐) — 카운트>0 인 항목만, 가장 급한 순.
  const queue = [
    d.profit.receivable > 0 && {
      icon: <Icons.wallet className="h-4 w-4" />,
      label: '미수금 회수',
      detail: `${d.today.receivable_members}명 · ${won(d.profit.receivable)}`,
      href: '/finance',
      tone: 'warning' as const,
    },
    d.profit.undeposited_card > 0 && {
      icon: <Icons.matching className="h-4 w-4" />,
      label: '미입금 카드매출 매칭',
      detail: won(d.profit.undeposited_card),
      href: '/finance/matching',
      tone: 'warning' as const,
    },
    d.today.expiring > 0 && {
      icon: <Icons.ticket className="h-4 w-4" />,
      label: '만료 임박 회원 재등록 상담',
      detail: `${d.today.expiring}명`,
      href: '/members',
      tone: 'warning' as const,
    },
    d.today.no_show_risk > 0 && {
      icon: <Icons.circleAlert className="h-4 w-4" />,
      label: '노쇼 주의 회원 관리',
      detail: `${d.today.no_show_risk}명`,
      href: '/members',
      tone: 'danger' as const,
    },
    d.today.new_leads > 0 && {
      icon: <Icons.headset className="h-4 w-4" />,
      label: '신규 상담 응대',
      detail: `${d.today.new_leads}건`,
      href: '/crm',
      tone: 'info' as const,
    },
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string; detail: string; href: string; tone: 'warning' | 'danger' | 'info' }>;

  const TONE_BG: Record<string, string> = {
    warning: 'bg-warning-soft text-warning-fg',
    danger: 'bg-danger-soft text-danger-fg',
    info: 'bg-info-soft text-info-fg',
  };

  return (
    <div>
      <PageHeader title="대시보드" sub={`${d.today_date} · ${studio.name} 오늘 운영 현황`} />

      {/* 이번 달 손익 — 핵심 KPI */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">이번 달 손익</h2>
        <BasisToggle basis={basis} path="/dashboard" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label={`매출 (${basis === 'payment' ? '결제기준' : '소진기준'})`}
          value={won(d.sales.net)}
          sub={`총 ${won(d.sales.gross)} − 환불 ${won(d.sales.refund)}`}
          href="/finance"
        />
        <KpiCard label="비용" value={won(d.cost.total)} sub={`고정 ${won(d.cost.fixed)} · 변동 ${won(d.cost.variable)}`} href="/finance" />
        <KpiCard
          label="영업이익"
          value={`${d.profit.operating >= 0 ? '+' : ''}${won(d.profit.operating)}`}
          tone={d.profit.operating >= 0 ? 'pos' : 'neg'}
          sub={`이익률 ${d.profit.margin}% · 월말 예상 ${won(d.profit.month_end_profit)}`}
          emphasis
          href="/analysis"
        />
        <KpiCard
          label="사업자 통장 잔액"
          value={won(d.profit.bank_balance)}
          sub={d.profit.undeposited_card > 0 ? `미입금 카드 ${won(d.profit.undeposited_card)}` : '미입금 없음'}
          href="/finance/matching"
        />
      </div>

      {/* 오늘의 운영 + 처리할 일 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="오늘의 운영" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Stat label="오늘 수업" value={`${d.today.sessions}개`} sub={`체험 ${d.today.trials}`} href={`/timetable?view=day&date=${d.today_date}`} />
            <Stat label="예약 인원" value={`${d.today.booked}명`} sub={`빈자리 ${d.today.open_seats}`} href={`/timetable?view=day&date=${d.today_date}`} />
            <Stat label="신규 상담" value={`${d.today.new_leads}건`} href="/crm" />
            <Stat label="만료 임박" value={`${d.today.expiring}명`} tone={d.today.expiring ? 'warn' : 'default'} href="/members" />
            <Stat label="노쇼 주의" value={`${d.today.no_show_risk}명`} tone={d.today.no_show_risk ? 'warn' : 'default'} href="/members" />
            <Stat label="미수금 회원" value={`${d.today.receivable_members}명`} tone={d.today.receivable_members ? 'warn' : 'default'} href="/finance" />
          </div>
        </Card>

        <Card title="처리할 일">
          {queue.length > 0 ? (
            <ul className="space-y-1.5">
              {queue.map((q, i) => (
                <li key={i}>
                  <Link href={q.href} className="group flex items-center gap-2.5 rounded-lg border border-line p-2.5 transition-colors hover:border-brand-200 hover:bg-muted">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_BG[q.tone]}`}>{q.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{q.label}</span>
                      <span className="block truncate text-xs text-slate-500">{q.detail}</span>
                    </span>
                    <Icons.chevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<Icons.check className="h-5 w-5" />} title="처리할 항목이 없습니다" description="오늘 급한 운영 이슈가 없어요." />
          )}
        </Card>
      </div>

      {/* 오늘 일정 + 빠른 작업 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="오늘 일정" className="lg:col-span-2" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {today.map((c) => {
              const full = c.booked >= c.capacity;
              const canceled = c.session.session_status === 'canceled';
              return (
                <li key={c.session.id}>
                  <Link href={`/sessions/${c.session.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="tnum text-sm font-semibold text-slate-700">{c.session.start_at.slice(11, 16)}</span>
                      <Badge value={c.session.class_type} tone={TYPE_TONE[c.session.class_type]} label={c.session.name} dot />
                      <span className="truncate text-xs text-slate-500">{c.instructor_name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {canceled ? <Badge value="canceled" label="폐강" /> : full ? <Badge tone="danger" label="만석" /> : null}
                      <span className="tnum text-slate-500">{c.booked}/{c.capacity}</span>
                      <Icons.chevronRight className="h-4 w-4 text-slate-300" />
                    </span>
                  </Link>
                </li>
              );
            })}
            {today.length === 0 ? (
              <li className="px-4">
                <EmptyState compact icon={<Icons.calendar className="h-5 w-5" />} title="오늘 등록된 수업이 없습니다" />
              </li>
            ) : null}
          </ul>
        </Card>

        <Card title="빠른 작업">
          <div className="flex flex-wrap gap-2">
            <AddMemberDialog />
            <Link href="/timetable" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Icons.calendar className="h-4 w-4" /> 예약 등록
            </Link>
            <Link href="/crm" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Icons.headset className="h-4 w-4" /> 상담 등록
            </Link>
            <Link href="/members" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Icons.ticket className="h-4 w-4" /> 수강권·결제
            </Link>
            <Link href="/finance" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Icons.wallet className="h-4 w-4" /> 지출 등록
            </Link>
            <Link href={`/timetable?view=day&date=${d.today_date}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Icons.check className="h-4 w-4" /> 출결 처리
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
