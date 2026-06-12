/**
 * 환불 계산 — canon §6.3 · docs/spec/16-payment-refund-policy.md.
 * 환불액 = 실판매가 − 사용분 가치 − 위약금. 사용분 단가 기준은 정책(list_price/final_price).
 * 순수 함수.
 */
import type { FinancePolicy } from '../domain/index.js';

export interface RefundInput {
  list_amount: number; // 정가
  final_amount: number; // 실판매가(결제액)
  total_count: number | null; // 횟수권 총횟수(null=기간권)
  remaining_count: number | null; // 잔여(null=기간권)
  policy: Pick<FinancePolicy, 'refund_penalty_rate' | 'refund_unit_basis'>;
}

export interface RefundResult {
  used_count: number;
  unit_price: number; // 사용분 공제 단가
  used_value: number; // 사용분 가치(공제액)
  refundable_base: number; // 위약금 전 환불 가능액
  penalty_amount: number; // 위약금
  refund_amount: number; // 실제 환불액
  restored_count: number; // 환불로 소멸되는 잔여횟수(정보)
}

export function computeRefund(input: RefundInput): RefundResult {
  const { list_amount, final_amount, total_count, remaining_count, policy } = input;

  // 기간권(총횟수 없음): 사용분 공제 없이 위약금만
  if (total_count === null || remaining_count === null || total_count <= 0) {
    const refundable_base = Math.max(0, final_amount);
    const penalty_amount = Math.round(refundable_base * policy.refund_penalty_rate);
    return {
      used_count: 0,
      unit_price: 0,
      used_value: 0,
      refundable_base,
      penalty_amount,
      refund_amount: Math.max(0, refundable_base - penalty_amount),
      restored_count: 0,
    };
  }

  const used_count = Math.max(0, total_count - remaining_count);
  const basisAmount = policy.refund_unit_basis === 'list_price' ? list_amount : final_amount;
  const unit_price = Math.round(basisAmount / total_count);
  const used_value = used_count * unit_price;
  const refundable_base = Math.max(0, final_amount - used_value);
  const penalty_amount = Math.round(refundable_base * policy.refund_penalty_rate);
  const refund_amount = Math.max(0, refundable_base - penalty_amount);

  return {
    used_count,
    unit_price,
    used_value,
    refundable_base,
    penalty_amount,
    refund_amount,
    restored_count: remaining_count,
  };
}
