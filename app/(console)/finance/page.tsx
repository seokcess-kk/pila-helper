import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import {
  activeExpenseCategories,
  adminDashboard,
  assertCan,
  COST_TYPE_LABEL,
  dateKST,
  EXPENSE_CATEGORY_LABEL,
  expenseCategoryNames,
  listExpenses,
  monthRange,
  PAYMENT_METHOD_LABEL,
  profitDashboard,
  scoped,
  won,
  ymOf,
  type ExpenseCategory,
  type RevenueBasis,
} from '@/biz/index.js';
import {
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  TR,
  buttonVariants,
} from '../../components/ui';
import { BasisToggle } from '../../components/BasisToggle';
import { HBars, TrendBars } from '../../components/console/Charts';
import { Icons } from '../../components/icons';
import { addExpenseAction, deleteExpenseAction } from '../../actions';

export const dynamic = 'force-dynamic';

const COST_COLORS: Record<string, string> = {
  rent: 'bg-brand-500',
  instructor_fee: 'bg-warning',
  advertising: 'bg-info',
  payment_fee: 'bg-danger',
  utilities: 'bg-success',
  etc: 'bg-slate-400',
};

function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
function mom(cur: number, prev: number, higherIsGood = true) {
  if (prev === 0) return cur === 0 ? { dir: 'flat' as const, value: '—', good: true } : { dir: 'up' as const, value: '신규', good: higherIsGood };
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  const dir = pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const);
  return { dir, value: `${pct > 0 ? '+' : ''}${pct}% 전월`, good: pct === 0 ? true : pct > 0 === higherIsGood };
}

