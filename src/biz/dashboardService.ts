/**
 * 대시보드 — 관리자 4영역 + 수익분석(이중기준). canon §4.4 / docs/spec 09·10·19.
 * 매출은 항상 revenue_records 한 곳에서 basis별로만 합산(중복 합산 금지).
 */
import type { CostType, ExpenseCategory, ID, ISODate, RevenueBasis } from '../domain/index.js';
import { CLASS_TYPE_LABEL, EXPENSE_CATEGORY_LABEL, MARKETING_SOURCE_LABEL } from '../domain/index.js';
import { dateKST, monthRange, ymOf } from '../lib/util.js';
import { assertCan, can } from './authz.js';
import { currentStudio, scoped, scopedFind, type RequestContext } from './context.js';

function range(ctx: RequestContext, ym?: string) {
  return monthRange(ym ?? ymOf(dateKST(ctx.now)));
}

// ── 매출/비용 집계 (canon §4.4) ──────────────────────────────
function revenueIn(ctx: RequestContext, basis: RevenueBasis, r: { start: ISODate; end: ISODate }) {
  return scoped(ctx, ctx.db.revenue_records).filter(
    (rec) => rec.revenue_basis === basis && rec.recognized_date >= r.start && rec.recognized_date <= r.end,
  );
}

export function grossRevenue(ctx: RequestContext, basis: RevenueBasis, r: { start: ISODate; end: ISODate }): number {
  return revenueIn(ctx, basis, r)
    .filter((rec) => rec.source_type !== 'refund')
    .reduce((s, rec) => s + rec.amount, 0);
}

export function refundAmount(ctx: RequestContext, r: { start: ISODate; end: ISODate }): number {
  // 환불액은 결제기준 고정(canon §19 1.2). 소진기준 복구 상쇄(refund)는 제외.
  return scoped(ctx, ctx.db.revenue_records)
    .filter(
      (rec) =>
        rec.source_type === 'refund' &&
        rec.revenue_basis === 'payment' &&
        rec.recognized_date >= r.start &&
        rec.recognized_date <= r.end,
    )
    .reduce((s, rec) => s + Math.abs(rec.amount), 0);
}

/** 순매출 = Σ amount(선택 basis) — 환불 음수 포함 */
export function netRevenue(ctx: RequestContext, basis: RevenueBasis, r: { start: ISODate; end: ISODate }): number {
  return revenueIn(ctx, basis, r).reduce((s, rec) => s + rec.amount, 0);
}

/** basis별 환불/조정액(절대값) — P&L 표기 정합(gross − 이 값 = net)이 두 기준 모두 성립. */
export function basisRefund(ctx: RequestContext, basis: RevenueBasis, r: { start: ISODate; end: ISODate }): number {
  return revenueIn(ctx, basis, r)
    .filter((rec) => rec.source_type === 'refund')
    .reduce((s, rec) => s + Math.abs(rec.amount), 0);
}

export function totalExpense(ctx: RequestContext, r: { start: ISODate; end: ISODate }): number {
  return scoped(ctx, ctx.db.expense_records)
    .filter((e) => e.expense_date >= r.start && e.expense_date <= r.end)
    .reduce((s, e) => s + e.amount, 0);
}

export function expenseByCostType(ctx: RequestContext, type: CostType, r: { start: ISODate; end: ISODate }): number {
  return scoped(ctx, ctx.db.expense_records)
    .filter((e) => e.cost_type === type && e.expense_date >= r.start && e.expense_date <= r.end)
    .reduce((s, e) => s + e.amount, 0);
}

function expenseByCategory(ctx: RequestContext, cat: ExpenseCategory, r: { start: ISODate; end: ISODate }): number {
  return scoped(ctx, ctx.db.expense_records)
    .filter((e) => e.expense_category === cat && e.expense_date >= r.start && e.expense_date <= r.end)
    .reduce((s, e) => s + e.amount, 0);
}

export function receivableTotal(ctx: RequestContext): number {
  // 미수금 = receivable + partial (canon §4.4). 입금대기(awaiting_deposit)는 미수금 아님.
  return scoped(ctx, ctx.db.payments)
    .filter((p) => p.payment_status === 'receivable' || p.payment_status === 'partial')
    .reduce((s, p) => s + p.receivable_amount, 0);
}

