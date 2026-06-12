/**
 * 스튜디오 정책 파라미터 — canon §6. `studios.policy_json` 에 저장되며 스튜디오별 오버라이드.
 * 규칙 엔진(booking/pass/refund)이 이 값을 읽어 판정한다.
 */
import type { DeductTiming } from './enums.js';

export interface BookingPolicy {
  /** 예약 오픈: 수업 N일 전부터 (§6.1) */
  booking_open_days: number;
  /** 예약 마감: 시작 N분 전까지 */
  booking_close_minutes: number;
  /** 취소 마감: 시작 N분 전까지 무차감 */
  cancel_deadline_minutes: number;
  /** 1일 예약 한도 (null=무제한) */
  daily_booking_limit: number | null;
  /** 차감 시점: 예약 시 vs 출석 시 */
  deduct_timing: DeductTiming;
  /** 노쇼 차감 여부 */
  no_show_deduct: boolean;
  /** 취소마감 이후 취소(지각취소) 차감 여부 */
  late_cancel_deduct: boolean;
  /** 결원 시 대기 1순위 자동 확정 */
  waitlist_auto_promote: boolean;
  /** 자동전환 후 무응답 만료(분) */
  waitlist_promote_ttl_minutes: number;
  /** 자동 폐강 최소 인원 (미만 시 폐강 후보) */
  auto_close_min_count: number;
}

export interface PassPolicy {
  holdable: boolean;
  max_hold_days: number;
  extend_allowed: boolean;
  /** 잔여 부족 알림 임계(이하) */
  low_count_threshold: number;
  /** 만료 임박 알림(일 전) */
  expiring_alert_days: number;
}

export interface FinancePolicy {
  /** 결제기준 인식 시점 */
  revenue_recognition: 'on_paid' | 'on_deposit';
  allow_receivable: boolean;
  /** 환불 위약 공제율 */
  refund_penalty_rate: number;
  /** 사용분 공제 단가 기준 */
  refund_unit_basis: 'list_price' | 'final_price';
  /** 카드매출 수수료 추정율 */
  card_fee_rate: number;
}

export interface NotificationPolicy {
  reminder_before_minutes: number;
  long_absence_days: number;
  default_channel: 'sms' | 'kakao' | 'push' | 'email';
}

export interface StudioPolicy {
  booking: BookingPolicy;
  pass: PassPolicy;
  finance: FinancePolicy;
  notification: NotificationPolicy;
}

/** 시스템 기본값 (canon §6) */
export const DEFAULT_POLICY: StudioPolicy = {
  booking: {
    booking_open_days: 14,
    booking_close_minutes: 60,
    cancel_deadline_minutes: 120,
    daily_booking_limit: 1,
    deduct_timing: 'on_attend',
    no_show_deduct: true,
    late_cancel_deduct: true,
    waitlist_auto_promote: true,
    waitlist_promote_ttl_minutes: 30,
    auto_close_min_count: 1,
  },
  pass: {
    holdable: true,
    max_hold_days: 30,
    extend_allowed: true,
    low_count_threshold: 2,
    expiring_alert_days: 7,
  },
  finance: {
    revenue_recognition: 'on_paid',
    allow_receivable: true,
    refund_penalty_rate: 0.1,
    refund_unit_basis: 'list_price',
    card_fee_rate: 0.023,
  },
  notification: {
    reminder_before_minutes: 1440,
    long_absence_days: 21,
    default_channel: 'sms',
  },
};
