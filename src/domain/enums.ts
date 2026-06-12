/**
 * 도메인 enum 사전 — `docs/spec/00-canon.md` §3 과 1:1 정합.
 * 저장값은 영문 코드(snake_case), `LABEL` 맵은 UI 표시용 한글 라벨.
 * 값 집합 변경은 canon 개정으로만. (SSOT: 00-canon.md)
 */

// 3.1 회원 상태
export type MemberStatus =
  | 'new_inquiry'
  | 'consulting'
  | 'trial_booked'
  | 'trial_done'
  | 'enrolled'
  | 'dormant'
  | 'expired'
  | 're_enrolled';
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  new_inquiry: '신규문의',
  consulting: '상담중',
  trial_booked: '체험예약',
  trial_done: '체험완료',
  enrolled: '등록완료',
  dormant: '휴면',
  expired: '만료',
  re_enrolled: '재등록완료',
};

// 3.2 상담(리드) 상태
export type LeadStatus =
  | 'new_inquiry'
  | 'contacted'
  | 'trial_booked'
  | 'trial_done'
  | 'enrolled'
  | 'on_hold'
  | 'lost';
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new_inquiry: '신규문의',
  contacted: '연락완료',
  trial_booked: '체험예약',
  trial_done: '체험완료',
  enrolled: '등록완료',
  on_hold: '보류',
  lost: '실패(미등록)',
};

// 3.3 수업 유형
export type ClassType = 'personal' | 'group' | 'trial';
export const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  personal: '1:1 개인레슨',
  group: '그룹레슨',
  trial: '체험수업',
};

// 3.4 수업 회차 상태
export type SessionStatus = 'scheduled' | 'open' | 'closed' | 'canceled' | 'completed';
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: '예정',
  open: '예약가능',
  closed: '예약마감',
  canceled: '폐강',
  completed: '종료',
};

// 3.5 예약 상태
export type ReservationStatus =
  | 'booked'
  | 'waitlisted'
  | 'attended'
  | 'absent'
  | 'no_show'
  | 'canceled';
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  booked: '예약완료',
  waitlisted: '대기',
  attended: '출석',
  absent: '결석',
  no_show: '노쇼',
  canceled: '취소',
};

// 3.6 출석 상태
export type AttendanceStatus = 'attended' | 'late' | 'absent' | 'no_show' | 'excused';
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  attended: '출석',
  late: '지각',
  absent: '결석',
  no_show: '노쇼',
  excused: '사유결석',
};

// 3.7 수강권 종류
export type PassKind = 'personal' | 'group' | 'trial' | 'package';
export const PASS_KIND_LABEL: Record<PassKind, string> = {
  personal: '1:1권',
  group: '그룹권',
  trial: '체험권',
  package: '패키지권',
};

// 3.8 수강권 상태
export type PassStatus = 'active' | 'paused' | 'expired' | 'refunded' | 'used_up';
export const PASS_STATUS_LABEL: Record<PassStatus, string> = {
  active: '사용중',
  paused: '정지',
  expired: '만료',
  refunded: '환불',
  used_up: '소진완료',
};

// 3.9 수강권 증감 사유
export type PassTxnReason =
  | 'deduct_booking'
  | 'deduct_attend'
  | 'restore_cancel'
  | 'restore_close'
  | 'manual_deduct'
  | 'manual_restore';
export const PASS_TXN_REASON_LABEL: Record<PassTxnReason, string> = {
  deduct_booking: '예약차감',
  deduct_attend: '출석차감',
  restore_cancel: '취소복구',
  restore_close: '폐강복구',
  manual_deduct: '수동차감',
  manual_restore: '수동복구',
};

// 3.10 결제 상태
export type PaymentStatus = 'paid' | 'awaiting_deposit' | 'partial' | 'receivable' | 'refunded';
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: '결제완료',
  awaiting_deposit: '입금대기',
  partial: '일부입금',
  receivable: '미수금',
  refunded: '환불완료',
};

// 3.11 결제 수단
export type PaymentMethod = 'card_onsite' | 'transfer' | 'cash' | 'online';
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card_onsite: '현장카드',
  transfer: '계좌이체',
  cash: '현금',
  online: '온라인결제',
};

// 3.12 매출 인식 기준 (이중 손익의 핵심)
export type RevenueBasis = 'payment' | 'consumption';
export const REVENUE_BASIS_LABEL: Record<RevenueBasis, string> = {
  payment: '결제기준',
  consumption: '소진기준',
};

// revenue_records.source_type
export type RevenueSourceType = 'payment' | 'refund' | 'consumption';

// 3.13 비용 카테고리 (17종)
export type ExpenseCategory =
  | 'rent'
  | 'maintenance_fee'
  | 'payroll'
  | 'instructor_fee'
  | 'advertising'
  | 'payment_fee'
  | 'supplies'
  | 'facility'
  | 'utilities'
  | 'telecom'
  | 'tax_accounting'
  | 'education'
  | 'insurance'
  | 'tax'
  | 'meal'
  | 'transport'
  | 'etc';
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: '임대료',
  maintenance_fee: '관리비',
  payroll: '인건비',
  instructor_fee: '강사료',
  advertising: '광고비',
  payment_fee: '결제수수료',
  supplies: '소모품비',
  facility: '시설관리비',
  utilities: '공과금',
  telecom: '통신비',
  tax_accounting: '세무기장료',
  education: '교육비',
  insurance: '보험료',
  tax: '세금',
  meal: '식대',
  transport: '교통비',
  etc: '기타',
};