export function undepositedCardSales(ctx: RequestContext): number {
  return scoped(ctx, ctx.db.card_sales)
    .filter((c) => c.reconciliation_stage !== 'deposited')
    .reduce((s, c) => s + c.net_deposit_amount, 0);
}

export function bankBalance(ctx: RequestContext): number {
  return scoped(ctx, ctx.db.bank_accounts).reduce((s, a) => s + a.balance_amount, 0);
}

// ── 관리자 대시보드 (4영역) ──────────────────────────────────
export interface AdminDashboard {
  today_date: ISODate;
  basis: RevenueBasis;
  today: { sessions: number; booked: number; open_seats: number; trials: number; new_leads: number; no_show_risk: number; expiring: number; receivable_members: number };
  sales: { gross: number; refund: number; net: number; personal: number; group: number; trial: number; new_member: number; re_enroll: number };
  cost: { total: number; fixed: number; variable: number; advertising: number; instructor_fee: number; payment_fee: number; rent: number; utilities: number; etc: number };
  profit: { operating: number; margin: number; bank_balance: number; undeposited_card: number; receivable: number; expected_expense: number; month_end_profit: number };
}

export function adminDashboard(ctx: RequestContext, basis: RevenueBasis = 'payment'): AdminDashboard {
  assertCan(ctx.role, 'revenue', 'read'); // canon §5: 매출 조회 권한(회원/인포 불가)
  const showBank = can(ctx.role, 'bank_balance', 'read'); // 강사는 통장잔액 불가 → 마스킹
  const today = dateKST(ctx.now);
  const r = range(ctx);
  const todaySessions = scoped(ctx, ctx.db.class_sessions).filter((s) => s.start_at.slice(0, 10) === today);
  const todayReservations = scoped(ctx, ctx.db.reservations).filter((res) => {
    const s = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === res.class_session_id);
    return s?.start_at.slice(0, 10) === today && (res.reservation_status === 'booked' || res.reservation_status === 'attended');
  });
  const capacity = todaySessions.reduce((s, x) => s + x.capacity, 0);

  const net = netRevenue(ctx, basis, r);
  const totalCost = totalExpense(ctx, r);
  const operating = net - totalCost;
  const consumptionByType = (ct: 'personal' | 'group' | 'trial') =>
    revenueIn(ctx, 'consumption', r).filter((x) => x.class_type === ct).reduce((s, x) => s + x.amount, 0);

  const forecast = forecastMonthEnd(ctx, basis);

  return {
    today_date: today,
    basis,
    today: {
      sessions: todaySessions.length,
      booked: todayReservations.length,
      open_seats: Math.max(0, capacity - todayReservations.length),
      trials: todaySessions.filter((s) => s.class_type === 'trial').length,
      new_leads: scoped(ctx, ctx.db.leads).filter((l) => l.inquiry_date === today).length,
      no_show_risk: scoped(ctx, ctx.db.members).filter((m) => (m.tags ?? []).includes('no_show_risk')).length,
      expiring: scoped(ctx, ctx.db.passes).filter((p) => {
        if (p.pass_status !== 'active') return false;
        const days = (new Date(p.expire_date).getTime() - new Date(today).getTime()) / 86400000;
        return days >= 0 && days <= currentStudio(ctx).policy_json.pass.expiring_alert_days;
      }).length,
      receivable_members: new Set(
        scoped(ctx, ctx.db.payments)
          .filter((p) => p.receivable_amount > 0 && (p.payment_status === 'receivable' || p.payment_status === 'partial'))
          .map((p) => p.member_id),
      ).size,
    },
    sales: {
      gross: grossRevenue(ctx, basis, r),
      refund: basisRefund(ctx, basis, r), // basis 일치(gross − refund = net)
      net,
      personal: basis === 'consumption' ? consumptionByType('personal') : 0,
      group: basis === 'consumption' ? consumptionByType('group') : 0,
      trial: basis === 'consumption' ? consumptionByType('trial') : 0,
      new_member: revenueIn(ctx, 'payment', r).filter((x) => x.is_new_member).reduce((s, x) => s + x.amount, 0),
      re_enroll: revenueIn(ctx, 'payment', r).filter((x) => x.is_re_enroll).reduce((s, x) => s + x.amount, 0),
    },
    cost: {
      total: totalCost,
      fixed: expenseByCostType(ctx, 'fixed', r),
      variable: expenseByCostType(ctx, 'variable', r),
      advertising: expenseByCategory(ctx, 'advertising', r),
      instructor_fee: expenseByCategory(ctx, 'instructor_fee', r),
      payment_fee: expenseByCategory(ctx, 'payment_fee', r),
      rent: expenseByCategory(ctx, 'rent', r),
      utilities: expenseByCategory(ctx, 'utilities', r),
      etc: expenseByCategory(ctx, 'etc', r),
    },
    profit: {
      operating,
      margin: net ? Math.round((operating / net) * 1000) / 10 : 0,
      bank_balance: showBank ? bankBalance(ctx) : 0,
      undeposited_card: undepositedCardSales(ctx),
      receivable: receivableTotal(ctx),
      expected_expense: forecast.expected_expense,
      month_end_profit: forecast.month_end_profit,
    },
  };
}

