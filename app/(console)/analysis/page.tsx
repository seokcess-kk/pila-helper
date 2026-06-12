import Link from 'next/link';
import type { ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import { assertCan, dateKST, profitDashboard, won, ymOf, type RevenueBasis } from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat, buttonVariants } from '../../components/ui';
import { BasisToggle } from '../../components/BasisToggle';
import { HBars, TrendBars, Waterfall } from '../../components/console/Charts';
import { Icons } from '../../components/icons';

export const dynamic = 'force-dynamic';

function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Metric({ label, value, hint, estimate = false }: { label: string; value: ReactNode; hint: string; estimate?: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3" title={hint}>
      <div className="flex items-center gap-1 text-xs text-slate-500">
        {label}
        <Icons.info className="h-3 w-3 text-slate-300" />
        {estimate ? <Badge tone="neutral" label="추정" className="ml-auto" /> : null}
      </div>
      <div className="mt-0.5 text-lg font-bold tnum text-slate-900">{value}</div>
    </div>
  );
}

export default function AnalysisPage({ searchParams }: { searchParams: { basis?: string } }) {
  const ctx = getContext();
  assertCan(ctx.role, 'expenses', 'read');
  const basis = (searchParams.basis === 'consumption' ? 'consumption' : 'payment') as RevenueBasis;
  const ym = ymOf(dateKST(ctx.now));
  const p = profitDashboard(ctx, ym, basis);

  const trend = Array.from({ length: 6 }, (_, i) => shiftYm(ym, -(5 - i))).map((m) => ({
    ym: m,
    value: profitDashboard(ctx, m, basis).pl.operating,
  }));

  const byType = [...p.by_class_type].filter((x) => x.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const byInstructor = [...p.by_instructor].sort((a, b) => b.revenue - a.revenue);
  const bySource = [...p.by_source].sort((a, b) => b.revenue - a.revenue);
  const isConsumption = basis === 'consumption';

  return (
    <div>
      <PageHeader title={`수익분석 — ${ym.replace('-', '년 ')}월`} actions={<BasisToggle basis={basis} path="/analysis" />} />

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-700">
        <Icons.info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {basis === 'payment'
            ? '결제기준: 돈이 들어온 날 매출로 인식 — 현금흐름·자금관리에 유리합니다.'
            : '소진기준: 수업을 쓴 날 그만큼만 매출로 인식 — 강사·수업 수익성 분석에 유리합니다.'}
        </span>
      </div>

      {/* 손익 흐름 + 추이 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="손익 흐름">
          <Waterfall net={p.pl.net} fixed={p.pl.fixed} variable={p.pl.variable} operating={p.pl.operating} format={won} />
        </Card>
        <Card title="영업이익 추이 (최근 6개월)">
          <TrendBars data={trend.map((t, i) => ({ label: t.ym.slice(5) + '월', value: t.value, highlight: i === 5 }))} format={won} />
        </Card>
      </div>

      {/* 현금 / 예측 */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="현금 흐름">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="통장 잔액" value={won(p.cash.bank_balance)} />
            <Stat label="미입금 카드" value={won(p.cash.undeposited_card)} tone={p.cash.undeposited_card ? 'warn' : 'default'} href="/finance/matching" />
            <Stat label="미수금" value={won(p.cash.receivable)} tone={p.cash.receivable ? 'warn' : 'default'} href="/finance/matching" />
          </div>
        </Card>
        <Card title="월말 예상" action={<span className="text-xs text-slate-400">현재까지 {p.forecast.factor}배 환산(추정)</span>}>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="예상 매출" value={won(p.forecast.month_end_revenue)} />
            <Stat label="예상 이익" value={won(p.forecast.month_end_profit)} tone={p.forecast.month_end_profit >= 0 ? 'pos' : 'neg'} />
            <Stat label="예상 현금잔고" value={won(p.forecast.month_end_cash)} />
          </div>
        </Card>
      </div>

      {/* 수익성 분해 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="수업유형별 (소진기준)">
          {isConsumption ? (
            <HBars rows={byType.map((x) => ({ label: x.label, value: x.revenue }))} format={won} showPct />
          ) : (
            <SwitchHint />
          )}
        </Card>
        <Card title="강사별 (소진기준)">
          {isConsumption ? (
            byInstructor.length > 0 ? (
              <HBars rows={byInstructor.map((x) => ({ label: x.name, value: x.revenue, color: 'bg-info' }))} format={won} showPct />
            ) : (
              <EmptyState compact icon={<Icons.staff className="h-5 w-5" />} title="데이터 없음" />
            )
          ) : (
            <SwitchHint />
          )}
        </Card>
        <Card title="유입경로별 매출 (결제기준)">
          {bySource.length > 0 ? (
            <HBars rows={bySource.map((x) => ({ label: x.label, value: x.revenue, color: 'bg-brand-400' }))} format={won} showPct />
          ) : (
            <EmptyState compact icon={<Icons.headset className="h-5 w-5" />} title="데이터 없음" />
          )}
        </Card>
      </div>

      {/* 회원 단위 지표 */}
      <Card title="회원 단위 지표" className="mt-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="활성 회원" value={`${p.members.active_members}명`} hint="등록완료·재등록완료 상태 회원 수" />
          <Metric label="1인당 평균매출" value={won(p.members.avg_revenue)} hint="활성회원 1인당 월평균 순매출(결제기준, ARPU)" />
          <Metric label="신규회원 CAC" value={won(p.members.cac)} hint="광고비 ÷ 이번 달 신규 등록 회원 수" />
          <Metric label="회원 LTV" value={won(p.members.ltv)} hint="ARPU × 가정 유지 6개월 — 추정치" estimate />
          <Metric label="재등록률" value={`${p.members.re_enroll_rate}%`} hint="만료·재등록 회원 중 재등록 비율" />
          <Metric label="체험 전환율" value={`${p.members.trial_conversion}%`} hint="이번 달 체험완료 중 등록 전환 비율" />
        </div>
      </Card>
    </div>
  );
}

function SwitchHint() {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p className="max-w-xs text-xs text-slate-500">수업유형·강사 수익성은 <b>소진기준</b>에서만 분석 가능합니다(결제기준은 상품 단위).</p>
      <Link href="/analysis?basis=consumption" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        소진기준으로 보기
      </Link>
    </div>
  );
}
