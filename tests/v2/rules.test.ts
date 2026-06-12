/**
 * v2 규칙 엔진 단위 테스트 — 차감 상태머신 · 예약 자격검증 · 이중기준 매출 · 환불.
 * canon §4, §6.1, §6.3 / docs/spec 14·16·19 와 정합.
 */
import { describe, expect, it } from 'vitest';
import { computeDeduction } from '../../src/rules/deduction.js';
import { checkEligibility, type PassCandidate } from '../../src/rules/booking.js';
import { computeUnitPrice, consumptionAmount, recognizeConsumption, recognizePayment, recognizeRefund } from '../../src/rules/revenue.js';
import { computeRefund } from '../../src/rules/refund.js';
import { DEFAULT_POLICY } from '../../src/domain/policy.js';

describe('차감 상태머신 (computeDeduction)', () => {
  const base = { no_show_deduct: true, late_cancel_deduct: true, is_count_pass: true } as const;

  it('예약시 차감 정책(on_booking): 예약에서 −1, 출석은 변화 없음', () => {
    const onBook = computeDeduction('book', { ...base, deduct_timing: 'on_booking', consumed: false });
    expect(onBook).toEqual({ delta: -1, reason: 'deduct_booking', consumed: true });
    const onAttend = computeDeduction('attend', { ...base, deduct_timing: 'on_booking', consumed: true });
    expect(onAttend.delta).toBe(0);
  });

  it('출석시 차감 정책(on_attend): 예약 0, 출석 −1', () => {
    expect(computeDeduction('book', { ...base, deduct_timing: 'on_attend', consumed: false }).delta).toBe(0);
    expect(computeDeduction('attend', { ...base, deduct_timing: 'on_attend', consumed: false })).toEqual({
      delta: -1,
      reason: 'deduct_attend',
      consumed: true,
    });
  });

  it('노쇼: 차감정책 true면 미차감분 차감, false면 차감분 복구', () => {
    expect(computeDeduction('no_show', { ...base, deduct_timing: 'on_attend', consumed: false }).delta).toBe(-1);
    const noDeduct = computeDeduction('no_show', { ...base, no_show_deduct: false, deduct_timing: 'on_booking', consumed: true });
    expect(noDeduct).toEqual({ delta: 1, reason: 'restore_cancel', consumed: false });
  });

  it('정상취소는 복구, 지각취소(차감정책)는 차감', () => {
    expect(computeDeduction('cancel', { ...base, deduct_timing: 'on_booking', consumed: true, is_late_cancel: false }).delta).toBe(1);
    expect(computeDeduction('cancel', { ...base, deduct_timing: 'on_attend', consumed: false, is_late_cancel: true }).delta).toBe(-1);
  });

  it('폐강은 차감분 전원 복구', () => {
    expect(computeDeduction('session_closed', { ...base, deduct_timing: 'on_booking', consumed: true }).delta).toBe(1);
  });

  it('기간/무제한권(is_count_pass=false)은 항상 차감 없음', () => {
    expect(computeDeduction('attend', { ...base, is_count_pass: false, deduct_timing: 'on_attend', consumed: false }).delta).toBe(0);
  });
});

describe('예약 자격검증 (checkEligibility)', () => {
  const now = new Date('2026-06-12T09:00:00+09:00');
  const groupPass: PassCandidate = {
    id: 'pass_g',
    class_types: ['group'],
    remaining_count: 3,
    start_date: '2026-06-01',
    expire_date: '2026-07-31',
  };
  const session = {
    id: 'sess_1',
    class_type: 'group' as const,
    start_at: '2026-06-12T18:00:00+09:00',
    capacity: 6,
    booked_count: 2,
    is_canceled: false,
  };
  const baseInput = {
    now,
    session,
    policy: DEFAULT_POLICY.booking,
    passes: [groupPass],
    bookings_on_date: 0,
    has_duplicate: false,
  };

  it('정상: 자격 충족 + 빈자리 → ok, 수강권 선택', () => {
    const r = checkEligibility(baseInput);
    expect(r.ok).toBe(true);
    expect(r.waitlist).toBe(false);
    expect(r.selected_pass_id).toBe('pass_g');
  });

  it('만석: 자격 충족하나 → waitlist', () => {
    const r = checkEligibility({ ...baseInput, session: { ...session, booked_count: 6 } });
    expect(r.ok).toBe(false);
    expect(r.waitlist).toBe(true);
    expect(r.selected_pass_id).toBe('pass_g');
  });

  it('스코프 불일치: 그룹권으로 개인수업 불가', () => {
    const r = checkEligibility({ ...baseInput, session: { ...session, class_type: 'personal' } });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('scope_mismatch');
  });

  it('잔여 0 → no_remaining', () => {
    const r = checkEligibility({ ...baseInput, passes: [{ ...groupPass, remaining_count: 0 }] });
    expect(r.reasons).toContain('no_remaining');
  });

  it('수강권 없음 → no_pass', () => {
    const r = checkEligibility({ ...baseInput, passes: [] });
    expect(r.reasons).toContain('no_pass');
  });

  it('1일 한도 초과 → daily_limit', () => {
    const r = checkEligibility({ ...baseInput, bookings_on_date: 1 });
    expect(r.reasons).toContain('daily_limit');
  });

  it('중복 예약 → duplicate', () => {
    const r = checkEligibility({ ...baseInput, has_duplicate: true });
    expect(r.reasons).toContain('duplicate');
  });

  it('예약 마감(시작 30분 전, 마감 60분) → closed', () => {
    const r = checkEligibility({ ...baseInput, now: new Date('2026-06-12T17:45:00+09:00') });
    expect(r.reasons).toContain('closed');
  });
});

