/**
 * 이중 손익 매출인식 — canon §4 (핵심 차별화).
 * 결제 1건 → 결제기준 매출 1건. 수강권 차감 1건 → 소진기준 매출 1건.
 * 환불 1건 → 결제기준 음수 1건. 두 기준은 절대 합산하지 않는다(중복 합산 금지).
 * 산식 상세: docs/spec/19-metrics.md
 */
import type {
  ClassType,
  ISODate,
  ISODateTime,
  MarketingSource,
  RevenueBasis,
  RevenueSourceType,
} from '../domain/index.js';

/** 매출 인식 레코드 초안(테넌트 스코프·id는 서비스가 부여) */
export interface RevenueDraft {
  member_id: string;
  revenue_basis: RevenueBasis;
  source_type: RevenueSourceType;
  payment_id?: string | null;
  pass_transaction_id?: string | null;
  product_id?: string | null;
  class_type?: ClassType | null;
  instructor_staff_id?: string | null;
  marketing_source?: MarketingSource;
  amount: number;
  recognized_at: ISODateTime;
  recognized_date: ISODate;
  is_new_member: boolean;
  is_re_enroll: boolean;
}

/** 소진기준 단가 = round(실판매가 / 총횟수). 총횟수 없으면 0(기간권은 소진 인식 안 함). */
export function computeUnitPrice(final_amount: number, total_count: number | null): number {
  if (!total_count || total_count <= 0) return 0;
  return Math.round(final_amount / total_count);
}

/**
 * 잔차 보정 소진 금액 — 누적 인식 목표의 차이로 계산해 소진 총합이 정확히 final_amount 가 되게 한다.
 * 잔여 r 일 때 누적 인식 = round(final*(total-r)/total). 차감/복구 모두 이 차이로 대칭 처리.
 * (라운딩 잔차는 마지막 회차에 자동 흡수)
 */
export function consumptionAmount(
  final_amount: number,
  total_count: number,
  remaining_before: number,
  remaining_after: number,
): number {
  const target = (r: number) => Math.round((final_amount * (total_count - r)) / total_count);
  return target(remaining_after) - target(remaining_before);
}

/** 결제 → 결제기준 매출(실수령액). canon §4.1 */
export function recognizePayment(args: {
  member_id: string;
  payment_id: string;
  product_id: string | null;
  paid_amount: number;
  recognized_at: ISODateTime;
  marketing_source?: MarketingSource;
  is_new_member: boolean;
  is_re_enroll: boolean;
}): RevenueDraft {
  return {
    member_id: args.member_id,
    revenue_basis: 'payment',
    source_type: 'payment',
    payment_id: args.payment_id,
    product_id: args.product_id,
    amount: args.paid_amount,
    recognized_at: args.recognized_at,
    recognized_date: args.recognized_at.slice(0, 10),
    marketing_source: args.marketing_source,
    is_new_member: args.is_new_member,
    is_re_enroll: args.is_re_enroll,
  };
}

/** 환불 → 결제기준 음수 매출. canon §4.1 (토글 무관, 항상 결제기준) */
export function recognizeRefund(args: {
  member_id: string;
  payment_id: string;
  product_id: string | null;
  refund_amount: number;
  recognized_at: ISODateTime;
  marketing_source?: MarketingSource;
}): RevenueDraft {
  return {
    member_id: args.member_id,
    revenue_basis: 'payment',
    source_type: 'refund',
    payment_id: args.payment_id,
    product_id: args.product_id,
    amount: -Math.abs(args.refund_amount),
    recognized_at: args.recognized_at,
    recognized_date: args.recognized_at.slice(0, 10),
    marketing_source: args.marketing_source,
    is_new_member: false,
    is_re_enroll: false,
  };
}

/**
 * 수강권 차감 → 소진기준 매출(단가). 수업유형·강사 귀속(수익성 분해 근거). canon §4.2
 * 복구(취소/폐강) 시 source_type='refund' 음수 조정으로 호출해 총매출에서 제외·순매출에서만 차감.
 */
export function recognizeConsumption(args: {
  member_id: string;
  pass_transaction_id: string;
  product_id: string | null;
  unit_price_amount: number; // 복구 시 음수
  class_type: ClassType | null;
  instructor_staff_id: string | null;
  recognized_at: ISODateTime;
  marketing_source?: MarketingSource;
  source_type?: RevenueSourceType; // 기본 'consumption', 복구 상쇄 시 'refund'
}): RevenueDraft {
  return {
    member_id: args.member_id,
    revenue_basis: 'consumption',
    source_type: args.source_type ?? 'consumption',
    pass_transaction_id: args.pass_transaction_id,
    product_id: args.product_id,
    class_type: args.class_type,
    instructor_staff_id: args.instructor_staff_id,
    amount: args.unit_price_amount,
    recognized_at: args.recognized_at,
    recognized_date: args.recognized_at.slice(0, 10),
    marketing_source: args.marketing_source,
    is_new_member: false,
    is_re_enroll: false,
  };
}