// ── 월말 예상 (run-rate) ─────────────────────────────────────
export function forecastMonthEnd(ctx: RequestContext, basis: RevenueBasis, ym?: string) {
  const r = range(ctx, ym);
  const nowYm = ymOf(dateKST(ctx.now));
  const targetYm = ym ?? nowYm;
  const today = dateKST(ctx.now);
  const daysInMonth = Number(r.end.slice(8, 10));
  // 과거월=마감(실적=예측, factor 1) / 미래월=경과 0 / 현재월=경과일 기준 run-rate
  let dayOfMonth: number;
  if (targetYm < nowYm) dayOfMonth = daysInMonth;
  else if (targetYm > nowYm) dayOfMonth = 0;
  else dayOfMonth = Number(today.slice(8, 10));
  // 가드: 경과일 3일 미만이면 과대추정 방지 위해 factor 1(실적 그대로 표기)
  const factor = dayOfMonth >= 3 ? daysInMonth / dayOfMonth : 1;
  const net = netRevenue(ctx, basis, r);
  const cost = totalExpense(ctx, r);
  const month_end_revenue = Math.round(net * factor);
  const expected_expense = Math.round(cost * factor);
  // 미수금은 전액 회수를 가정하지 않고 보수계수 적용(낙관 편향 제거). 미입금 카드는 정산 예정이라 전액.
  const RECEIVABLE_RECOVERY = 0.9;
  const expected_inflow = Math.round(receivableTotal(ctx) * RECEIVABLE_RECOVERY) + undepositedCardSales(ctx);
  return {
    factor: Math.round(factor * 100) / 100,
    month_end_revenue,
    expected_expense,
    month_end_profit: month_end_revenue - expected_expense,
    month_end_cash: bankBalance(ctx) + expected_inflow - (expected_expense - cost),
  };
}

// ── 수익분석 대시보드 (이중기준) ─────────────────────────────
export interface ProfitDashboard {
  ym: string;
  basis: RevenueBasis;
  pl: { gross: number; refund: number; net: number; fixed: number; variable: number; total_cost: number; operating: number; margin: number };
  cash: { bank_balance: number; undeposited_card: number; receivable: number };
  forecast: ReturnType<typeof forecastMonthEnd>;
  by_class_type: Array<{ class_type: string; label: string; revenue: number }>;
  by_instructor: Array<{ staff_id: ID; name: string; revenue: number }>;
  by_source: Array<{ source: string; label: string; revenue: number }>;
  members: { active_members: number; avg_revenue: number; cac: number; ltv: number; re_enroll_rate: number; trial_conversion: number };
}

