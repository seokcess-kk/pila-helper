/**
 * 수강권 차감 상태머신 — canon §3.9(pass_txn_reason) · §6.1 정책.
 * 순수 함수: 이벤트 + 정책 + 현재 소진여부 → 잔여 증감(delta)·사유·소진여부.
 * 차감 시점(예약 시 vs 출석 시)은 `deduct_timing` 정책으로 분기.
 * 상세 규칙: docs/spec/14-booking-policy.md
 */
import type { DeductTiming, PassTxnReason } from '../domain/index.js';

export type DeductionEvent =
  | 'book' // 예약 생성
  | 'attend' // 출석 확정
  | 'no_show' // 노쇼
  | 'cancel' // 예약 취소
  | 'session_closed'; // 수업 폐강

export interface DeductionInput {
  deduct_timing: DeductTiming;
  no_show_deduct: boolean;
  late_cancel_deduct: boolean;
  /** 현재 이 예약이 이미 1회 차감(소진)된 상태인가 */
  consumed: boolean;
  /** 횟수권 여부(false=기간/무제한권은 차감하지 않음) */
  is_count_pass: boolean;
  /** 취소가 취소마감 이후(지각취소)인가 (event='cancel'일 때만 의미) */
  is_late_cancel?: boolean;
}

export interface DeductionResult {
  /** 잔여횟수 증감 (−1 차감 / +1 복구 / 0 변화없음) */
  delta: number;
  /** 기록할 사유 (변화 없으면 null) */
  reason: PassTxnReason | null;
  /** 처리 후 이 예약의 소진 여부 */
  consumed: boolean;
}

const NOOP = (consumed: boolean): DeductionResult => ({ delta: 0, reason: null, consumed });

/** 이벤트별 차감/복구 결정 (canon §6.1) */
export function computeDeduction(event: DeductionEvent, input: DeductionInput): DeductionResult {
  // 기간/무제한권은 횟수 차감 대상이 아님
  if (!input.is_count_pass) return NOOP(input.consumed);

  const onBooking = input.deduct_timing === 'on_booking';

  switch (event) {
    case 'book':
      // 예약 시 차감 정책이면 즉시 1회 차감
      return onBooking
        ? { delta: -1, reason: 'deduct_booking', consumed: true }
        : NOOP(false);

    case 'attend':
      // 이미 차감됐으면 유지, 아니면 출석 시 차감
      return input.consumed ? NOOP(true) : { delta: -1, reason: 'deduct_attend', consumed: true };

    case 'no_show':
      if (input.no_show_deduct) {
        // 노쇼 차감 정책: 미차감이면 차감, 이미 차감이면 유지
        return input.consumed ? NOOP(true) : { delta: -1, reason: 'deduct_attend', consumed: true };
      }
      // 노쇼 무차감: 예약 시 차감해 둔 게 있으면 복구
      return input.consumed ? { delta: +1, reason: 'restore_cancel', consumed: false } : NOOP(false);

    case 'cancel': {
      const lateCancel = input.is_late_cancel === true;
      if (lateCancel && input.late_cancel_deduct) {
        // 지각취소 차감(canon §14 #10): on_booking 은 차감 유지(NOOP), on_attend 미차감분은 deduct_attend
        return input.consumed ? NOOP(true) : { delta: -1, reason: 'deduct_attend', consumed: true };
      }
      // 정상취소: 차감된 게 있으면 복구
      return input.consumed ? { delta: +1, reason: 'restore_cancel', consumed: false } : NOOP(false);
    }

    case 'session_closed':
      // 폐강: 차감된 전원 복구
      return input.consumed ? { delta: +1, reason: 'restore_close', consumed: false } : NOOP(false);

    default:
      return NOOP(input.consumed);
  }
}