// 3.14 비용 성격
export type CostType = 'fixed' | 'variable';
export const COST_TYPE_LABEL: Record<CostType, string> = {
  fixed: '고정비',
  variable: '변동비',
};

/** 카테고리별 기본 cost_type (canon §3.13) */
export const EXPENSE_CATEGORY_DEFAULT_COST: Record<ExpenseCategory, CostType> = {
  rent: 'fixed',
  maintenance_fee: 'fixed',
  payroll: 'fixed',
  instructor_fee: 'variable',
  advertising: 'variable',
  payment_fee: 'variable',
  supplies: 'variable',
  facility: 'variable',
  utilities: 'variable',
  telecom: 'fixed',
  tax_accounting: 'fixed',
  education: 'variable',
  insurance: 'fixed',
  tax: 'variable',
  meal: 'variable',
  transport: 'variable',
  etc: 'variable',
};

// 3.16 유입경로
export type MarketingSource =
  | 'naver_place'
  | 'naver_blog'
  | 'instagram'
  | 'referral'
  | 'offline'
  | 'ad'
  | 'etc';
export const MARKETING_SOURCE_LABEL: Record<MarketingSource, string> = {
  naver_place: '네이버 플레이스',
  naver_blog: '네이버 블로그',
  instagram: '인스타그램',
  referral: '지인소개',
  offline: '오프라인',
  ad: '광고',
  etc: '기타',
};
export const MARKETING_SOURCE_IS_PAID: Record<MarketingSource, boolean> = {
  naver_place: false,
  naver_blog: false,
  instagram: false,
  referral: false,
  offline: false,
  ad: true,
  etc: false,
};

// 3.17 회원 태그
export type MemberTag =
  | 'no_show_risk'
  | 're_enroll_likely'
  | 'long_absent'
  | 'vip'
  | 'trial'
  | 'expiring'
  | 'receivable';
export const MEMBER_TAG_LABEL: Record<MemberTag, string> = {
  no_show_risk: '노쇼주의',
  re_enroll_likely: '재등록유력',
  long_absent: '장기미방문',
  vip: 'VIP',
  trial: '체험고객',
  expiring: '만료임박',
  receivable: '미수금',
};

// 3.18 역할 (7종)
export type Role =
  | 'saas_admin'
  | 'owner'
  | 'manager'
  | 'info_staff'
  | 'instructor'
  | 'accountant'
  | 'member';
export const ROLE_LABEL: Record<Role, string> = {
  saas_admin: 'SaaS 최고관리자',
  owner: '샵 오너',
  manager: '샵 관리자',
  info_staff: '인포 직원',
  instructor: '강사',
  accountant: '회계 담당자',
  member: '회원',
};

// 3.19 거래 분류 대상
export type MatchTarget = 'revenue' | 'expense' | 'transfer' | 'etc';
export const MATCH_TARGET_LABEL: Record<MatchTarget, string> = {
  revenue: '매출',
  expense: '비용',
  transfer: '이체',
  etc: '기타',
};

// 3.20 알림 유형 (13종)
export type NotificationType =
  | 'reservation_done'
  | 'reservation_reminder'
  | 'reservation_canceled'
  | 'waitlist_promoted'
  | 'pass_expiring'
  | 'pass_low_count'
  | 'long_absence'
  | 'trial_guide'
  | 'trial_followup'
  | 're_enroll'
  | 'receivable'
  | 'review_request'
  | 'counseling_reminder';
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  reservation_done: '예약 완료',
  reservation_reminder: '예약 전 리마인드',
  reservation_canceled: '예약 취소',
  waitlist_promoted: '대기 확정',
  pass_expiring: '수강권 만료 예정',
  pass_low_count: '잔여횟수 부족',
  long_absence: '장기 미방문',
  trial_guide: '체험 전 안내',
  trial_followup: '체험 후 등록 상담',
  re_enroll: '재등록',
  receivable: '미수금',
  review_request: '리뷰 요청',
  counseling_reminder: '상담 리마인드',
};

// 3.21 카드매출 정산 단계
export type ReconciliationStage = 'approved' | 'captured' | 'deposited';
export const RECONCILIATION_STAGE_LABEL: Record<ReconciliationStage, string> = {
  approved: '승인',
  captured: '매입',
  deposited: '입금',
};

// 결제 차감 시점 정책값 (canon §6.1 deduct_timing)
export type DeductTiming = 'on_booking' | 'on_attend';

// 통장 거래 방향
export type BankDirection = 'deposit' | 'withdraw';

// 성별
export type Gender = 'male' | 'female' | 'other';
export const GENDER_LABEL: Record<Gender, string> = {
  male: '남성',
  female: '여성',
  other: '기타',
};