export function profitDashboard(ctx: RequestContext, ym?: string, basis: RevenueBasis = 'payment'): ProfitDashboard {
  assertCan(ctx.role, 'revenue', 'read');
  const showBank = can(ctx.role, 'bank_balance', 'read');
  const r = range(ctx, ym);
  const net = netRevenue(ctx, basis, r);
  const fixed = expenseByCostType(ctx, 'fixed', r);
  const variable = expenseByCostType(ctx, 'variable', r);
  const total_cost = fixed + variable;
  const operating = net - total_cost;

  // 수익성 분해는 소진기준에서만 의미(상품 단위 결제기준은 수업 귀속 불가)
  const consumption = revenueIn(ctx, 'consumption', r);
  const byType = (['personal', 'group', 'trial'] as const).map((ct) => ({
    class_type: ct,
    label: CLASS_TYPE_LABEL[ct],
    revenue: consumption.filter((x) => x.class_type === ct).reduce((s, x) => s + x.amount, 0),
  }));
  const instructorMap = new Map<string, number>();
  for (const rec of consumption) {
    if (rec.instructor_staff_id) instructorMap.set(rec.instructor_staff_id, (instructorMap.get(rec.instructor_staff_id) ?? 0) + rec.amount);
  }
  const by_instructor = [...instructorMap.entries()].map(([staff_id, revenue]) => ({
    staff_id,
    name: scopedFind(ctx, ctx.db.staff, (s) => s.id === staff_id)?.name ?? '?',
    revenue,
  }));
  const sourceMap = new Map<string, number>();
  for (const rec of revenueIn(ctx, 'payment', r)) {
    if (rec.marketing_source) sourceMap.set(rec.marketing_source, (sourceMap.get(rec.marketing_source) ?? 0) + rec.amount);
  }
  const by_source = [...sourceMap.entries()].map(([source, revenue]) => ({
    source,
    label: MARKETING_SOURCE_LABEL[source as keyof typeof MARKETING_SOURCE_LABEL] ?? source,
    revenue,
  }));

  // 회원 단위
  const activeMembers = scoped(ctx, ctx.db.members).filter((m) => m.member_status === 'enrolled' || m.member_status === 're_enrolled');
  const newMembers = revenueIn(ctx, 'payment', r).filter((x) => x.is_new_member);
  const newMemberCount = new Set(newMembers.map((x) => x.member_id)).size;
  const adSpend = expenseByCategory(ctx, 'advertising', r);
  const paymentNet = netRevenue(ctx, 'payment', r);
  const leads = scoped(ctx, ctx.db.leads);
  // 체험전환율: 분모=기간내 체험완료, 분자=그 중 기간내 등록(trial_done 선행). canon/19 §7.2
  const trialDoneInRange = leads.filter((l) => l.trial_done_date && l.trial_done_date >= r.start && l.trial_done_date <= r.end);
  const enrolledFromTrial = leads.filter(
    (l) => l.trial_done_date && l.lead_status === 'enrolled' && l.enrolled_date && l.enrolled_date >= r.start && l.enrolled_date <= r.end,
  );
  const expiredOrRe = scoped(ctx, ctx.db.members).filter((m) => ['expired', 're_enrolled'].includes(m.member_status));
  const reEnrolled = scoped(ctx, ctx.db.members).filter((m) => m.member_status === 're_enrolled').length;
  const arpu = activeMembers.length ? Math.round(paymentNet / activeMembers.length) : 0;
  const LTV_RETENTION_MONTHS = 6; // 보수적 유지개월 가정(§9.5) — ARPU와 구분되는 추정치

  return {
    ym: ym ?? ymOf(dateKST(ctx.now)),
    basis,
    pl: { gross: grossRevenue(ctx, basis, r), refund: basisRefund(ctx, basis, r), net, fixed, variable, total_cost, operating, margin: net ? Math.round((operating / net) * 1000) / 10 : 0 },
    cash: { bank_balance: showBank ? bankBalance(ctx) : 0, undeposited_card: undepositedCardSales(ctx), receivable: receivableTotal(ctx) },
    forecast: forecastMonthEnd(ctx, basis, ym),
    by_class_type: byType,
    by_instructor,
    by_source,
    members: {
      active_members: activeMembers.length,
      avg_revenue: arpu, // 1인당 월평균 매출(ARPU)
      cac: newMemberCount ? Math.round(adSpend / newMemberCount) : 0,
      ltv: arpu * LTV_RETENTION_MONTHS, // ARPU × 가정 유지개월(추정)
      re_enroll_rate: expiredOrRe.length ? Math.round((reEnrolled / expiredOrRe.length) * 100) : 0,
      trial_conversion: trialDoneInRange.length ? Math.round((enrolledFromTrial.length / trialDoneInRange.length) * 100) : 0,
    },
  };
}