describe('이중기준 매출인식 (revenue)', () => {
  it('단가 = round(실판매가/총횟수)', () => {
    expect(computeUnitPrice(300000, 10)).toBe(30000);
    expect(computeUnitPrice(100000, 3)).toBe(33333);
    expect(computeUnitPrice(100000, null)).toBe(0);
  });

  it('결제기준: 실수령액 양수', () => {
    const d = recognizePayment({
      member_id: 'm1', payment_id: 'pay1', product_id: 'prod1', paid_amount: 300000,
      recognized_at: '2026-06-12T10:00:00+09:00', is_new_member: true, is_re_enroll: false,
    });
    expect(d.revenue_basis).toBe('payment');
    expect(d.source_type).toBe('payment');
    expect(d.amount).toBe(300000);
    expect(d.recognized_date).toBe('2026-06-12');
  });

  it('환불: 결제기준 음수 고정', () => {
    const d = recognizeRefund({ member_id: 'm1', payment_id: 'pay1', product_id: 'prod1', refund_amount: 50000, recognized_at: '2026-06-20T10:00:00+09:00' });
    expect(d.revenue_basis).toBe('payment');
    expect(d.source_type).toBe('refund');
    expect(d.amount).toBe(-50000);
  });

  it('소진기준: 단가 + 수업유형·강사 귀속', () => {
    const d = recognizeConsumption({
      member_id: 'm1', pass_transaction_id: 'pt1', product_id: 'prod1', unit_price_amount: 30000,
      class_type: 'group', instructor_staff_id: 'staff2', recognized_at: '2026-06-12T11:00:00+09:00',
    });
    expect(d.revenue_basis).toBe('consumption');
    expect(d.class_type).toBe('group');
    expect(d.instructor_staff_id).toBe('staff2');
    expect(d.amount).toBe(30000);
  });

  it('잔차 보정(consumptionAmount): 비정수 단가도 소진 총합 = 결제액', () => {
    const final = 100000, total = 3;
    let sum = 0;
    for (let r = total - 1; r >= 0; r--) sum += consumptionAmount(final, total, r + 1, r); // 차감 누적
    expect(sum).toBe(100000);
    // 복구는 대칭(부호 반대)
    expect(consumptionAmount(final, total, 1, 2)).toBe(-consumptionAmount(final, total, 2, 1));
  });

  it('결제기준 총합 = 소진기준 총합 (환불·잔차 없을 때)', () => {
    const final = 300000, total = 10;
    const unit = computeUnitPrice(final, total);
    const payment = recognizePayment({ member_id: 'm1', payment_id: 'p', product_id: 'pr', paid_amount: final, recognized_at: '2026-06-01T00:00:00+09:00', is_new_member: true, is_re_enroll: false });
    const consumptionTotal = unit * total;
    expect(payment.amount).toBe(consumptionTotal); // 30000*10 = 300000
  });
});

describe('환불 계산 (computeRefund)', () => {
  it('10회권 30만원 중 3회 사용 → 사용분 9만 공제, 위약 10%', () => {
    const r = computeRefund({
      list_amount: 300000, final_amount: 300000, total_count: 10, remaining_count: 7,
      policy: { refund_penalty_rate: 0.1, refund_unit_basis: 'list_price' },
    });
    expect(r.used_count).toBe(3);
    expect(r.unit_price).toBe(30000);
    expect(r.used_value).toBe(90000);
    expect(r.refundable_base).toBe(210000);
    expect(r.penalty_amount).toBe(21000);
    expect(r.refund_amount).toBe(189000);
  });

  it('기간권(총횟수 null): 사용분 공제 없이 위약금만', () => {
    const r = computeRefund({
      list_amount: 350000, final_amount: 350000, total_count: null, remaining_count: null,
      policy: { refund_penalty_rate: 0.1, refund_unit_basis: 'list_price' },
    });
    expect(r.used_value).toBe(0);
    expect(r.penalty_amount).toBe(35000);
    expect(r.refund_amount).toBe(315000);
  });

  it('전부 소진 시 환불 0', () => {
    const r = computeRefund({
      list_amount: 300000, final_amount: 300000, total_count: 10, remaining_count: 0,
      policy: { refund_penalty_rate: 0.1, refund_unit_basis: 'list_price' },
    });
    expect(r.refund_amount).toBe(0);
  });
});