export default function FinancePage({ searchParams }: { searchParams: { basis?: string } }) {
  const ctx = getContext();
  assertCan(ctx.role, 'expenses', 'read'); // 메뉴 클로킹 일치 — 직접 URL 접근 차단
  const basis = (searchParams.basis === 'consumption' ? 'consumption' : 'payment') as RevenueBasis;
  const ym = ymOf(dateKST(ctx.now));
  const r = monthRange(ym);
  const d = adminDashboard(ctx, basis);
  const cur = profitDashboard(ctx, ym, basis);
  const prev = profitDashboard(ctx, shiftYm(ym, -1), basis);

  // 추이(최근 6개월)
  const trend = Array.from({ length: 6 }, (_, i) => shiftYm(ym, -(5 - i))).map((m) => {
    const p = profitDashboard(ctx, m, basis);
    return { ym: m, net: p.pl.net, operating: p.pl.operating };
  });

  // 매출 구성
  const salesRows =
    basis === 'consumption'
      ? [
          { label: '1:1 개인', value: d.sales.personal, color: 'bg-warning' },
          { label: '그룹', value: d.sales.group, color: 'bg-info' },
          { label: '체험', value: d.sales.trial, color: 'bg-brand-400' },
        ].filter((x) => x.value > 0)
      : [
          { label: '신규 등록', value: d.sales.new_member, color: 'bg-brand-500' },
          { label: '재등록', value: d.sales.re_enroll, color: 'bg-success' },
        ].filter((x) => x.value > 0);

  // 비용 구성(카테고리) — 라벨은 편집된 카테고리명 반영(입력폼·내역과 일관)
  const catNames = expenseCategoryNames(ctx);
  const costRows = (['rent', 'instructor_fee', 'advertising', 'payment_fee', 'utilities', 'etc'] as const)
    .map((c) => ({ label: catNames[c] ?? EXPENSE_CATEGORY_LABEL[c], value: d.cost[c], color: COST_COLORS[c] }))
    .filter((x) => x.value > 0);

  // 결제수단별(결제기준, 당월 입금)
  const methodMap = new Map<string, number>();
  for (const p of scoped(ctx, ctx.db.payments)) {
    if ((p.paid_at ?? '').slice(0, 7) === ym && p.paid_amount > 0)
      methodMap.set(p.payment_method, (methodMap.get(p.payment_method) ?? 0) + p.paid_amount);
  }
  const methodRows = [...methodMap].map(([m, v]) => ({ label: PAYMENT_METHOD_LABEL[m as keyof typeof PAYMENT_METHOD_LABEL], value: v }));

  const expenses = listExpenses(ctx, r);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseCats = activeExpenseCategories(ctx); // 입력 폼 옵션(활성만)
  const queue = d.profit.undeposited_card; // 표시용

  return (
    <div>
      <PageHeader title="손익 · 비용" sub={`${ym.replace('-', '년 ')}월 기준`} actions={<BasisToggle basis={basis} path="/finance" />} />

      {/* 핵심 KPI */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={`순매출 (${basis === 'payment' ? '결제기준' : '소진기준'})`} value={won(cur.pl.net)} delta={mom(cur.pl.net, prev.pl.net)} />
        <KpiCard label="총비용" value={won(cur.pl.total_cost)} delta={mom(cur.pl.total_cost, prev.pl.total_cost, false)} />
        <KpiCard
          label="영업이익"
          value={`${cur.pl.operating >= 0 ? '+' : ''}${won(cur.pl.operating)}`}
          tone={cur.pl.operating >= 0 ? 'pos' : 'neg'}
          delta={mom(cur.pl.operating, prev.pl.operating)}
          sub={`이익률 ${cur.pl.margin}%`}
          emphasis
        />
        <KpiCard label="통장 잔액" value={won(cur.cash.bank_balance)} sub={`월말 예상 ${won(cur.forecast.month_end_cash)}`} href="/finance/matching" />
      </div>

      {/* 보조 지표 */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="총매출" value={won(d.sales.gross)} />
        <Stat label="환불" value={`−${won(d.sales.refund)}`} tone={d.sales.refund ? 'neg' : 'default'} />
        <Stat label="고정비" value={won(cur.pl.fixed)} />
        <Stat label="변동비" value={won(cur.pl.variable)} />
        <Stat label="미수금" value={won(cur.cash.receivable)} tone={cur.cash.receivable ? 'warn' : 'default'} href="/finance/matching" />
        <Stat label="미입금 카드" value={won(cur.cash.undeposited_card)} tone={cur.cash.undeposited_card ? 'warn' : 'default'} href="/finance/matching" />
      </div>

      {queue > 0 ? (
        <Link href="/finance/matching" className="mb-4 flex items-center gap-2 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-fg hover:bg-warning-soft/70">
          <Icons.matching className="h-4 w-4" />
          미입금·미분류 거래가 있습니다 — 통장/카드 매칭에서 처리하세요
          <Icons.chevronRight className="ml-auto h-4 w-4" />
        </Link>
      ) : null}

      {/* 구성 분해 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={`매출 구성 (${basis === 'payment' ? '결제기준' : '소진기준'})`}>
          <HBars rows={salesRows} format={won} showPct />
        </Card>
        <Card title="비용 구성">
          <HBars rows={costRows} format={won} showPct />
        </Card>
        <Card title="결제수단별 입금">
          <HBars rows={methodRows} format={won} showPct />
        </Card>
      </div>

      {/* 추이 */}
      <Card title="월별 추이 (순매출 · 영업이익)" className="mt-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">순매출</div>
            <TrendBars data={trend.map((t, i) => ({ label: t.ym.slice(5) + '월', value: t.net, highlight: i === 5 }))} format={won} />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">영업이익</div>
            <TrendBars data={trend.map((t, i) => ({ label: t.ym.slice(5) + '월', value: t.operating, highlight: i === 5 }))} format={won} />
          </div>
        </div>
      </Card>

      {/* 비용 입력 + 내역 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="비용 입력">
          <form action={addExpenseAction} className="space-y-2.5 text-sm">
            <select name="expense_category" aria-label="비용 카테고리" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2">
              {expenseCats.map((c) => (
                <option key={c.id} value={c.code}>{c.name_ko}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input name="amount" type="number" inputMode="numeric" placeholder="금액" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" />
              <select name="cost_type" aria-label="성격" className="w-28 rounded-lg border border-line-strong bg-surface px-2 py-2">
                <option value="">성격 자동</option>
                <option value="fixed">고정비</option>
                <option value="variable">변동비</option>
              </select>
            </div>
            <input name="vendor_name" placeholder="거래처" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" />
            <input name="expense_date" type="date" defaultValue={dateKST(ctx.now)} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" />
            <input name="doc_memo" placeholder="증빙 메모(세금계산서·영수증 등)" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" />
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" name="is_recurring" className="accent-brand-600" /> 매월 반복되는 고정 지출
            </label>
            <button className={`${buttonVariants({ variant: 'primary', size: 'md' })} w-full`}>비용 추가</button>
          </form>
        </Card>

        <Card title="이번 달 비용 내역" className="lg:col-span-2" bodyClassName="p-0" action={<span className="text-sm text-slate-500">합계 {won(expenseTotal)}</span>}>
          {expenses.length > 0 ? (
            <Table>
              <THead>
                <Th>날짜</Th>
                <Th>카테고리</Th>
                <Th>거래처</Th>
                <Th>성격</Th>
                <Th className="text-right">금액</Th>
                <Th></Th>
              </THead>
              <TBody>
                {expenses.map((e) => (
                  <TR key={e.id}>
                    <Td className="tnum text-slate-500">{e.expense_date.slice(5)}</Td>
                    <Td className="font-medium text-slate-800">
                      {catNames[e.expense_category] ?? EXPENSE_CATEGORY_LABEL[e.expense_category as ExpenseCategory]}
                      {e.is_recurring ? <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-slate-500">반복</span> : null}
                    </Td>
                    <Td className="text-slate-500">{e.vendor_name ?? '-'}</Td>
                    <Td className="text-xs text-slate-400">{COST_TYPE_LABEL[e.cost_type]}</Td>
                    <Td className="tnum text-right">{won(e.amount)}</Td>
                    <Td className="text-right">
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expense_id" value={e.id} />
                        <button aria-label="삭제" className="rounded-md p-1 text-slate-300 hover:bg-danger-soft hover:text-danger-fg">
                          <Icons.trash className="h-4 w-4" />
                        </button>
                      </form>
                    </Td>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-4"><EmptyState icon={<Icons.wallet className="h-6 w-6" />} title="이번 달 비용이 없습니다" description="왼쪽에서 첫 비용을 입력하거나, 통장/카드 매칭으로 자동 분류하세요." /></div>
          )}
        </Card>
      </div>
    </div>
  );
}
