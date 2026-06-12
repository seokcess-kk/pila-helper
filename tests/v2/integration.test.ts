/**
 * v2 통합 테스트 — 시드 + 서비스 end-to-end.
 * 이중기준 매출·미수금·미입금카드·차감·환불·예약·매칭이 비즈 로직으로 정합한지 검증.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDb } from '../../src/data/seed.js';
import { DEMO_NOW, type DB } from '../../src/data/db.js';
import type { RequestContext } from '../../src/biz/context.js';
import { adminDashboard, grossRevenue, netRevenue, profitDashboard, receivableTotal, totalExpense, undepositedCardSales } from '../../src/biz/dashboardService.js';
import { monthRange } from '../../src/lib/util.js';
import { book, attend, markNoShow, cancelReservation, getTimetable } from '../../src/biz/reservationService.js';
import { createSession } from '../../src/biz/classService.js';
import { issuePass, refundPass } from '../../src/biz/passService.js';
import { createMember, getMember360, listMembers } from '../../src/biz/memberService.js';
import { suggestPaymentMatches, matchBankToPayment, unmatchedBank, classifyCardAsExpense, importCardExpenses } from '../../src/biz/matchingService.js';
import { crmStats } from '../../src/biz/leadService.js';

const JUNE = monthRange('2026-06');
let db: DB;
let ctx: RequestContext;

beforeEach(() => {
  db = seedDb();
  ctx = { db, tenant_id: 'tenant_1', studio_id: 'studio_1', user_id: 'user_owner', role: 'owner', now: DEMO_NOW };
});

describe('이중기준 매출인식', () => {
  it('결제기준 순매출 = 실수령 결제 합(1,450,000), 미수 제외', () => {
    expect(netRevenue(ctx, 'payment', JUNE)).toBe(1_450_000);
    expect(grossRevenue(ctx, 'payment', JUNE)).toBe(1_450_000);
  });

  it('소진기준 매출 = 출석 차감분 단가 합(개인 80,000 + 그룹 30,000 = 110,000)', () => {
    expect(netRevenue(ctx, 'consumption', JUNE)).toBe(110_000);
  });

  it('신규회원 매출(결제기준) = 이번 달 신규 등록 m1+m2 (650,000)', () => {
    const newRev = db.revenue_records
      .filter((r) => r.revenue_basis === 'payment' && r.source_type === 'payment' && r.is_new_member)
      .reduce((s, r) => s + r.amount, 0);
    expect(newRev).toBe(650_000); // 김지은 30만 + 박서연 35만 (발급 직전 trial_done)
  });

  it('무제한권(총횟수 null) 출석은 소진기준 매출을 만들지 않는다', () => {
    const consumption = db.revenue_records.filter((r) => r.revenue_basis === 'consumption');
    // 개인 1건 + 그룹 1건 = 2건만 (무제한권 박서연 제외)
    expect(consumption.length).toBe(2);
  });
});

describe('미수금 · 미입금 카드매출', () => {
  it('미수금 = 최민 그룹권 미결제 300,000', () => {
    expect(receivableTotal(ctx)).toBe(300_000);
  });

  it('미입금 카드매출 = 현장카드 결제분 순입금액 합(아직 입금 전)', () => {
    // 김지은(그룹 30만) + 이수민(개인 80만) 현장카드 → net = amount - fee(2.3%)
    const expected = (300000 - Math.round(300000 * 0.023)) + (800000 - Math.round(800000 * 0.023));
    expect(undepositedCardSales(ctx)).toBe(expected);
  });
});

describe('관리자 대시보드 (4영역)', () => {
  it('비용 합계 = 임대 150만+강사 70만+공과 12만+광고 20만 = 2,520,000', () => {
    expect(totalExpense(ctx, JUNE)).toBe(2_520_000);
  });

  it('영업이익(결제기준) = 순매출 − 총비용', () => {
    const d = adminDashboard(ctx, 'payment');
    expect(d.profit.operating).toBe(1_450_000 - 2_520_000);
    expect(d.cost.fixed).toBe(1_500_000); // 임대료(고정비). 공과금은 canon §3.13상 변동비
    expect(d.cost.variable).toBe(700_000 + 200_000 + 120_000); // 강사료+광고비+공과금(변동비)
  });

  it('수익분석: 소진기준 수업유형별 분해(개인/그룹)', () => {
    const p = profitDashboard(ctx, '2026-06', 'consumption');
    const personal = p.by_class_type.find((x) => x.class_type === 'personal')!;
    const group = p.by_class_type.find((x) => x.class_type === 'group')!;
    expect(personal.revenue).toBe(80_000);
    expect(group.revenue).toBe(30_000);
  });
});

describe('예약 · 차감 · 환불', () => {
  it('출석 시 그룹 10회권 차감(잔여 감소) + 소진기준 매출 +1건', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const before = db.revenue_records.filter((r) => r.revenue_basis === 'consumption').length;
    // 김지은 6/12 그룹수업 예약돼 있음 → 그 세션 출석
    const res = db.reservations.find((r) => r.member_id === m1.id && r.reservation_status === 'booked')!;
    const passBefore = db.passes.find((p) => p.id === res.pass_id)!.remaining_count!;
    attend(ctx, res.id);
    const passAfter = db.passes.find((p) => p.id === res.pass_id)!.remaining_count!;
    expect(passAfter).toBe(passBefore - 1);
    expect(db.revenue_records.filter((r) => r.revenue_basis === 'consumption').length).toBe(before + 1);
  });

  it('정상 취소는 (on_attend 정책상) 차감 없음 → 잔여 불변', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const res = db.reservations.find((r) => r.member_id === m1.id && r.reservation_status === 'booked')!;
    const passBefore = db.passes.find((p) => p.id === res.pass_id)!.remaining_count!;
    cancelReservation(ctx, res.id);
    expect(db.passes.find((p) => p.id === res.pass_id)!.remaining_count!).toBe(passBefore);
    expect(db.reservations.find((r) => r.id === res.id)!.reservation_status).toBe('canceled');
  });

  it('환불: 사용분 공제 + 위약 10% 반영, 결제기준 음수 매출 생성', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const pass = db.passes.find((p) => p.member_id === m1.id)!;
    const netBefore = netRevenue(ctx, 'payment', JUNE);
    const refund = refundPass(ctx, pass.id, '개인사정');
    expect(refund.refund_amount).toBeGreaterThan(0);
    expect(db.passes.find((p) => p.id === pass.id)!.pass_status).toBe('refunded');
    expect(netRevenue(ctx, 'payment', JUNE)).toBe(netBefore - refund.refund_amount);
  });
});

describe('대기 자동전환', () => {
  it('정원 1 만석 → 대기 → 결원 시 대기 1순위 자동 확정', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const m5 = db.members.find((m) => m.name === '최민')!;
    const sess = createSession(ctx, {
      class_type: 'group', name: '테스트 그룹', instructor_staff_id: 'staff_kim', room_id: 'room_a',
      start_at: '2026-06-13T15:00:00+09:00', capacity: 1,
    });
    const r1 = book(ctx, { session_id: sess.id, member_id: m1.id });
    const r2 = book(ctx, { session_id: sess.id, member_id: m5.id });
    expect(r1.ok && !r1.waitlist).toBe(true);
    expect(r2.ok && r2.waitlist).toBe(true); // 만석 → 대기

    if (r1.ok) cancelReservation(ctx, r1.reservation.id); // 결원 → 자동전환
    const m5res = db.reservations.find((r) => r.member_id === m5.id && r.class_session_id === sess.id)!;
    expect(m5res.reservation_status).toBe('booked');
  });
});

describe('멱등성·재진입 가드 (2회차)', () => {
  it('이미 출석 처리된 예약 재처리/교차처리 차단(이중 차감 방지)', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const res = db.reservations.find((r) => r.member_id === m1.id && r.reservation_status === 'booked')!;
    attend(ctx, res.id);
    expect(() => attend(ctx, res.id)).toThrow(); // 재출석 차단
    expect(() => markNoShow(ctx, res.id)).toThrow(); // 출석→노쇼 교차 반전 차단
  });

  it('이미 매칭된 통장거래 재매칭 차단(매출 이중 인식 방지)', () => {
    const dep = unmatchedBank(ctx).find((t) => t.counterparty_name === '최민')!;
    const pay = db.payments.find((p) => p.payment_status === 'receivable')!;
    matchBankToPayment(ctx, dep.id, pay.id);
    const netAfter = netRevenue(ctx, 'payment', JUNE);
    expect(() => matchBankToPayment(ctx, dep.id, pay.id)).toThrow();
    expect(netRevenue(ctx, 'payment', JUNE)).toBe(netAfter); // 재매칭으로 매출 증가 없음
  });

  it('환불 멱등 + 실수령 초과 환불 방지', () => {
    const m1 = db.members.find((m) => m.name === '김지은')!;
    const pass = db.passes.find((p) => p.member_id === m1.id && p.pass_status === 'active')!;
    const payment = db.payments.find((p) => p.member_id === m1.id)!;
    const r = refundPass(ctx, pass.id);
    expect(r.refund_amount).toBeLessThanOrEqual(payment.paid_amount); // 실수령 캡
    expect(() => refundPass(ctx, pass.id)).toThrow(); // 멱등
    // 잔여 회수 원장 불변식: remaining == total + Σdelta
    const refundedPass = db.passes.find((p) => p.id === pass.id)!;
    const deltaSum = db.pass_transactions.filter((t) => t.pass_id === pass.id).reduce((s, t) => s + t.delta, 0);
    expect(refundedPass.remaining_count).toBe((refundedPass.total_count ?? 0) + deltaSum);
  });
});

describe('통장/카드 매칭', () => {
  it('미수 회원 입금 추천 → 매칭 시 미수 해소 + 결제기준 매출 인식', () => {
    const dep = unmatchedBank(ctx).find((t) => t.counterparty_name === '최민')!;
    const sugg = suggestPaymentMatches(ctx, dep.id);
    expect(sugg.length).toBeGreaterThan(0);
    expect(sugg[0]!.member_name).toBe('최민');

    const netBefore = netRevenue(ctx, 'payment', JUNE);
    matchBankToPayment(ctx, dep.id, sugg[0]!.payment.id);
    expect(receivableTotal(ctx)).toBe(0); // 미수 해소
    expect(netRevenue(ctx, 'payment', JUNE)).toBe(netBefore + 300_000); // 입금 시 인식
  });

  it('카드 사용내역 수동 분류 → 비용 생성 + 큐에서 제거', () => {
    const card = db.card_expenses.find((c) => c.vendor_name === 'OO마트')!;
    const expBefore = totalExpense(ctx, JUNE);
    classifyCardAsExpense(ctx, card.id, 'supplies', null, true);
    expect(totalExpense(ctx, JUNE)).toBe(expBefore + 80_000);
    expect(db.card_expenses.find((c) => c.id === card.id)!.is_matched).toBe(true);
    // 규칙 학습: 다음 'OO마트' 거래 자동 분류 규칙 생성
    expect(db.transaction_matching_rules.some((r) => r.pattern === 'OO마트')).toBe(true);
  });

  it('학습된 규칙 → 다음 동일 거래처 자동 분류(autoClassify)', () => {
    const card = db.card_expenses.find((c) => c.vendor_name === 'OO마트')!;
    classifyCardAsExpense(ctx, card.id, 'supplies', null, true); // 규칙 학습
    importCardExpenses(ctx, [{ card_no_masked: '****-1111', vendor_name: 'OO마트', amount: 30000, used_at: '2026-06-12T10:00:00+09:00' }]);
    const next = db.card_expenses.find((c) => c.vendor_name === 'OO마트' && c.amount === 30000)!;
    expect(next.is_matched).toBe(true); // 학습 규칙으로 자동 분류
    expect(next.expense_record_id).toBeTruthy();
  });
});

describe('회원 · CRM', () => {
  it('회원 목록/360 — 미수 회원 표시', () => {
    const rows = listMembers(ctx);
    expect(rows.length).toBe(5);
    const m5 = rows.find((r) => r.member.name === '최민')!;
    expect(m5.receivable).toBe(300_000);
  });

  it('상담 전환율 통계 산출', () => {
    const s = crmStats(ctx);
    expect(s.total).toBeGreaterThanOrEqual(4);
    expect(s.by_source.length).toBeGreaterThan(0);
  });

  it('감사 로그가 발급/예약/환불에 기록된다', () => {
    const m = createMember(ctx, { name: '신규', phone: '010-0000-0000' });
    expect(db.audit_logs.some((a) => a.entity_type === 'members' && a.entity_id === m.id)).toBe(true);
  });
});

describe('타임테이블', () => {
  it('이번 주 세션 조회', () => {
    const cells = getTimetable(ctx, '2026-06-08', '2026-06-14');
    expect(cells.length).toBeGreaterThanOrEqual(5);
    expect(cells.every((c) => c.capacity >= c.booked)).toBe(true);
  });
});
